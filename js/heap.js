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
        this._active = true;
        this._size = 0;
        this._root = null;
        this._rank_list = null;

        this._passive = null;
        this._free_multiple = null;
        this._free_single = null;
        this._loss_zero = null;
        this._loss_one_multiple = null;
        this._loss_one_single = null;
        this._loss_two = null;
    }

    gt(other) {
        return this._size > other._size;
    }

    retire() {
        this._active = false;
        this._size = 0;
        this._root = null;
        this._rank_list = null;
        this._passive = null;
        this._free_multiple = null;
        this._free_single = null;
        this._loss_zero = null;
        this._loss_one_multiple = null;
        this._loss_one_single = null;
        this._loss_two = null;
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

        smaller._active = false;

        const steps = [];

        if (smaller._size > 0) {

            steps.push({
                label: `Merge fix-lists`,
                apply: () => {
                    const smallHead = smaller._root;
                    const smallTail = smallHead._prev;
                    const largeHead = larger.fix_list_head();
                    const largeTail = largeHead._prev;
                    smallHead._prev = largeTail;
                    largeTail._next = smallHead;
                    largeHead._prev = smallTail;
                    smallTail._next = largeHead;
                    larger._passive = smallHead;
                    return [];
                }
            });

            steps.push({
                label: `Link roots ${smaller._root._key} and ${larger._root._key}`,
                nest: true,
                apply: () => {
                    const {
                        root: newRoot,
                        steps: linkSteps
                    } = larger.link(smaller._root, larger._root);
                    larger._root = newRoot;
                    larger._size += smaller._size;
                    smaller.retire();
                    return linkSteps;
                }
            });

            steps.push(
                ...larger.apply_reductions([
                    larger.free_node_reduction,
                    larger.root_degree_reduction
                ])
            )
        } else if (larger._size === 0) {
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
                    if (this._size === 0) {
                        return [{
                            label: `Assign node ${key} as root`,
                            apply: () => {
                                this._root = newNode;
                                this._size += 1;
                                return [];
                            }
                        }]
                    }
                    return [{
                        label: `Link ${this._root._key} and ${key}`,
                        nest: true,
                        apply: () => {
                            const {
                                root: newRoot,
                                steps: linkSteps
                            } = this.link(this._root, newNode);
                            this._root = newRoot;
                            this._size += 1;
                            return linkSteps;
                        }
                    }]
                }
            },
            ...this.apply_reductions([
                ...Array(3).fill(this.free_node_reduction),
                ...Array(2).fill(this.root_degree_reduction)
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
        if (!this._root) throw new Error('root is None');

        const z = this._root;

        if (z._left_child === null) {
            if (this._size !== 1) throw new Error('invalid heap size');
            return [{
                label: `Retire the root node ${z._key}`,
                apply: () => {
                    this._root = null;
                    z.retire(this);
                    return [];
                }
            }]
        }

        const steps = [];

        let x = z.children().reduce((minNode, node) => node._key < minNode._key ? node : minNode, z._left_child);

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
                this.cut(x);
                return [];
            }
        });

        function free_children(heap) {
            const c = z._left_child;
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
                    } = heap.link(x, c);
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
                this._root = x;
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

        if (this._passive !== null) {
            steps.push({
                label: `Passive reduction`,
                nest: true,
                apply: () => this.passive_reduction()
            });
        }

        function reduce_while_possible(heap, reductions) {
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
                            apply: () => reduce_while_possible(heap, reductions)
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
                    ...reduce_while_possible(this, [this.one_node_loss_reduction, this.two_node_loss_reduction]),
                    ...reduce_while_possible(this, [this.free_node_reduction, this.root_degree_reduction])
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

        if (node === this._root || new_key > node._parent._key) return steps;

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
                this.cut(node);
                return [];
            }
        });

        steps.push({
            label: `Link node ${node._key} to root ${this._root._key}`,
            nest: true,
            apply: () => {
                const {
                    root: newRoot,
                    steps: linkSteps
                } = this.link(node, this._root);
                this._root = newRoot;
                return linkSteps;
            }
        });

        steps.push({
            silent: true,
            apply: () => {
                const {
                    steps: subSteps,
                    applied
                } = this.two_node_loss_reduction();
                if (applied) {
                    return subSteps;
                }
                const {
                    steps: subSteps2
                } = this.one_node_loss_reduction();
                return subSteps2;
            }
        });

        steps.push(
            ...this.apply_reductions([
                ...Array(6).fill(this.free_node_reduction.bind(this)),
                ...Array(4).fill(this.root_degree_reduction.bind(this)),
            ])
        )

        return steps;
    }

    ////////////////////////////////////////////////////////////////////
    //                        Transformations                         //
    ////////////////////////////////////////////////////////////////////

    cut(node) {
        if (!node._left || !node._right) throw new Error('invalid links');

        const parent = node._parent;
        const left = node._left;
        const right = node._right;

        node._parent = null;

        if (parent && parent._left_child === node) {
            parent._left_child = right !== node ? right : null;
        }

        if (right !== node) {
            left._right = right;
            right._left = left;
            node._left = node;
            node._right = node;
        }

        if (parent && node.fixed() && parent.active()) {
            parent.decrease_rank();
            if (parent.fixed()) parent.increase_loss();
        }
    }

    link(x, y) {
        if (x.gt(y))[x, y] = [y, x];

        const steps = []

        if (y._parent !== null) {
            steps.push({
                label: `Cut node ${y._key}`,
                apply: () => {
                    this.cut(y);
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

    free_node_reduction() {
        if (this._free_multiple === null) return {
            steps: [],
            applied: false
        };

        let x = this._free_multiple;
        let y = x._next;

        if (x === y) throw new Error('invalid free_multiple');
        if (x.gt(y))[x, y] = [y, x];

        const steps = [];

        steps.push({
            label: `Cut node ${y._key}`,
            apply: () => {
                this.cut(y);
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
                const z = x._left_child._left;
                if (z.passive()) {
                    return [{
                        label: `Link passive node ${z._key} to root`,
                        nest: true,
                        apply: () => {
                            const {
                                steps: subSteps
                            } = this.link(z, this._root);
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

    root_degree_reduction() {
        if (!this._root) throw new Error('root is None');
        if (!this._root._left_child) return {
            steps: [],
            applied: false
        };

        let x = this._root._left_child._left;
        let y = x._left;
        let z = y._left;

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
                this.cut(z);
                return [];
            }
        });
        steps.push({
            label: `Cut node ${y._key}`,
            nest: true,
            apply: () => {
                this.cut(y);
                return [];
            }
        });
        steps.push({
            label: `Cut node ${x._key}`,
            nest: true,
            apply: () => {
                this.cut(x);
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
                this._root.add_child(z);
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

    one_node_loss_reduction() {
        const x = this._loss_two;

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

    two_node_loss_reduction() {
        let x = this._loss_one_multiple;
        if (x === null) return {
            steps: [],
            applied: false
        };

        let y = x._next;
        if (!y || y === x) throw new Error('invalid loss_one_multiple');
        if (x._loss !== 1 || y._loss !== 1) throw new Error('invalid loss count');

        if (x.gt(y))[x, y] = [y, x];

        const steps = [];

        steps.push({
            label: `Cut node ${y._key}`,
            apply: () => this.cut(y)
        });

        steps.push({
            label: `Decrease loss of node ${x._key}`,
            apply: () => {
                x.decrease_loss();
            }
        });
        steps.push({
            label: `Decrease loss of node ${y._key}`,
            apply: () => {
                y.decrease_loss();
            }
        });

        steps.push({
            label: `Add node ${y._key} as child of ${x._key}`,
            apply: () => {
                x.add_child(y);
                const z = x._left_child._left;
                if (z.passive()) {
                    return [{
                        label: `Link passive node ${z._key} to root`,
                        nest: true,
                        apply: () => {
                            const {
                                steps: subSteps
                            } = this.link(z, this._root);
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

    passive_reduction(count = 0) {
        if (count >= 3 || this._passive === null) return [];

        const n = this._passive;

        return [{
            label: `Change node ${n._key} from passive to free`,
            apply: () => {
                const steps = []
                n.passive2free(this)
                steps.push(...this.passive_reduction(count + 1));
                return steps;
            }
        }];
    }

    apply_reductions(reductions) {
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
                            ...this.apply_reductions(remaining)
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
        return this._size === 0;
    }

    rank_zero() {
        if (this._rank_list === null) {
            this._rank_list = new Rank(0, this);
        }
        this._rank_list.increase_refs();
        return this._rank_list;
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

        this._left = this;
        this._right = this;
        this._parent = null;
        this._left_child = null;

        this._free = true;
        this._loss = 0;

        this._rank = heap.rank_zero();

        this._prev = this;
        this._next = this;

        this.fix_list_add();
    }

    gt(other) {
        return this._key > other._key || (this._key === other._key && this._id > other._id);
    }

    retire(heap) {
        if (!heap._active) throw new Error('heap not active');
        if (!(this.passive() || this.heap() === heap)) throw new Error('wrong heap');
        if (this._parent !== null) throw new Error('parent not null');
        if (this._left_child !== null) throw new Error('has children');
        if (!(this._left === this && this._right === this)) throw new Error('links broken');

        this.fix_list_remove(heap);
        heap._size -= 1;
        this._rank.reduce_refs();
        this._rank = null;
    }

    ////////////////////////////////////////////////////////////////////
    //                            Getters                             //
    ////////////////////////////////////////////////////////////////////

    active() {
        return this.heap()._active;
    }

    passive() {
        return !this.active();
    }

    free() {
        return this.active() && this._free;
    }

    fixed() {
        return this.active() && !this._free;
    }

    heap() {
        return this._rank._heap;
    }

    rank() {
        return this._rank._rank;
    }

    children() {
        const out = [];
        if (this._left_child === null) return out;

        let c = this._left_child;
        const first = c;
        while (true) {
            out.push(c);
            c = c._right;
            if (c === first) break;
        }
        return out;
    }

    section() {
        if (this.passive()) {
            return FIX_LIST_PASSIVE;
        } else if (this.free()) {
            if (
                (this._prev !== this && this._prev.free() && this._prev.rank() === this.rank()) ||
                (this._next !== this && this._next.free() && this._next.rank() === this.rank())
            ) {
                return FIX_LIST_FREE_MULTIPLE;
            } else {
                return FIX_LIST_FREE_SINGLE;
            }
        } else {
            if (!this.fixed()) throw new Error('expected fixed');
            if (this._loss === 0) {
                return FIX_LIST_LOSS_ZERO;
            } else if (this._loss === 1) {
                if (
                    (this._prev !== this &&
                        this._prev.fixed() &&
                        this._prev.rank() === this.rank() &&
                        this._prev._loss === 1) ||
                    (this._next !== this &&
                        this._next.fixed() &&
                        this._next.rank() === this.rank() &&
                        this._next._loss === 1)
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

    ////////////////////////////////////////////////////////////////////
    //                       Operation methods                        //
    ////////////////////////////////////////////////////////////////////

    add_child(child) {
        child._parent = this;

        if (this._left_child === null) {
            this._left_child = child;
        } else {
            child._right = this._left_child;
            child._left = child._right._left;
            child._right._left = child;
            child._left._right = child;
            if (child.active()) this._left_child = child;
        }

        if (this.active() && child.fixed()) {
            this.increase_rank();
        }
    }

    passive2free(heap) {
        if (!this.passive()) throw new Error('not passive');

        this.fix_list_remove(heap);
        this._rank.reduce_refs();
        this._rank = heap.rank_zero();

        this._fixed = false;
        this._free = true;
        this._loss = 0;

        if (this._parent !== null) {
            this.heap().link(this, this._parent);
        }

        this.fix_list_add();
    }

    free2fixed() {
        if (!this.free()) throw new Error('not free');

        this.fix_list_remove(this.heap());
        this._free = false;
        this._fixed = true;
        this._loss = 0;
        this.fix_list_add();

        if (this._parent && this._parent.active()) {
            this._parent.increase_rank();
        }
    }

    fixed2free() {
        if (!this.fixed()) throw new Error('not fixed');

        const parent = this._parent;
        if (!parent || !parent.active()) throw new Error('bad parent');

        this.fix_list_remove(this.heap());
        this._free = true;
        this._fixed = false;
        this._loss = 0;
        this.fix_list_add();

        parent.decrease_rank();
        if (parent.fixed()) parent.increase_loss();
    }

    ////////////////////////////////////////////////////////////////////
    //                       Fix-list methods                         //
    ////////////////////////////////////////////////////////////////////

    fix_list_attach(section) {
        const heap = this.heap();
        var head = heap[section];
        heap[section] = this;
        if (head === null) head = this.get_next_section(section);
        head.add_prev(this);
    }

    fix_list_detach() {
        this._prev._next = this._next;
        this._next._prev = this._prev;
        this._prev = this;
        this._next = this;
    }

    fix_list_add() {
        if (this.free()) {
            this.add_free();
        } else if (this.fixed()) {
            this.add_fixed();
        }
    }

    fix_list_remove(heap) {
        if (this.passive()) {
            this.remove_passive(heap);
        } else if (this.free()) {
            this.remove_free(heap);
        } else {
            this.remove_fixed(heap);
        }
        this.fix_list_detach(heap);
    }

    fix_list_same_group(other) {
        return (this.free() && other.free() && this._rank === other._rank) ||
            (this.fixed() && other.fixed() && this._loss === 1 && other._loss === 1 && this._rank === other._rank);
    }

    fix_list_group() {
        var count = 1;
        const head = this.heap().fix_list_head();
        var first, last;
        first = last = this;
        while (count < 3 && first !== head && this.fix_list_same_group(first._prev)) {
            first = first._prev;
            count += 1;
        }
        while (count < 3 && last._next !== head && this.fix_list_same_group(last._next)) {
            last = last._next;
            count += 1;
        }
        return { first, count };
    }

    add_free() {
        if (!this.free()) throw new Error('not free');
        const heap = this.heap();
        const free = this._rank._free;
        if (free === null) {
            this._rank._free = this;
            this.fix_list_attach(FIX_LIST_FREE_SINGLE);
        } else {
            const { count: count } = free.fix_list_group();
            const succ = free._next;
            if (count >= 2) {
                succ.add_prev(this);
            } else {
                if (heap._free_single === free) {
                    if (succ !== free && succ.free()) {
                        heap._free_single = succ;
                    } else {
                        heap._free_single = null;
                    }
                }
                free.fix_list_detach(heap);
                this.fix_list_attach(FIX_LIST_FREE_MULTIPLE);
                free.fix_list_attach(FIX_LIST_FREE_MULTIPLE);
            }
        }
    }

    add_fixed() {
        if (!this.fixed()) throw new Error('not fixed');
        const heap = this.heap();
        if (this._loss === 0) {
            this.fix_list_attach(FIX_LIST_LOSS_ZERO);
        } else if (this._loss === 1) {
            const loss_one = this._rank._loss_one;
            if (loss_one === null) {
                this._rank._loss_one = this;
                this.fix_list_attach(FIX_LIST_LOSS_ONE_SINGLE);
            } else {
                const { count: count } = loss_one.fix_list_group();
                const succ = loss_one._next;
                if (count >= 2) {
                    succ.add_prev(this);
                } else {
                    if (heap._loss_one_single === loss_one) {
                        if (succ !== loss_one && succ.fixed() && succ._loss === 1) {
                            heap._loss_one_single = succ;
                        } else {
                            heap._loss_one_single = null;
                        }
                    }
                    loss_one.fix_list_detach(heap);
                    this.fix_list_attach(FIX_LIST_LOSS_ONE_MULTIPLE);
                    loss_one.fix_list_attach(FIX_LIST_LOSS_ONE_MULTIPLE);
                }
            }
        } else {
            this.fix_list_attach(FIX_LIST_LOSS_TWO);
        }
    }

    remove_passive(heap) {
        if (!this.passive()) throw new Error('not passive');
        const succ = this._next;
        if (heap._passive === this) {
            if (succ !== this && succ.passive()) {
                heap._passive = succ;
            } else {
                heap._passive = null;
            }
        }
    }

    remove_free(heap) {
        if (!this.free()) throw new Error('not free');
        const succ = this._next;
        const free = this._rank._free;
        if (free === this) {
            this.reassign_rank_free();
        }
        const { first, count } = this.fix_list_group();
        if (count === 1) {
            if (heap._free_single === this) {
                if (succ !== this && succ.free()) {
                    heap._free_single = succ;
                } else {
                    heap._free_single = null;
                }
            }
        } else if (count === 2) {
            const other = first === this ? this._next : first;
            if (heap._free_multiple === first) {
                const next_group_first = first._next._next
                if (
                    next_group_first !== first &&
                    next_group_first.free() &&
                    next_group_first._next !== first &&
                    next_group_first._next.free() &&
                    next_group_first._rank === next_group_first._next._rank
                ) {
                    heap._free_multiple = next_group_first;
                } else {
                    heap._free_multiple = null;
                }
            }
            other.fix_list_detach(heap);
            other.fix_list_attach(FIX_LIST_FREE_SINGLE);
        } else if (heap._free_multiple === this) {
            heap._free_multiple = succ;
        }
    }

    remove_fixed(heap) {
        if (!this.fixed()) throw new Error('not fixed');
        const succ = this._next;
        if (this._loss === 0) {
            if (heap._loss_zero === this) {
                if (succ !== this && succ.fixed() && succ._loss === 0) {
                    heap._loss_zero = succ;
                } else {
                    heap._loss_zero = null;
                }
            }
        } else if (this._loss === 1) {
            const loss_one = this._rank._loss_one;
            if (loss_one === this) {
                this.reassign_rank_loss_one();
            }
            const { first, count } = this.fix_list_group();
            if (count === 1) {
                if (heap._loss_one_single === this) {
                    if (succ !== this && succ.fixed() && succ._loss === 1) {
                        heap._loss_one_single = succ;
                    } else {
                        heap._loss_one_single = null;
                    }
                }
            } else if (count === 2) {
                const other = first === this ? this._next : first;
                if (heap._loss_one_multiple === first) {
                    const next_group_first = first._next._next
                    if (
                        next_group_first !== first &&
                        next_group_first.fixed() && next_group_first._loss === 1 &&
                        next_group_first._next !== first &&
                        next_group_first._next.fixed() && next_group_first._next._loss === 1 &&
                        next_group_first._rank === next_group_first._next._rank
                    ) {
                        heap._loss_one_multiple = next_group_first;
                    } else {
                        heap._loss_one_multiple = null;
                    }
                }
                other.fix_list_detach(heap);
                other.fix_list_attach(FIX_LIST_LOSS_ONE_SINGLE);
            } else if (heap._loss_one_multiple === this) {
                heap._loss_one_multiple = succ;
            }
        } else {
            if (succ !== this && succ.fixed() && succ._loss === 2) {
                heap._loss_two = succ;
            } else {
                heap._loss_two = null;
            }
        }
    }

    reassign_rank_field(fieldName, predicate) {
        if (this._rank == null) {
            throw new Error("rank is null");
        }

        const succ = this._next;
        if (succ !== this && succ._rank === this._rank && predicate(succ)) {
            this._rank[fieldName] = succ;
        } else {
            this._rank[fieldName] = null;
        }
    }

    reassign_rank_free() {
        this.reassign_rank_field("_free", s => s.free());
    }

    reassign_rank_loss_one() {
        this.reassign_rank_field("_loss_one", s => s.fixed() && s._loss === 1);
    }

    add_prev(node) {
        node._next = this;
        node._prev = this._prev;
        this._prev._next = node;
        this._prev = node;
    }

    get_next_section(current) {
        if (!Heap.FIX_LIST_SECTIONS.includes(current)) throw new Error('invalid section');
        const list = Heap.FIX_LIST_SECTIONS;
        const start_idx = (list.indexOf(current) + 1) % list.length;
        for (let i = 0; i < list.length; i++) {
            const idx = (start_idx + i) % list.length;
            const value = this.heap()[list[idx]];
            if (value !== null) {
                return value;
            }
        }
        return null;
    }

    change_rank(newRank) {
        if (this._rank === null) throw new Error('current rank is None');
        this.fix_list_remove(this.heap());
        this._rank.reduce_refs();
        this._rank = newRank;
        this._rank.increase_refs();
        this.fix_list_add();
    }

    decrease_rank() {
        this.change_rank(this._rank.prev());
    }

    increase_rank() {
        this.change_rank(this._rank.next());
    }

    change_loss(change) {
        this.fix_list_remove(this.heap());
        this._loss += change;
        this.fix_list_add();
    }

    decrease_loss() {
        this.fix_list_remove(this.heap());
        this._loss -= 1;
        this.fix_list_add();
    }

    increase_loss() {
        if (this._loss < 2) {
            this.fix_list_remove(this.heap());
            this._loss += 1;
            this.fix_list_add();
        }
    }
}

class Rank {

    constructor(r, heap) {
        if (r == null || r < 0) throw new Error('invalid rank');
        if (!heap) throw new Error('heap is None');

        this._rank = r;
        this._dec = null;
        this._inc = null;
        this._heap = heap;

        this._ref_count = 0;
        this._free = null;
        this._loss_one = null;
    }

    retire() {
        if (this._heap === null) throw new Error('heap is None');
        if (this._ref_count !== 0) throw new Error('ref_count not zero');
        if (this._heap._active && this._free !== null) throw new Error(`free is not null: ${this._free._key}`);
        if (this._heap._active && this._loss_one !== null) throw new Error('loss_one is not null');

        if (this._heap._rank_list === this) this._heap._rank_list = this._inc;
        if (this._dec !== null) this._dec._inc = this._inc;
        if (this._inc !== null) this._inc._dec = this._dec;

        this._dec = null;
        this._inc = null;
        this._heap = null;
        this._free = null;
        this._loss_one = null;
        this._rank = null;
    }

    reduce_refs() {
        if (this._ref_count <= 0) throw new Error('ref_count underflow');
        this._ref_count -= 1;

        if (this._ref_count === 0) {
            this.retire();
        }
    }

    increase_refs() {
        this._ref_count += 1;
    }

    next() {
        if (this._inc === null || this._inc._rank > this._rank + 1) this.add_new_rank();
        return this._inc;
    }

    prev() {
        if (this._rank <= 0) throw new Error('no lower rank');
        if (this._dec === null) {
            this._dec = new Rank(this._rank - 1, this._heap);
            this._dec._inc = this;
            this._heap._rank_list = this._dec;
        } else if (this._dec._rank < this._rank - 1) this._dec.add_new_rank();
        return this._dec;
    }

    add_new_rank() {
        const new_rank = new Rank(this._rank + 1, this._heap);
        if (this._inc !== null) {
            if (this._inc._rank <= this._rank + 1) throw new Error('invalid inc rank');
            this._inc._dec = new_rank;
            new_rank._inc = this._inc;
        }
        new_rank._dec = this;
        this._inc = new_rank;
    }
}