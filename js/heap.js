import {
    FIX_LIST_PASSIVE,
    FIX_LIST_FREE_SINGLE,
    FIX_LIST_FREE_MULTIPLE,
    FIX_LIST_LOSS_ZERO,
    FIX_LIST_LOSS_ONE_SINGLE,
    FIX_LIST_LOSS_ONE_MULTIPLE,
    FIX_LIST_LOSS_TWO,
    FIX_LIST_SECTIONS
} from './constants.js';

export class Heap {
    static FIX_LIST_SECTIONS = FIX_LIST_SECTIONS;

    constructor() {
        this.active = true;
        this.size = 0;
        this.root = null;
        this.rank_list = null;

        this.passive = null;
        this.free_multiple = null;
        this.free_single = null;
        this.loss_zero = null;
        this.loss_one_multiple = null;
        this.loss_one_single = null;
        this.loss_two = null;
    }

    gt(other) {
        return this.size > other.size;
    }

    ////////////////////////////////////////////////////////////////////
    //                           Operations                           //
    ////////////////////////////////////////////////////////////////////

    meld(other) {
        if (!(other instanceof Heap)) throw new Error('Argument must be a Heap');

        let smaller = this;
        let larger = other;

        if (smaller.gt(other)) {
            smaller = other;
            larger = this;
        }

        smaller.active = false;

        const steps = [];

        if (smaller.size > 0) {

            steps.push({
                label: `Merge fix-lists`,
                apply: () => {
                    const smallHead = smaller.root;
                    const smallTail = smallHead.prev;
                    const largeHead = larger.fix_list_head();
                    const largeTail = largeHead.prev;
                    smallHead.prev = largeTail;
                    largeTail.nxt = smallHead;
                    largeHead.prev = smallTail;
                    smallTail.nxt = largeHead;
                    larger.passive = smallHead;
                    return [];
                }
            });

            steps.push({
                label: `Link roots ${smaller.root._key} and ${larger.root._key}`,
                nest: true,
                apply: () => {
                    const {
                        root: newRoot,
                        steps: linkSteps
                    } = larger._link(smaller.root, larger.root);
                    larger.root = newRoot;
                    larger.size += smaller.size;
                    return linkSteps;
                }
            });

            steps.push(
                ...larger._apply_reductions([
                    larger._free_node_reduction,
                    larger._root_degree_reduction
                ])
            )
        } else if (larger.size === 0) {
            steps.push({
                label: `Both heaps are empty; resulting heap is empty`,
                apply: () => []
            });
        } else {
            steps.push({
                label: `Smaller heap is empty; resulting heap is the larger heap`,
                apply: () => []
            });
        }

        return {
            larger,
            steps
        };
    }

    insert(key) {
        return [{
                label: `Create node ${key}`,
                apply: () => {
                    const newNode = new Node(key, this);
                    if (this.size === 0) {
                        return [{
                            label: `Assign node ${key} as root`,
                            apply: () => {
                                this.root = newNode;
                                this.size += 1;
                                return [];
                            }
                        }]
                    }
                    return [{
                        label: `Link ${this.root._key} and ${key}`,
                        nest: true,
                        apply: () => {
                            const {
                                root: newRoot,
                                steps: linkSteps
                            } = this._link(this.root, newNode);
                            this.root = newRoot;
                            this.size += 1;
                            return linkSteps;
                        }
                    }]
                }
            },
            ...this._apply_reductions([
                ...Array(3).fill(this._free_node_reduction),
                ...Array(2).fill(this._root_degree_reduction)
            ])
        ];
    }

    delete(node) {
        if (!node) throw new Error('Node is null');

        const steps = [];
        const MIN_KEY = Number.NEGATIVE_INFINITY;
        if (node._key !== MIN_KEY) {
            steps.push({
                label: `Decrease key of node ${node._key} to negative infinity`,
                nest: true,
                apply: () => this.decrease_key(node, MIN_KEY)
            });
        }

        steps.push({
            label: `Delete the new minimum node`,
            nest: true,
            apply: () => this.delete_min()
        });

        return steps;
    }

    delete_min() {
        if (!this.root) throw new Error('root is None');

        const z = this.root;

        if (z.left_child === null) {
            if (this.size !== 1) throw new Error('invalid heap size');
            return [{
                label: `Retire the root node ${z._key}`,
                apply: () => {
                    this.root = null;
                    z.retire(this);
                    return [];
                }
            }]
        }

        const steps = [];

        let x = z.children().reduce((minNode, node) => node._key < minNode._key ? node : minNode, z.left_child);

        if (x.fixed()) {
            steps.push({
                label: `Change node ${x._key} from fixed to free`,
                nest: true,
                apply: () => {
                    x.fixed2free();
                    return [];
                }
            });
        }

        steps.push({
            label: `Cut node ${x._key}`,
            nest: true,
            apply: () => {
                x.cut();
                return [];
            }
        });

        function free_children(heap) {
            const c = z.left_child;
            if (c === null) return [];
            const subSteps = [];
            subSteps.push({
                silent: true,
                apply: () => {
                    if (c.fixed()) {
                        subSteps.push({
                            label: `Change node ${c._key} from fixed to free`,
                            nest: true,
                            apply: () => {
                                c.fixed2free();
                                return [];
                            }
                        });
                    }
                }
            })
            subSteps.push({
                label: `Link ${x._key} and ${c._key}`,
                nest: true,
                apply: () => {
                    const {
                        steps: linkSteps
                    } = heap._link(x, c);
                    return linkSteps;
                }
            })
            return [{
                silent: true,
                apply: () => [...subSteps, {
                    silent: true,
                    apply: () => free_children(heap)
                }]
            }];
        }

        steps.push({
            silent: true,
            apply: () => free_children(this)
        });

        steps.push({
            label: `Assign node ${x._key} as new root`,
            apply: () => {
                this.root = x;
                return [];
            }
        });

        steps.push({
            label: `Retire the old root node ${z._key}`,
            apply: () => {
                z.retire(this);
                return [];
            }
        });

        if (this.passive !== null) {
            steps.push({
                label: `Passive reduction`,
                nest: true,
                apply: () => this._passive_reduction()
            });
        }

        function apply_reductions(heap, reductions) {
            for (let i = 0; i < reductions.length; i++) {
                const r = reductions[i];
                const {
                    steps: rSteps,
                    applied
                } = r.call(heap);
                if (applied) {
                    return [
                        ...rSteps,
                        {
                            silent: true,
                            apply: () => apply_reductions(heap, reductions)
                        }
                    ];
                }
            }
            return [];
        }

        steps.push({
            silent: true,
            apply: () => {
                return [
                    ...apply_reductions(this, [this._one_node_loss_reduction, this._two_node_loss_reduction]),
                    ...apply_reductions(this, [this._free_node_reduction, this._root_degree_reduction])
                ]
            }
        })

        return steps;
    }

    decrease_key(node, new_key) {
        if (!(new_key < node._key)) throw new Error('new_key not smaller');

        const steps = [];

        steps.push({
            label: `Decrease key of node ${node._key} to ${new_key}`,
            nest: true,
            apply: () => {
                node._key = new_key;
                return [];
            }
        });

        if (node === this.root || new_key > node.parent._key) return steps;

        if (node.fixed()) {
            steps.push({
                label: `Change node ${node._key} from fixed to free`,
                apply: () => {
                    node.fixed2free();
                    return [];
                }
            });
        }

        steps.push({
            label: `Cut node ${node._key}`,
            apply: () => {
                node.cut();
                return [];
            }
        });

        steps.push({
            label: `Link node ${node._key} to root ${this.root._key}`,
            nest: true,
            apply: () => {
                const {
                    root: newRoot,
                    steps: linkSteps
                } = this._link(node, this.root);
                this.root = newRoot;
                return linkSteps;
            }
        });

        steps.push({
            silent: true,
            apply: () => {
                const {
                    steps: subSteps,
                    applied
                } = this._two_node_loss_reduction();
                if (applied) {
                    return subSteps;
                }
                const {
                    steps: subSteps2
                } = this._one_node_loss_reduction();
                return subSteps2;
            }
        });

        steps.push(
            ...this._apply_reductions([
                ...Array(6).fill(this._free_node_reduction.bind(this)),
                ...Array(4).fill(this._root_degree_reduction.bind(this)),
            ])
        )

        return steps;
    }

    ////////////////////////////////////////////////////////////////////
    //                        Transformations                         //
    ////////////////////////////////////////////////////////////////////

    _link(x, y) {
        if (x.gt(y))[x, y] = [y, x];

        const steps = []

        if (y.parent !== null) {
            steps.push({
                label: `Cut node ${y._key}`,
                apply: () => {
                    y.cut();
                    return [];
                }
            });
        }

        steps.push({
            label: `Add node ${y._key} as child of ${x._key}`,
            apply: () => {
                x.add_child(y);
                return [];
            }
        });

        return {
            root: x,
            steps
        };
    }

    _free_node_reduction() {
        if (this.free_multiple === null) return {
            steps: [],
            applied: false
        };

        let x = this.free_multiple;
        let y = x.nxt;

        if (x === y) throw new Error('invalid free_multiple');
        if (x.gt(y))[x, y] = [y, x];

        const steps = [];

        steps.push({
            label: `Cut node ${y._key}`,
            apply: () => {
                y.cut();
                return [];
            }
        });

        steps.push({
            label: `Change node ${y._key} from free to fixed`,
            apply: () => {
                y.free2fixed();
                return [];
            }
        });

        steps.push({
            label: `Add node ${y._key} as child of ${x._key}`,
            apply: () => {
                x.add_child(y);
                const z = x.left_child.left;
                if (z.passive()) {
                    return [{
                        label: `Link passive node ${z._key} to root`,
                        nest: true,
                        apply: () => {
                            const {
                                steps: subSteps
                            } = this._link(z, this.root);
                            return subSteps;
                        }
                    }];
                }
                return [];
            }
        });

        return {
            steps: [{
                label: 'Perform free node reduction',
                nest: true,
                apply: () => steps
            }],
            applied: true
        };
    }

    _root_degree_reduction() {
        if (!this.root) throw new Error('root is None');
        if (!this.root.left_child) return {
            steps: [],
            applied: false
        };

        let x = this.root.left_child.left;
        let y = x.left;
        let z = y.left;

        if (x === y || x === z || z.active()) return {
            steps: [],
            applied: false
        };

        const steps = [];

        // --- Cuts ---
        steps.push({
            label: `Cut node ${z._key}`,
            nest: true,
            apply: () => {
                z.cut();
                return [];
            }
        });
        steps.push({
            label: `Cut node ${y._key}`,
            nest: true,
            apply: () => {
                y.cut();
                return [];
            }
        });
        steps.push({
            label: `Cut node ${x._key}`,
            nest: true,
            apply: () => {
                x.cut();
                return [];
            }
        });

        // --- Passive → free ---
        steps.push({
            label: `Change node ${z._key} from passive to free`,
            nest: true,
            apply: () => {
                z.passive2free(this);
                return [];
            }
        });
        steps.push({
            label: `Change node ${y._key} from passive to free`,
            nest: true,
            apply: () => {
                y.passive2free(this);
                return [];
            }
        });
        steps.push({
            label: `Change node ${x._key} from passive to free`,
            nest: true,
            apply: () => {
                x.passive2free(this);
                return [];
            }
        });

        // --- Sort by key ---
        steps.push({
            label: `Sort nodes ${x._key}, ${y._key}, ${z._key} by key`,
            nest: true,
            apply: () => {
                if (z.gt(y))[z, y] = [y, z];
                if (y.gt(x)) {
                    [y, x] = [x, y];
                    if (z.gt(y))[z, y] = [y, z];
                }
                return [];
            }
        });

        // --- Free → fixed ---
        steps.push({
            label: `Change node ${y._key} from free to fixed`,
            nest: true,
            apply: () => {
                y.free2fixed();
                return [];
            }
        });
        steps.push({
            label: `Change node ${x._key} from free to fixed`,
            nest: true,
            apply: () => {
                x.free2fixed();
                return [];
            }
        });

        // --- Add children ---
        steps.push({
            label: `Add node ${z._key} as child of root`,
            nest: true,
            apply: () => {
                this.root.add_child(z);
                return [];
            }
        });
        steps.push({
            label: `Add node ${y._key} as child of ${z._key}`,
            nest: true,
            apply: () => {
                z.add_child(y);
                return [];
            }
        });
        steps.push({
            label: `Add node ${x._key} as child of ${y._key}`,
            nest: true,
            apply: () => {
                y.add_child(x);
                return [];
            }
        });

        return {
            steps: [{
                label: 'Perform root degree reduction',
                nest: true,
                apply: () => steps
            }],
            applied: true
        };
    }

    _one_node_loss_reduction() {
        const x = this.loss_two;

        if (x === null) {
            return {
                steps: [],
                applied: false
            };
        }

        return {
            steps: [{
                label: 'Perform one node loss reduction',
                nest: true,
                apply: () => [{
                    label: `Change node ${x._key} from fixed to free`,
                    nest: true,
                    apply: () => x.fixed2free()
                }],
            }],
            applied: true
        };
    }

    _two_node_loss_reduction() {
        let x = this.loss_one_multiple;
        if (x === null) return {
            steps: [],
            applied: false
        };

        let y = x.nxt;
        if (!y || y === x) throw new Error('invalid loss_one_multiple');
        if (x.loss !== 1 || y.loss !== 1) throw new Error('invalid loss count');

        if (x.gt(y))[x, y] = [y, x];

        const steps = [];

        steps.push({
            label: `Cut node ${y._key}`,
            apply: () => y.cut()
        });

        steps.push({
            label: `Decrease loss of node ${x._key}`,
            apply: () => {
                x._decrease_loss();
            }
        });
        steps.push({
            label: `Decrease loss of node ${y._key}`,
            apply: () => {
                y._decrease_loss();
            }
        });

        steps.push({
            label: `Add node ${y._key} as child of ${x._key}`,
            apply: () => {
                x.add_child(y);
                const z = x.left_child.left;
                if (z.passive()) {
                    return [{
                        label: `Link passive node ${z._key} to root`,
                        nest: true,
                        apply: () => {
                            const {
                                steps: subSteps
                            } = this._link(z, this.root);
                            return subSteps;
                        }
                    }];
                }
                return [];
            }
        });

        return {
            steps: [{
                label: 'Perform two node loss reduction',
                nest: true,
                apply: () => steps
            }],
            applied: true
        };
    }

    _passive_reduction(count = 0) {
        if (count >= 3 || this.passive === null) return [];

        const n = this.passive;

        return [{
            label: `Change node ${n._key} from passive to free`,
            apply: () => {
                const steps = []
                n.passive2free(this)
                const p = n.parent;
                if (p !== null) {
                    const {
                        steps: linkSteps
                    } = this._link(n, p);
                    steps.push(...linkSteps);
                }
                steps.push(...this._passive_reduction(count + 1));
                return steps;
            }
        }];
    }

    _apply_reductions(reductions) {
        return [{
            silent: true,
            apply: () => {
                for (let i = 0; i < reductions.length; i++) {
                    const r = reductions[i];
                    const {
                        steps,
                        applied
                    } = r.call(this);
                    if (applied) {
                        const remaining = reductions.slice(0, i).concat(reductions.slice(i + 1));
                        return [
                            ...steps,
                            ...this._apply_reductions(remaining)
                        ];
                    }
                }
                return [];
            }
        }]
    }

    ////////////////////////////////////////////////////////////////////
    //                       Auxiliary methods                        //
    ////////////////////////////////////////////////////////////////////

    empty() {
        return this.size === 0;
    }

    rank_zero() {
        if (this.rank_list === null) {
            this.rank_list = new Rank(0, this);
        }
        this.rank_list.increase_refs();
        return this.rank_list;
    }

    fix_list_head() {
        for (const section of Heap.FIX_LIST_SECTIONS) {
            const node = this[section];
            if (node !== null) {
                return node;
            }
        }
        return null;
    }
}

class Node {
    constructor(key, heap) {
        if (key == null) throw new Error('key is None');
        if (!heap) throw new Error('heap is None');

        Node._nextId = (Node._nextId || 0) + 1;
        this._id = Node._nextId;

        this._key = key;

        this.left = this;
        this.right = this;
        this.parent = null;
        this.left_child = null;

        this._fixed = false;
        this._free = true;
        this.loss = 0;

        this._rank = heap.rank_zero();

        this.prev = this;
        this.nxt = this;

        this._fix_list_add();
    }

    /* =========================
       Comparisons / printing
       ========================= */

    gt(other) {
        return this._key > other._key;
    }

    /* =========================
       Getters
       ========================= */

    active() {
        return this.heap().active;
    }

    passive() {
        return !this.active();
    }

    free() {
        return this.active() && this._free;
    }

    fixed() {
        return this.active() && this._fixed;
    }

    heap() {
        return this._rank.heap;
    }

    rank() {
        return this._rank.rank;
    }

    section() {
        if (this.passive()) {
            return FIX_LIST_PASSIVE;
        } else if (this.free()) {
            if (
                (this.prev !== this && this.prev.free() && this.prev.rank() === this.rank()) ||
                (this.nxt !== this && this.nxt.free() && this.nxt.rank() === this.rank())
            ) {
                return FIX_LIST_FREE_MULTIPLE;
            } else {
                return FIX_LIST_FREE_SINGLE;
            }
        } else {
            if (!this.fixed()) throw new Error('expected fixed');
            if (this.loss === 0) {
                return FIX_LIST_LOSS_ZERO;
            } else if (this.loss === 1) {
                if (
                    (this.prev !== this &&
                        this.prev.fixed() &&
                        this.prev.rank() === this.rank() &&
                        this.prev.loss === 1) ||
                    (this.nxt !== this &&
                        this.nxt.fixed() &&
                        this.nxt.rank() === this.rank() &&
                        this.nxt.loss === 1)
                ) {
                    return FIX_LIST_LOSS_ONE_MULTIPLE;
                } else {
                    return FIX_LIST_LOSS_ONE_SINGLE;
                }
            } else {
                return FIX_LIST_LOSS_TWO;
            }
        }
    }

    twin_count(heap) {
        let count = 0;
        let node = heap[this.section()];
        if (node !== null) {
            const start = node;
            while (true) {
                if (node.rank() === this.rank()) count++;
                node = node.nxt;
                if (node.section() !== this.section() || node === start) break;
            }
        }
        return count;
    }

    children() {
        const out = [];
        if (this.left_child === null) return out;

        let c = this.left_child;
        const first = c;
        while (true) {
            out.push(c);
            c = c.right;
            if (c === first) break;
        }
        return out;
    }

    /* =========================
       Operations
       ========================= */

    retire(heap) {
        if (!heap.active) throw new Error('heap not active');
        if (!(this.passive() || this.heap() === heap)) throw new Error('wrong heap');
        if (this.parent !== null) throw new Error('parent not null');
        if (this.left_child !== null) throw new Error('has children');
        if (!(this.left === this && this.right === this)) throw new Error('links broken');

        this._fix_list_remove(heap);
        heap.size -= 1;
        this._rank.reduce_refs();
    }

    cut() {
        if (!this.left || !this.right) throw new Error('invalid links');

        const parent = this.parent;
        const left = this.left;
        const right = this.right;

        this.parent = null;

        if (parent && parent.left_child === this) {
            parent.left_child = right !== this ? right : null;
        }

        if (right !== this) {
            left.right = right;
            right.left = left;
            this.left = this;
            this.right = this;
        }

        if (parent && this.fixed() && parent.active()) {
            parent._decrease_rank();
            if (parent.fixed()) parent._increase_loss();
        }
    }

    add_child(child) {
        child.parent = this;

        if (this.left_child === null) {
            this.left_child = child;
        } else {
            child.right = this.left_child;
            child.left = child.right.left;
            child.right.left = child;
            child.left.right = child;
            if (child.active()) this.left_child = child;
        }

        if (this.active() && child.fixed()) {
            this._increase_rank();
        }
    }

    passive2free(heap) {
        if (!this.passive()) throw new Error('not passive');

        this._fix_list_remove(heap);
        this._rank.reduce_refs();
        this._rank = heap.rank_zero();

        this._fixed = false;
        this._free = true;
        this.loss = 0;

        if (this.parent !== null) {
            this.heap()._link(this, this.parent);
        }

        this._fix_list_add();
    }

    free2fixed() {
        if (!this.free()) throw new Error('not free');

        this._fix_list_remove(this.heap());
        this._free = false;
        this._fixed = true;
        this.loss = 0;
        this._fix_list_add();

        if (this.parent && this.parent.active()) {
            this.parent._increase_rank();
        }
    }

    fixed2free() {
        if (!this.fixed()) throw new Error('not fixed');

        const parent = this.parent;
        if (!parent || !parent.active()) throw new Error('bad parent');

        this._fix_list_remove(this.heap());
        this._free = true;
        this._fixed = false;
        this.loss = 0;
        this._fix_list_add();

        parent._decrease_rank();
        if (parent.fixed()) parent._increase_loss();
    }

    /* =========================
       Fix-list logic
       ========================= */

    _fix_list_attach(section) {
        const heap = this.heap();
        const head = heap[section];
        heap[section] = this;

        if (head === null) {
            const right = this._get_next_section(section);
            right._add_prev(this);
        } else {
            head._add_prev(this);
        }
    }

    _fix_list_detach(heap) {
        for (const section of Heap.FIX_LIST_SECTIONS) {
            if (heap[section] === this) {
                heap[section] =
                    this.nxt !== this && this.nxt.section() === section ? this.nxt : null;
                break;
            }
        }

        if (this.nxt !== this) {
            this.prev.nxt = this.nxt;
            this.nxt.prev = this.prev;
            this.prev = this;
            this.nxt = this;
        }
    }

    _fix_list_add() {
        if (this.passive()) {
            this._fix_list_attach(FIX_LIST_PASSIVE);
        } else if (this.free()) {
            const first = this._rank.free;
            if (first === null) {
                this._rank.free = this;
                this._fix_list_attach(FIX_LIST_FREE_SINGLE);
            } else if (first.twin_count(first.heap()) >= 2) {
                first._add_next(this);
            } else {
                first._fix_list_detach(this.heap());
                this._fix_list_attach(FIX_LIST_FREE_MULTIPLE);
                first._fix_list_attach(FIX_LIST_FREE_MULTIPLE);
            }
        } else {
            if (!this.fixed()) throw new Error('expected fixed');

            if (this.loss === 0) {
                this._fix_list_attach(FIX_LIST_LOSS_ZERO);
            } else if (this.loss === 1) {
                const first = this._rank.loss_one;
                if (first === null) {
                    this._rank.loss_one = this;
                    this._fix_list_attach(FIX_LIST_LOSS_ONE_SINGLE);
                } else if (first.twin_count(first.heap()) >= 2) {
                    first._add_next(this);
                } else {
                    first._fix_list_detach(this.heap());
                    this._fix_list_attach(FIX_LIST_LOSS_ONE_MULTIPLE);
                    first._fix_list_attach(FIX_LIST_LOSS_ONE_MULTIPLE);
                }
            } else {
                this._fix_list_attach(FIX_LIST_LOSS_TWO);
            }
        }
    }

    _fix_list_remove(heap) {
        const succ = this.nxt;
        const head = heap.fix_list_head();

        if (this.active() && this._rank.free === this) {
            if (
                succ !== head &&
                succ.free() &&
                succ._rank === this._rank
            ) {
                this._rank.free = succ;
            } else {
                this._rank.free = null;
            }
        }

        if (this.active() && this._rank.loss_one === this) {
            if (
                succ !== head &&
                succ.fixed() &&
                succ.loss === 1 &&
                succ._rank === this._rank
            ) {
                this._rank.loss_one = succ;
            } else {
                this._rank.loss_one = null;
            }
        }

        const twin = this._get_twin(heap);
        this._fix_list_detach(heap);

        if (twin !== null) {
            twin._fix_list_detach(heap);
            twin._fix_list_attach(twin.section());
        }
    }

    _get_twin(heap) {
        const sec = this.section();
        if (
            (sec !== FIX_LIST_FREE_MULTIPLE && sec !== FIX_LIST_LOSS_ONE_MULTIPLE) ||
            this.twin_count(heap) > 2
        ) {
            return null;
        }

        if (
            this.prev !== this &&
            this.prev.rank() === this.rank() &&
            this.prev.section() === sec
        ) return this.prev;

        if (
            this.nxt !== this &&
            this.nxt.rank() === this.rank() &&
            this.nxt.section() === sec
        ) return this.nxt;

        return null;
    }

    _add_prev(node) {
        node.nxt = this;
        node.prev = this.prev;
        this.prev.nxt = node;
        this.prev = node;
    }

    _add_next(node) {
        node.nxt = this.nxt;
        node.prev = this;
        this.nxt.prev = node;
        this.nxt = node;
    }

    _get_section(current, step) {
        const list = Heap.FIX_LIST_SECTIONS;
        let idx = (list.indexOf(current) + step + list.length) % list.length;

        while (true) {
            const v = this.heap()[list[idx]];
            if (v !== null) return v;
            idx = (idx + step + list.length) % list.length;
        }
    }

    _get_next_section(section) {
        return this._get_section(section, 1);
    }

    _get_prev_section(section) {
        return this._get_section(section, -1);
    }

    _decrease_rank() {
        if (this.rank() <= 0) throw new Error('rank underflow');

        const newRank = this._rank.prev();
        newRank.increase_refs();

        this._fix_list_remove(this.heap());
        this._rank.reduce_refs();
        this._rank = newRank;

        this._fix_list_add();
    }

    _increase_rank() {
        const newRank = this._rank.next();
        newRank.increase_refs();

        this._fix_list_remove(this.heap());
        this._rank.reduce_refs();
        this._rank = newRank;

        this._fix_list_add();
    }

    _decrease_loss() {
        this._fix_list_remove(this.heap());
        this.loss -= 1;
        this._fix_list_add();
    }

    _increase_loss() {
        if (this.loss < 2) {
            this._fix_list_remove(this.heap());
            this.loss += 1;
            this._fix_list_add();
        }
    }
}

class Rank {
    constructor(r, heap) {
        if (r == null || r < 0) throw new Error('invalid rank');
        if (!heap) throw new Error('heap is None');

        this.rank = r;
        this.dec = null;
        this.inc = null;
        this.heap = heap;

        this.ref_count = 0;
        this.free = null;
        this.loss_one = null;
    }

    _retire() {
        if (this.heap === null) throw new Error('heap is None');
        if (this.ref_count !== 0) throw new Error('ref_count not zero');
        if (this.heap.active && this.free !== null) throw new Error(`free is not null: ${this.free._key}`);
        if (this.heap.active && this.loss_one !== null) throw new Error('loss_one is not null');

        if (this.heap.rank_list === this) this.heap.rank_list = this.inc;
        if (this.dec !== null) this.dec.inc = this.inc;
        if (this.inc !== null) this.inc.dec = this.dec;

        this.dec = null;
        this.inc = null;
        this.heap = null;
        this.free = null;
        this.loss_one = null;
        this.rank = null;
    }

    reduce_refs() {
        if (this.ref_count <= 0) throw new Error('ref_count underflow');
        this.ref_count -= 1;

        if (this.ref_count === 0) {
            this._retire();
        }
    }

    increase_refs() {
        this.ref_count += 1;
    }

    next() {
        if (this.inc === null || this.inc.rank > this.rank + 1) this.add_new_rank();
        return this.inc;
    }

    prev() {
        if (this.rank <= 0) throw new Error('no lower rank');
        if (this.dec === null) {
            this.dec = new Rank(this.rank - 1, this.heap);
            this.dec.inc = this;
            this.heap.rank_list = this.dec;
        } else if (this.dec.rank < this.rank - 1) this.dec.add_new_rank();
        return this.dec;
    }

    add_new_rank() {
        const new_rank = new Rank(this.rank + 1, this.heap);
        if (this.inc !== null) {
            if (this.inc.rank <= this.rank + 1) throw new Error('invalid inc rank');
            this.inc.dec = new_rank;
            new_rank.inc = this.inc;
        }
        new_rank.dec = this;
        this.inc = new_rank;
    }
}