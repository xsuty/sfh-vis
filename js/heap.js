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
        this._rankList = null;

        this._passive = null;
        this._freeMultiple = null;
        this._freeSingle = null;
        this._lossZero = null;
        this._lossOneMultiple = null;
        this._lossOneSingle = null;
        this._lossTwo = null;
    }

    gt(other) {
        return this._size > other._size;
    }

    retire() {
        this._active = false;
        this._size = 0;
        this._root = null;
        this._rankList = null;
        this._passive = null;
        this._freeMultiple = null;
        this._freeSingle = null;
        this._lossZero = null;
        this._lossOneMultiple = null;
        this._lossOneSingle = null;
        this._lossTwo = null;
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
                    const largeHead = larger.fixListHead();
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
                ...larger.applyReductions([
                    larger.freeNodeReduction,
                    larger.rootDegreeReduction
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
            ...this.applyReductions([
                ...Array(3).fill(this.freeNodeReduction),
                ...Array(2).fill(this.rootDegreeReduction)
            ])
        ];
    }

    delete(node) {
        if (!node) throw new Error('Node is null');

        const steps = [];
        const minKey = Number.NEGATIVE_INFINITY;
        if (node._key !== minKey) {
            steps.push({
                label: `Decrease key of node ${node._key} to negative infinity`,
                nest: true,
                apply: () => this.decreaseKey(node, minKey)
            });
        }

        steps.push({
            label: `Delete the new minimum node`,
            nest: true,
            apply: () => this.deleteMin()
        });

        return steps;
    }

    deleteMin() {
        if (!this._root) throw new Error('root is None');

        const z = this._root;

        if (z._leftChild === null) {
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

        let x = z.children().reduce((minNode, node) => minNode.gt(node) ? node : minNode, z._leftChild);

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

        function freeChildren(heap) {
            const c = z._leftChild;
            if (c === null) return [];
            const subSteps = [];
            subSteps.push({
                silent: true,
                apply: () => {
                    if (c.fixed()) {
                        return [{
                            label: `Change node ${c._key} from fixed to free`,
                            nest: true,
                            apply: () => {
                                c.fixed2free();
                                return [];
                            }
                        }];
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
                    apply: () => freeChildren(heap)
                }]
            }];
        }

        steps.push({
            silent: true,
            apply: () => freeChildren(this)
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
                apply: () => this.passiveReduction()
            });
        }

        function reducePhase(heap, reductions, onDone) {
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
                            apply: () => reducePhase(heap, reductions, onDone)
                        }
                    ];
                }
            }
            return typeof onDone === 'function' ? onDone() : [];
        }

        steps.push({
            silent: true,
            apply: () => reducePhase(
                this,
                [this.oneNodeLossReduction, this.twoNodeLossReduction],
                () => reducePhase(this, [this.freeNodeReduction, this.rootDegreeReduction])
            )
        })

        return steps;
    }

    decreaseKey(node, newKey) {
        if (!(newKey < node._key)) throw new Error('newKey not smaller');

        const steps = [];

        steps.push({
            label: `Decrease key of node ${node._key} to ${newKey}`,
            nest: true,
            apply: () => {
                node._key = newKey;
                return [];
            }
        });

        if (node === this._root) return steps;

        const parent = node._parent;
        const aboveParentAfterDecrease =
            newKey > parent._key ||
            (newKey === parent._key && node._id > parent._id);
        if (aboveParentAfterDecrease) return steps;

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
                } = this.twoNodeLossReduction();
                if (applied) {
                    return subSteps;
                }
                const {
                    steps: subSteps2
                } = this.oneNodeLossReduction();
                return subSteps2;
            }
        });

        steps.push(
            ...this.applyReductions([
                ...Array(6).fill(this.freeNodeReduction.bind(this)),
                ...Array(4).fill(this.rootDegreeReduction.bind(this)),
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

        if (parent && parent._leftChild === node) {
            parent._leftChild = right !== node ? right : null;
        }

        if (right !== node) {
            left._right = right;
            right._left = left;
            node._left = node;
            node._right = node;
        }

        if (parent && node.fixed() && parent.active()) {
            parent.decreaseRank();
            if (parent.fixed()) parent.increaseLoss();
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
                x.addChild(y);
                return [];
            }
        });

        return {
            root: x,
            steps
        };
    }

    freeNodeReduction() {
        if (this._freeMultiple === null) return {
            steps: [],
            applied: false
        };

        let x = this._freeMultiple;
        let y = x._next;

        if (x === y) throw new Error('invalid free_multiple: single-node group');
        if (!x.free() || !y.free()) {
            throw new Error('invalid free_multiple: head pair must both be free nodes');
        }
        if (x._rank !== y._rank) {
            throw new Error(
                `invalid free_multiple: first pair rank mismatch (${x._rank?._rank} vs ${y._rank?._rank})`
            );
        }

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
                x.addChild(y);
                const z = x._leftChild._left;
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

    rootDegreeReduction() {
        if (!this._root) throw new Error('root is None');
        if (!this._root._leftChild) return {
            steps: [],
            applied: false
        };

        let x = this._root._leftChild._left;
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
                return z.passive2free(this);
            }
        });
        steps.push({
            label: `Change node ${y._key} from passive to free`,
            nest: true,
            apply: () => {
                return y.passive2free(this);
            }
        });
        steps.push({
            label: `Change node ${x._key} from passive to free`,
            nest: true,
            apply: () => {
                return x.passive2free(this);
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
                this._root.addChild(z);
                return [];
            }
        });
        steps.push({
            label: `Add node ${y._key} as child of ${z._key}`,
            nest: true,
            apply: () => {
                z.addChild(y);
                return [];
            }
        });
        steps.push({
            label: `Add node ${x._key} as child of ${y._key}`,
            nest: true,
            apply: () => {
                y.addChild(x);
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

    oneNodeLossReduction() {
        const x = this._lossTwo;

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

    twoNodeLossReduction() {
        let x = this._lossOneMultiple;
        if (x === null) return {
            steps: [],
            applied: false
        };

        let y = x._next;
        if (!y || y === x) throw new Error('invalid loss_one_multiple: single-node group');
        if (!x.fixed() || !y.fixed() || x._loss !== 1 || y._loss !== 1) {
            throw new Error('invalid loss_one_multiple: head pair must be fixed nodes with loss 1');
        }
        if (x._rank !== y._rank) {
            throw new Error(
                `invalid loss_one_multiple: first pair rank mismatch (${x._rank?._rank} vs ${y._rank?._rank})`
            );
        }

        if (x.gt(y))[x, y] = [y, x];

        const steps = [];

        steps.push({
            label: `Cut node ${y._key}`,
            apply: () => this.cut(y)
        });

        steps.push({
            label: `Decrease loss of node ${x._key}`,
            apply: () => {
                x.decreaseLoss();
            }
        });
        steps.push({
            label: `Decrease loss of node ${y._key}`,
            apply: () => {
                y.decreaseLoss();
            }
        });

        steps.push({
            label: `Add node ${y._key} as child of ${x._key}`,
            apply: () => {
                x.addChild(y);
                const z = x._leftChild._left;
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

    passiveReduction(count = 0) {
        if (count >= 3 || this._passive === null) return [];

        const n = this._passive;

        return [{
            label: `Change node ${n._key} from passive to free`,
            apply: () => {
                const steps = []
                steps.push(...n.passive2free(this), ...this.passiveReduction(count + 1));
                return steps;
            }
        }];
    }

    applyReductions(reductions) {
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
                            ...this.applyReductions(remaining)
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

    rankZero() {
        if (this._rankList === null) {
            this._rankList = new Rank(0, this);
        }
        this._rankList.increaseRefs();
        return this._rankList;
    }

    fixListHead() {
        for (const section of Heap.FIX_LIST_SECTIONS) {
            const node = this[section];
            if (node !== null) {
                return node;
            }
        }
        return null;
    }

    ////////////////////////////////////////////////////////////////////
    //                      Serialization                             //
    ////////////////////////////////////////////////////////////////////

    serialize() {
        // Collect all nodes
        const nodes = [];
        const nodeToId = new Map();
        const rankToId = new Map();
        const heapToId = new Map();

        // Helper to traverse all nodes in the heap
        const collectNodes = (node) => {
            if (!node || nodeToId.has(node)) return;
            nodeToId.set(node, nodes.length);
            nodes.push(node);

            // Traverse children
            if (node._leftChild) {
                let child = node._leftChild;
                const first = child;
                do {
                    collectNodes(child);
                    child = child._right;
                } while (child !== first);
            }
        };

        // Collect nodes from root
        if (this._root) {
            collectNodes(this._root);
        }

        // Collect nodes from fix lists
        for (const section of Heap.FIX_LIST_SECTIONS) {
            const head = this[section];
            if (head) {
                let node = head;
                const first = head;
                do {
                    collectNodes(node);
                    node = node._next;
                } while (node !== first);
            }
        }

        const collectHeap = (heap) => {
            if (!heap || heapToId.has(heap)) return;
            heapToId.set(heap, heapToId.size);
        };

        const collectRank = (rank) => {
            if (!rank || rankToId.has(rank)) return;
            collectHeap(rank._heap);
            rankToId.set(rank, rankToId.size);
        };

        // Ensure the exported heap record itself is always present.
        collectHeap(this);

        // Collect all ranks referenced by serialized nodes, including passive nodes
        // that may belong to inactive heap records.
        for (const node of nodes) {
            collectRank(node._rank);
        }

        // Also collect ranks reachable from each heap rank list to preserve rank chains.
        for (const heapRecord of heapToId.keys()) {
            let rank = heapRecord._rankList;
            while (rank) {
                collectRank(rank);
                rank = rank._inc;
            }
        }

        // Serialize heap records.
        const heaps = Array.from(heapToId.keys()).map((heapRecord) => ({
            heapId: heapRecord._heapId,
            active: heapRecord._active,
            size: heapRecord._size
        }));

        // Serialize ranks with owner-heap mapping.
        const ranks = Array.from(rankToId.keys()).map((rank) => ({
            rank: rank._rank,
            refCount: rank._refCount,
            heap: heapToId.get(rank._heap)
        }));

        // Serialize nodes
        const serializedNodes = nodes.map(node => ({
            id: node._id,
            key: node._key,
            free: node._free,
            loss: node._loss,
            rank: rankToId.get(node._rank),
            left: nodeToId.has(node._left) ? nodeToId.get(node._left) : null,
            right: nodeToId.has(node._right) ? nodeToId.get(node._right) : null,
            parent: node._parent && nodeToId.has(node._parent) ? nodeToId.get(node._parent) : null,
            leftChild: node._leftChild && nodeToId.has(node._leftChild) ? nodeToId.get(node._leftChild) : null,
            prev: nodeToId.has(node._prev) ? nodeToId.get(node._prev) : null,
            next: nodeToId.has(node._next) ? nodeToId.get(node._next) : null
        }));

        return {
            version: 1,
            rootHeap: heapToId.get(this),
            heapId: this._heapId,
            active: this._active,
            size: this._size,
            root: this._root ? nodeToId.get(this._root) : null,
            passive: this._passive ? nodeToId.get(this._passive) : null,
            freeMultiple: this._freeMultiple ? nodeToId.get(this._freeMultiple) : null,
            freeSingle: this._freeSingle ? nodeToId.get(this._freeSingle) : null,
            lossZero: this._lossZero ? nodeToId.get(this._lossZero) : null,
            lossOneMultiple: this._lossOneMultiple ? nodeToId.get(this._lossOneMultiple) : null,
            lossOneSingle: this._lossOneSingle ? nodeToId.get(this._lossOneSingle) : null,
            lossTwo: this._lossTwo ? nodeToId.get(this._lossTwo) : null,
            heaps,
            nodes: serializedNodes,
            ranks: ranks,
            maxNodeId: Node._nextId || 0
        };
    }

    static deserialize(data) {
        if (data.version !== 1) {
            throw new Error('Unsupported serialization version');
        }

        if (!Array.isArray(data.nodes) || !Array.isArray(data.ranks)) {
            throw new Error('Invalid serialization payload: nodes/ranks must be arrays');
        }

        const heap = new Heap();
        heap._heapId = data.heapId;
        heap._active = data.active;
        heap._size = data.size;

        // Restore max node ID
        Node._nextId = Math.max(Node._nextId || 0, data.maxNodeId || 0);

        const serializedHeaps = Array.isArray(data.heaps) ? data.heaps : [{
            heapId: data.heapId,
            active: data.active,
            size: data.size
        }];

        const rootHeapIndex = Number.isInteger(data.rootHeap) && data.rootHeap >= 0 ? data.rootHeap : 0;
        if (rootHeapIndex >= serializedHeaps.length) {
            throw new Error('Invalid serialization payload: rootHeap index out of bounds');
        }

        // Build heap records. The deserialized root heap reuses `heap` as return value.
        const heapRecords = serializedHeaps.map((heapData, index) => {
            const record = index === rootHeapIndex ? heap : new Heap();
            record._heapId = heapData.heapId;
            record._active = heapData.active;
            record._size = heapData.size;
            return record;
        });

        // Create rank records with their owning heap.
        const ranks = [];
        for (let i = 0; i < data.ranks.length; i++) {
            const rankData = data.ranks[i];
            const ownerHeapIndex = Number.isInteger(rankData.heap) && rankData.heap >= 0 ?
                rankData.heap :
                rootHeapIndex;
            const ownerHeap = heapRecords[ownerHeapIndex];
            if (!ownerHeap) throw new Error(`Invalid serialization payload: rank ${i} has invalid heap index`);
            const rank = new Rank(rankData.rank, ownerHeap);
            rank._refCount = rankData.refCount;
            ranks.push(rank);
        }

        // Rebuild rank chains per heap by ascending rank value.
        const ranksByHeap = new Map();
        for (const rank of ranks) {
            if (!ranksByHeap.has(rank._heap)) {
                ranksByHeap.set(rank._heap, []);
            }
            ranksByHeap.get(rank._heap).push(rank);
        }
        for (const [ownerHeap, heapRanks] of ranksByHeap.entries()) {
            heapRanks.sort((a, b) => a._rank - b._rank);
            ownerHeap._rankList = heapRanks[0] ?? null;
            for (let i = 1; i < heapRanks.length; i++) {
                heapRanks[i].insertAfter(heapRanks[i - 1]);
            }
        }

        // Create nodes without links
        const nodes = [];
        for (const nodeData of data.nodes) {
            if (!Number.isInteger(nodeData.rank) || nodeData.rank < 0 || nodeData.rank >= ranks.length) {
                throw new Error(`Invalid serialization payload: node ${nodeData.id} has invalid rank index`);
            }
            const node = Object.create(Node.prototype);
            Node._nextId = (Node._nextId || 0) + 1;
            node._id = Node._nextId;
            node._key = nodeData.key;
            node._free = nodeData.free;
            node._loss = nodeData.loss;
            node._rank = ranks[nodeData.rank];
            nodes.push(node);
        }

        // Restore node links
        for (let i = 0; i < data.nodes.length; i++) {
            const nodeData = data.nodes[i];
            const node = nodes[i];

            node._left = nodeData.left !== null ? nodes[nodeData.left] : node;
            node._right = nodeData.right !== null ? nodes[nodeData.right] : node;
            node._parent = nodeData.parent !== null ? nodes[nodeData.parent] : null;
            node._leftChild = nodeData.leftChild !== null ? nodes[nodeData.leftChild] : null;
            node._prev = nodeData.prev !== null ? nodes[nodeData.prev] : node;
            node._next = nodeData.next !== null ? nodes[nodeData.next] : node;
        }

        // Restore heap pointers
        heap._root = data.root !== null ? nodes[data.root] : null;
        heap._passive = data.passive !== null ? nodes[data.passive] : null;
        heap._freeMultiple = data.freeMultiple !== null ? nodes[data.freeMultiple] : null;
        heap._freeSingle = data.freeSingle !== null ? nodes[data.freeSingle] : null;
        heap._lossZero = data.lossZero !== null ? nodes[data.lossZero] : null;
        heap._lossOneMultiple = data.lossOneMultiple !== null ? nodes[data.lossOneMultiple] : null;
        heap._lossOneSingle = data.lossOneSingle !== null ? nodes[data.lossOneSingle] : null;
        heap._lossTwo = data.lossTwo !== null ? nodes[data.lossTwo] : null;

        // Recompute rank metadata from nodes to keep counts and pointers consistent.
        for (const rank of ranks) {
            rank._refCount = 0;
            rank._free = null;
            rank._lossOne = null;
        }

        for (const node of nodes) {
            const rank = node._rank;
            rank._refCount += 1;
            if (!rank._heap._active) {
                continue;
            }
            if (node._free && rank._free === null) {
                rank._free = node;
            } else if (node._loss === 1 && !node._free && rank._lossOne === null) {
                rank._lossOne = node;
            }
        }

        return heap;
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
        this._leftChild = null;

        this._free = true;
        this._loss = 0;

        this._rank = heap.rankZero();

        this._prev = this;
        this._next = this;

        this.fixListAdd();
    }

    gt(other) {
        return this._key > other._key || (this._key === other._key && this._id > other._id);
    }

    retire(heap) {
        if (!heap._active) throw new Error('heap not active');
        if (!(this.passive() || this.heap() === heap)) throw new Error('wrong heap');
        if (this._parent !== null) throw new Error('parent not null');
        if (this._leftChild !== null) throw new Error('has children');
        if (!(this._left === this && this._right === this)) throw new Error('links broken');

        this.fixListRemove(heap);
        heap._size -= 1;
        this._rank.reduceRefs();
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
        if (this._leftChild === null) return out;

        let c = this._leftChild;
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

    addChild(child) {
        child._parent = this;

        if (this._leftChild === null) {
            this._leftChild = child;
        } else {
            child._right = this._leftChild;
            child._left = child._right._left;
            child._right._left = child;
            child._left._right = child;
            if (child.active()) this._leftChild = child;
        }

        if (this.active() && child.fixed()) {
            this.increaseRank();
        }
    }

    passive2free(heap) {
        if (!this.passive()) throw new Error('not passive');

        this.fixListRemove(heap);
        this._rank.reduceRefs();
        this._rank = heap.rankZero();

        this._fixed = false;
        this._free = true;
        this._loss = 0;

        const steps = [];
        if (this._parent !== null) {
            const {
                steps: subSteps
            } = this.heap().link(this, this._parent);
            steps.push(...subSteps);
        }

        this.fixListAdd();
        return steps;
    }

    free2fixed() {
        if (!this.free()) throw new Error('not free');

        this.fixListRemove(this.heap());
        this._free = false;
        this._fixed = true;
        this._loss = 0;

        if (this._parent && this._parent.active()) {
            this._parent.increaseRank();
        }

        this.fixListAdd();
    }

    fixed2free() {
        if (!this.fixed()) throw new Error('not fixed');

        const parent = this._parent;
        if (!parent || !parent.active()) throw new Error('bad parent');

        this.fixListRemove(this.heap());
        this._free = true;
        this._fixed = false;
        this._loss = 0;

        parent.decreaseRank();
        if (parent.fixed()) parent.increaseLoss();

        this.fixListAdd();
    }

    ////////////////////////////////////////////////////////////////////
    //                       Fix-list methods                         //
    ////////////////////////////////////////////////////////////////////

    fixListAttach(section) {
        const heap = this.heap();
        var head = heap[section];
        heap[section] = this;
        if (head === null) head = this.getNextSection(section);
        head.addPrev(this);
    }

    fixListDetach() {
        this._prev._next = this._next;
        this._next._prev = this._prev;
        this._prev = this;
        this._next = this;
    }

    fixListAdd() {
        if (this.free()) {
            this.addFree();
        } else if (this.fixed()) {
            this.addFixed();
        }
    }

    fixListRemove(heap) {
        if (this.passive()) {
            this.removePassive(heap);
        } else if (this.free()) {
            this.removeFree(heap);
        } else {
            this.removeFixed(heap);
        }
        this.fixListDetach(heap);
    }

    fixListSameGroup(other) {
        return (this.free() && other.free() && this._rank === other._rank) ||
            (this.fixed() && other.fixed() && this._loss === 1 && other._loss === 1 && this._rank === other._rank);
    }

    fixListGroup() {
        var count = 1;
        const head = this.heap().fixListHead();
        var first, last;
        first = last = this;
        while (count < 3 && first !== head && this.fixListSameGroup(first._prev)) {
            first = first._prev;
            count += 1;
        }
        while (count < 3 && last._next !== head && this.fixListSameGroup(last._next)) {
            last = last._next;
            count += 1;
        }
        return {
            first,
            count
        };
    }

    addFree() {
        if (!this.free()) throw new Error('not free');
        const heap = this.heap();
        const free = this._rank._free;
        if (free === null) {
            this._rank._free = this;
            this.fixListAttach(FIX_LIST_FREE_SINGLE);
        } else {
            const {
                count: count
            } = free.fixListGroup();
            const succ = free._next;
            if (count >= 2) {
                succ.addPrev(this);
            } else {
                if (heap._freeSingle === free) {
                    if (succ !== free && succ.free()) {
                        heap._freeSingle = succ;
                    } else {
                        heap._freeSingle = null;
                    }
                }
                free.fixListDetach(heap);
                this.fixListAttach(FIX_LIST_FREE_MULTIPLE);
                free.fixListAttach(FIX_LIST_FREE_MULTIPLE);
            }
        }
    }

    addFixed() {
        if (!this.fixed()) throw new Error('not fixed');
        const heap = this.heap();
        if (this._loss === 0) {
            this.fixListAttach(FIX_LIST_LOSS_ZERO);
        } else if (this._loss === 1) {
            const lossOne = this._rank._lossOne;
            if (lossOne === null) {
                this._rank._lossOne = this;
                this.fixListAttach(FIX_LIST_LOSS_ONE_SINGLE);
            } else {
                const {
                    count: count
                } = lossOne.fixListGroup();
                const succ = lossOne._next;
                if (count >= 2) {
                    succ.addPrev(this);
                } else {
                    if (heap._lossOneSingle === lossOne) {
                        if (succ !== lossOne && succ.fixed() && succ._loss === 1) {
                            heap._lossOneSingle = succ;
                        } else {
                            heap._lossOneSingle = null;
                        }
                    }
                    lossOne.fixListDetach(heap);
                    this.fixListAttach(FIX_LIST_LOSS_ONE_MULTIPLE);
                    lossOne.fixListAttach(FIX_LIST_LOSS_ONE_MULTIPLE);
                }
            }
        } else {
            this.fixListAttach(FIX_LIST_LOSS_TWO);
        }
    }

    removePassive(heap) {
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

    removeFree(heap) {
        if (!this.free()) throw new Error('not free');
        const succ = this._next;
        const free = this._rank._free;
        if (free === this) {
            this.reassignRankFree();
        }
        const {
            first,
            count
        } = this.fixListGroup();
        if (count === 1) {
            if (heap._freeSingle === this) {
                if (succ !== this && succ.free()) {
                    heap._freeSingle = succ;
                } else {
                    heap._freeSingle = null;
                }
            }
        } else if (count === 2) {
            const other = first === this ? this._next : first;
            if (heap._freeMultiple === first) {
                const nextGroupFirst = first._next._next
                if (
                    nextGroupFirst !== first &&
                    nextGroupFirst.free() &&
                    nextGroupFirst._next !== first &&
                    nextGroupFirst._next.free() &&
                    nextGroupFirst._rank === nextGroupFirst._next._rank
                ) {
                    heap._freeMultiple = nextGroupFirst;
                } else {
                    heap._freeMultiple = null;
                }
            }
            other.fixListDetach(heap);
            other.fixListAttach(FIX_LIST_FREE_SINGLE);
        } else if (heap._freeMultiple === this) {
            heap._freeMultiple = succ;
        }
    }

    removeFixed(heap) {
        if (!this.fixed()) throw new Error('not fixed');
        const succ = this._next;
        if (this._loss === 0) {
            if (heap._lossZero === this) {
                if (succ !== this && succ.fixed() && succ._loss === 0) {
                    heap._lossZero = succ;
                } else {
                    heap._lossZero = null;
                }
            }
        } else if (this._loss === 1) {
            const lossOne = this._rank._lossOne;
            if (lossOne === this) {
                this.reassignRankLossOne();
            }
            const {
                first,
                count
            } = this.fixListGroup();
            if (count === 1) {
                if (heap._lossOneSingle === this) {
                    if (succ !== this && succ.fixed() && succ._loss === 1) {
                        heap._lossOneSingle = succ;
                    } else {
                        heap._lossOneSingle = null;
                    }
                }
            } else if (count === 2) {
                const other = first === this ? this._next : first;
                if (heap._lossOneMultiple === first) {
                    const nextGroupFirst = first._next._next
                    if (
                        nextGroupFirst !== first &&
                        nextGroupFirst.fixed() && nextGroupFirst._loss === 1 &&
                        nextGroupFirst._next !== first &&
                        nextGroupFirst._next.fixed() && nextGroupFirst._next._loss === 1 &&
                        nextGroupFirst._rank === nextGroupFirst._next._rank
                    ) {
                        heap._lossOneMultiple = nextGroupFirst;
                    } else {
                        heap._lossOneMultiple = null;
                    }
                }
                other.fixListDetach(heap);
                other.fixListAttach(FIX_LIST_LOSS_ONE_SINGLE);
            } else if (heap._lossOneMultiple === this) {
                heap._lossOneMultiple = succ;
            }
        } else {
            if (succ !== this && succ.fixed() && succ._loss > 1) {
                heap._lossTwo = succ;
            } else {
                heap._lossTwo = null;
            }
        }
    }

    reassignRankField(fieldName, predicate) {
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

    reassignRankFree() {
        this.reassignRankField("_free", s => s.free());
    }

    reassignRankLossOne() {
        this.reassignRankField("_lossOne", s => s.fixed() && s._loss === 1);
    }

    addPrev(node) {
        node._next = this;
        node._prev = this._prev;
        this._prev._next = node;
        this._prev = node;
    }

    getNextSection(current) {
        if (!Heap.FIX_LIST_SECTIONS.includes(current)) throw new Error('invalid section');
        const list = Heap.FIX_LIST_SECTIONS;
        const startIdx = (list.indexOf(current) + 1) % list.length;
        for (let i = 0; i < list.length; i++) {
            const idx = (startIdx + i) % list.length;
            const value = this.heap()[list[idx]];
            if (value !== null) {
                return value;
            }
        }
        return null;
    }

    changeRank(newRank) {
        if (this._rank === null) throw new Error('current rank is None');
        this.fixListRemove(this.heap());
        this._rank.reduceRefs();
        this._rank = newRank;
        this._rank.increaseRefs();
        this.fixListAdd();
    }

    decreaseRank() {
        this.changeRank(this._rank.prev());
    }

    increaseRank() {
        this.changeRank(this._rank.next());
    }

    changeLoss(change) {
        this.fixListRemove(this.heap());
        this._loss += change;
        this.fixListAdd();
    }

    decreaseLoss() {
        this.changeLoss(-1);
    }

    increaseLoss() {
        this.changeLoss(1);
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

        this._refCount = 0;
        this._free = null;
        this._lossOne = null;
    }

    retire() {
        if (this._heap === null) throw new Error('heap is None');
        if (this._refCount !== 0) throw new Error('refCount not zero');
        if (this._heap._active && this._free !== null) throw new Error(`free is not null: ${this._free._key}`);
        if (this._heap._active && this._lossOne !== null) throw new Error('lossOne is not null');

        if (this._heap._rankList === this) this._heap._rankList = this._inc;
        if (this._dec !== null) this._dec._inc = this._inc;
        if (this._inc !== null) this._inc._dec = this._dec;

        this._dec = null;
        this._inc = null;
        this._heap = null;
        this._free = null;
        this._lossOne = null;
        this._rank = null;
    }

    reduceRefs() {
        if (this._refCount <= 0) throw new Error('refCount underflow');
        this._refCount -= 1;

        if (this._refCount === 0) {
            this.retire();
        }
    }

    increaseRefs() {
        this._refCount += 1;
    }

    next() {
        if (this._inc === null || this._inc._rank > this._rank + 1) {
            new Rank(this._rank + 1, this._heap).insertAfter(this);
        }
        return this._inc;
    }

    prev() {
        if (this._rank <= 0) throw new Error('no lower rank');
        if (this._dec._rank < this._rank - 1) {
            new Rank(this._rank - 1, this._heap).insertAfter(this._dec);
        }
        return this._dec;
    }

    insertAfter(prev) {
        if (prev._inc !== null) {
            prev._inc._dec = this;
        }
        this._inc = prev._inc;
        this._dec = prev;
        prev._inc = this;
    }
}