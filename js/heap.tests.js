import assert from 'node:assert/strict';
import {
    writeFileSync
} from 'node:fs';
import process from 'node:process';
import {
    Heap
} from './heap.js';

const RANDOM_OPS_PER_TEST = 2000;

function parseCliOptions() {
    const args = process.argv.slice(2);
    const hasFlag = (flag) => args.includes(flag);
    const getValue = (prefix) => {
        const entry = args.find((arg) => arg.startsWith(`${prefix}=`));
        return entry ? entry.slice(prefix.length + 1) : null;
    };

    const loopRandom =
        hasFlag('--loop-random') ||
        process.env.HEAP_RANDOM_LOOP === '1' ||
        process.env.HEAP_RANDOM_LOOP === 'true';

    const seedValue = getValue('--seed') ?? process.env.HEAP_RANDOM_SEED ?? null;
    const parsedSeed = seedValue != null ? Number(seedValue) : null;
    const seed = Number.isInteger(parsedSeed) ? parsedSeed : null;

    return {
        loopRandom,
        seed
    };
}

function randomU32Seed() {
    return Math.floor(Math.random() * 0x100000000) >>> 0;
}

const FAILURE_EXPORT_URL = new URL('./heap.failure.json', import.meta.url);
const FAILURE_EXPORT_DISPLAY_PATH = 'js/heap.failure.json';
const FAILURE_IMPORT_EXPORT_URL = new URL('./heap.failure.import.json', import.meta.url);
const FAILURE_IMPORT_EXPORT_DISPLAY_PATH = 'js/heap.failure.import.json';

const failureTracker = {
    currentTest: '(unknown)',
    history: [],
    lastOperation: null,
    lastMutation: null,
    currentOperationLabel: null,
    currentOperationStartSnapshot: null,

    setTest(name) {
        this.currentTest = name;
        this.lastOperation = null;
        this.lastMutation = null;
        this.currentOperationLabel = null;
        this.currentOperationStartSnapshot = null;
    },

    snapshotHeaps(heaps) {
        if (!Array.isArray(heaps) || heaps.length === 0) {
            return [];
        }

        return heaps.map((entry, index) => {
            const name = entry?.name ?? `heap${index + 1}`;
            const heap = entry?.heap;

            if (!heap) {
                return {
                    name,
                    present: false,
                    snapshot: null
                };
            }

            try {
                return {
                    name,
                    present: true,
                    snapshot: typeof heap.serialize === 'function' ? heap.serialize() : {
                        active: heap._active,
                        size: heap._size,
                        rootKey: heap._root?._key ?? null
                    }
                };
            } catch (error) {
                return {
                    name,
                    present: true,
                    snapshotError: error instanceof Error ? error.message : String(error)
                };
            }
        });
    },

    record({
        label,
        kind = 'mutation',
        heaps = [],
        details = null
    }) {
        // Extract operation label (everything before " :: " or the full label if no steps)
        const operationLabel = label.split(' :: ')[0];

        // Track operation boundaries and capture pre-operation snapshot
        if (kind === 'mutation') {
            if (operationLabel !== this.currentOperationLabel) {
                // New operation is starting - save the pre-operation heap state
                this.currentOperationLabel = operationLabel;
                this.currentOperationStartSnapshot = this.snapshotHeaps(heaps);
            }
        }

        const entry = {
            at: new Date().toISOString(),
            test: this.currentTest,
            label,
            kind,
            details,
            heaps: this.snapshotHeaps(heaps)
        };

        this.lastOperation = entry;
        if (kind === 'mutation') {
            this.lastMutation = entry;
        }

        this.history.push({
            at: entry.at,
            test: entry.test,
            label: entry.label,
            kind: entry.kind
        });

        if (this.history.length > 250) {
            this.history.shift();
        }
    },

    dump(error) {
        const failingOperation = this.lastOperation;
        const likelyTrigger =
            failingOperation?.kind === 'validation' && this.lastMutation ?
            this.lastMutation :
            failingOperation;

        // Extract the operation name without step details for clearer reporting
        const operationLabel = likelyTrigger?.label?.split(' :: ')[0] ?? failingOperation?.label ?? 'unknown';

        const snapshotCandidates = [
            ...(Array.isArray(likelyTrigger?.heaps) ? likelyTrigger.heaps : []),
            ...(Array.isArray(failingOperation?.heaps) ? failingOperation.heaps : [])
        ];

        // Use the pre-operation snapshot if available (captured at operation start)
        let importableHeapState = null;
        if (this.currentOperationStartSnapshot && this.currentOperationStartSnapshot.length > 0) {
            importableHeapState = this.currentOperationStartSnapshot[0]?.snapshot ?? null;
        }
        // Fallback to snapshot candidates if pre-operation snapshot not available
        if (!importableHeapState) {
            importableHeapState = snapshotCandidates
                .map((entry) => entry?.snapshot)
                .find((snapshot) => snapshot && typeof snapshot === 'object' && snapshot.version === 1);
        }

        const payload = {
            generatedAt: new Date().toISOString(),
            test: this.currentTest,
            error: {
                name: error?.name ?? 'Error',
                message: error?.message ?? String(error),
                stack: error?.stack ?? null
            },
            failingOperation: {
                ...likelyTrigger,
                label: operationLabel // Show just the operation name (e.g., "insert(6)" not "insert(6) :: step1")
            },
            likelyTriggerOperation: likelyTrigger,
            recentOperations: this.history.slice(-50)
        };

        writeFileSync(FAILURE_EXPORT_URL, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        if (importableHeapState) {
            writeFileSync(
                FAILURE_IMPORT_EXPORT_URL,
                `${JSON.stringify(importableHeapState, null, 2)}\n`,
                'utf8'
            );
        }

        console.error('--- Heap Test Failure Diagnostic ---');
        console.error(`Test: ${this.currentTest}`);
        console.error(`Failing operation: ${operationLabel}`);
        if (likelyTrigger && likelyTrigger !== failingOperation) {
            console.error(`Last mutation: ${likelyTrigger.label}`);
        }
        console.error(`Diagnostic export: ${FAILURE_EXPORT_DISPLAY_PATH}`);
        if (importableHeapState) {
            console.error(`Importable heap export: ${FAILURE_IMPORT_EXPORT_DISPLAY_PATH}`);
        } else {
            console.error('Importable heap export: unavailable (no serialized heap snapshot captured)');
        }
        console.error('------------------------------------');
    }
};

function runCase(name, fn) {
    failureTracker.setTest(name);
    try {
        fn();
    } catch (error) {
        failureTracker.dump(error);
        throw error;
    }
}

function runRandomOperationsLoop(initialSeed = null) {
    let iteration = 0;
    let seed = initialSeed ?? randomU32Seed();
    console.log('Running endless randomized heap tests. Press Ctrl+C to stop.');
    while (true) {
        iteration += 1;
        const testName = `testRandomOperations(loop=${iteration}, seed=${seed})`;
        console.log(`[loop ${iteration}] seed=${seed}`);
        runCase(testName, () => testRandomOperations(RANDOM_OPS_PER_TEST, seed));
        seed = (seed + 1) >>> 0;
    }
}

/**
 * Apply all steps returned by a heap operation.
 * Heap operations (insert, deleteMin, delete, decreaseKey, meld) return
 * arrays of step objects. This function applies each step and tracks
 * any additional steps produced during application.
 */
function applyAllSteps(steps, context = {}) {
    const pending = Array.isArray(steps) ? [...steps] : [];
    const operationLabel = context.label ?? 'applyAllSteps';
    const heaps = Array.isArray(context.heaps) ?
        context.heaps :
        context.heap ? [{
            name: 'heap',
            heap: context.heap
        }] : [];
    let index = 0;
    let processed = 0;
    let lastLabel = '(none)';
    while (index < pending.length) {
        processed += 1;
        if (processed > 1_000_000) {
            throw new Error(
                `Step application exceeded safety limit; last step: ${lastLabel}`
            );
        }
        const step = pending[index];
        if (!step || typeof step.apply !== 'function') {
            index += 1;
            continue;
        }
        lastLabel = step.label ?? '(silent)';

        failureTracker.record({
            label: `${operationLabel} :: ${lastLabel}`,
            kind: 'mutation',
            heaps
        });

        const produced = step.apply();
        if (Array.isArray(produced) && produced.length > 0) {
            pending.splice(index + 1, 0, ...produced);
        }
        index += 1;
    }
}

/**
 * Mulberry32 seeded random number generator.
 * Returns a function that produces deterministic pseudo-random numbers in [0, 1).
 */
function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), t | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Generate a random integer in [minInclusive, maxInclusive] using the given RNG.
 */
function randInt(rng, minInclusive, maxInclusive) {
    return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}

/**
 * Generate n random key values for heap insertion.
 * If distinct=true, returns n distinct values from [1, 3n].
 * If distinct=false, returns n random values from [1, n] (may have duplicates).
 * Mirrors random_items from sfh_v2.py.
 */
function randomItems(n, rng, distinct = false) {
    if (distinct) {
        const pool = [];
        for (let i = 1; i <= 3 * n; i += 1) {
            pool.push(i);
        }
        for (let i = pool.length - 1; i > 0; i -= 1) {
            const j = randInt(rng, 0, i);
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, n);
    }
    const out = [];
    for (let i = 0; i < n; i += 1) {
        out.push(randInt(rng, 1, n));
    }
    return out;
}

/**
 * Fisher-Yates shuffle in place.
 */
function shuffleInPlace(items, rng) {
    for (let i = items.length - 1; i > 0; i -= 1) {
        const j = randInt(rng, 0, i);
        [items[i], items[j]] = [items[j], items[i]];
    }
}

/**
 * Remove one occurrence of a value from an array.
 * Throws an error if the value is not found.
 */
function removeOne(arr, value) {
    const idx = arr.indexOf(value);
    if (idx === -1) {
        throw new Error(`Missing value ${value} in expected key list`);
    }
    arr.splice(idx, 1);
}

/**
 * Extract all nodes from a heap using depth-first search.
 */
function allNodes(heap) {
    if (heap.empty()) {
        return [];
    }
    const out = [];
    const stack = [heap._root];
    while (stack.length > 0) {
        const node = stack.pop();
        out.push(node);
        const children = node.children();
        for (let i = children.length - 1; i >= 0; i -= 1) {
            stack.push(children[i]);
        }
    }
    return out;
}

/**
 * Validate rank-list consistency.
 */
function validateRankList(heap, nodes = null) {
    const actualNodes = Array.isArray(nodes) ?
        nodes :
        (heap._root ? allNodes(heap) : []);

    if (heap._active && heap._size === 0) {
        assert.equal(heap._rankList, null, 'rank list must be null for empty active heap');
        return;
    }

    if (heap._active && heap._size > 0) {
        assert.notEqual(heap._rankList, null, 'rank list must exist for non-empty active heap');
    }

    if (heap._rankList === null) {
        return;
    }

    const seenRanks = new Set();
    let rank = heap._rankList;
    let prev = null;

    if (heap._size > 0) {
        assert.equal(heap._rankList._dec, null, 'first rank predecessor must be null');
    }

    while (rank !== null) {
        assert.equal(seenRanks.has(rank), false, 'rank list cycle detected');
        seenRanks.add(rank);

        assert.equal(rank._refCount > 0, true, 'rank refCount must be positive');
        assert.equal(rank._heap, heap, 'rank belongs to different heap');
        assert.equal(rank._dec, prev, 'broken rank predecessor pointer');
        if (prev !== null) {
            assert.equal(rank._rank > prev._rank, true, 'rank values not strictly increasing');
        }

        const refs = actualNodes.filter((node) => node._rank === rank);
        assert.equal(rank._refCount, refs.length, `rank refCount mismatch for rank ${rank._rank}`);

        if (rank._free !== null) {
            assert.equal(rank._free._rank, rank, 'rank._free points to wrong rank');
            assert.equal(rank._free.free(), true, 'rank._free must be a free node');
        }

        if (rank._lossOne !== null) {
            assert.equal(rank._lossOne._rank, rank, 'rank._lossOne points to wrong rank');
            assert.equal(rank._lossOne.fixed(), true, 'rank._lossOne must be fixed');
            assert.equal(rank._lossOne._loss, 1, 'rank._lossOne must have loss 1');
        }

        prev = rank;
        rank = rank._inc;
    }
}

/**
 * Validate fix-list consistency and section placement.
 */
function validateFixList(heap, nodes = null) {
    assert.equal(heap._active, true, 'validateFixList requires active heap');

    if (heap._size === 0) {
        for (const section of Heap.FIX_LIST_SECTIONS) {
            assert.equal(heap[section], null, `fix-list section ${section} must be null`);
        }
        return;
    }

    const head = heap.fixListHead();
    assert.notEqual(head, null, 'fix-list head is null for non-empty heap');

    for (const section of Heap.FIX_LIST_SECTIONS) {
        const sectionHead = heap[section];
        if (sectionHead !== null) {
            assert.equal(sectionHead.section(), section, `section head mismatch for ${section}`);
        }
    }

    const expectedNodes = Array.isArray(nodes) ?
        nodes :
        (heap._root ? allNodes(heap) : []);
    const expectedSet = new Set(expectedNodes);

    const seen = new Set();
    let current = head;
    while (true) {
        if (seen.has(current)) {
            assert.equal(current, head, 'fix-list cycle does not close at head');
            break;
        }

        assert.equal(current._next._prev, current, 'broken fix-list next/prev links');
        assert.equal(current._prev._next, current, 'broken fix-list prev/next links');

        const expectedSection = current.section();
        assert.notEqual(heap[expectedSection], null, `node classified in missing section ${expectedSection}`);

        seen.add(current);
        current = current._next;
    }

    // Stronger section-order and grouping checks (ported from sfh_v2.py)
    let node = head;

    if (heap._passive !== null) {
        assert.equal(heap._passive, node, 'passive section must start at current node');
        assert.equal(node.passive(), true, 'passive section must contain passive nodes');
        node = node._next;
        while (node !== head && node.passive()) {
            node = node._next;
        }
    }

    const freeRanks = new Set();
    if (heap._freeMultiple !== null) {
        assert.equal(node, heap._freeMultiple, 'freeMultiple section head mismatch');
        assert.equal(node !== node._next, true, 'freeMultiple needs at least 2 nodes');
        assert.equal(node._next !== head, true, 'freeMultiple group cannot wrap immediately to head');
        assert.equal(node.free(), true, 'freeMultiple node must be free');
        assert.equal(node._next.free(), true, 'freeMultiple next must be free');
        assert.equal(node._rank, node._next._rank, 'freeMultiple pair must share rank');
        assert.equal(node._rank._free, node, 'rank._free should point to freeMultiple representative');

        freeRanks.add(node._rank._rank);
        node = node._next;

        while (node !== head && node.free() && node._rank === node._prev._rank) {
            node = node._next;
        }

        while (
            node !== head &&
            node.free() &&
            node._next !== head &&
            node._next.free() &&
            node._rank === node._next._rank
        ) {
            assert.equal(freeRanks.has(node._rank._rank), false, 'duplicate freeMultiple rank group');
            freeRanks.add(node._rank._rank);
            node = node._next;
            while (node !== head && node.free() && node._rank === node._prev._rank) {
                node = node._next;
            }
        }
    }

    if (heap._freeSingle !== null) {
        assert.equal(heap._freeSingle, node, 'freeSingle section head mismatch');
        assert.equal(node.free(), true, 'freeSingle node must be free');
        assert.equal(freeRanks.has(node._rank._rank), false, 'freeSingle rank duplicated from freeMultiple');
        assert.equal(
            heap._freeMultiple !== null || node._rank._free === node,
            true,
            'rank._free should point at freeSingle when no freeMultiple exists'
        );
        freeRanks.add(node._rank._rank);
        node = node._next;
        while (node !== head && node.free()) {
            assert.equal(freeRanks.has(node._rank._rank), false, 'duplicate freeSingle rank');
            freeRanks.add(node._rank._rank);
            node = node._next;
        }
    }

    if (heap._lossZero !== null) {
        assert.equal(node, heap._lossZero, 'lossZero section head mismatch');
        assert.equal(node.fixed(), true, 'lossZero node must be fixed');
        assert.equal(node._loss, 0, 'lossZero node must have loss 0');
        node = node._next;
        while (node !== head && node.fixed() && node._loss === 0) {
            node = node._next;
        }
    }

    const lossOneRanks = new Set();
    if (heap._lossOneMultiple !== null) {
        assert.equal(node, heap._lossOneMultiple, 'lossOneMultiple section head mismatch');
        assert.equal(node !== node._next, true, 'lossOneMultiple needs at least 2 nodes');
        assert.equal(node._next !== head, true, 'lossOneMultiple group cannot wrap immediately to head');
        assert.equal(node.fixed(), true, 'lossOneMultiple node must be fixed');
        assert.equal(node._next.fixed(), true, 'lossOneMultiple next must be fixed');
        assert.equal(node._loss, 1, 'lossOneMultiple node loss must be 1');
        assert.equal(node._next._loss, 1, 'lossOneMultiple next loss must be 1');
        assert.equal(node._rank, node._next._rank, 'lossOneMultiple pair must share rank');
        assert.equal(node._rank._lossOne, node, 'rank._lossOne should point to representative');

        lossOneRanks.add(node._rank._rank);
        node = node._next;

        while (
            node !== head &&
            node.fixed() &&
            node._loss === 1 &&
            node._rank === node._prev._rank
        ) {
            node = node._next;
        }

        while (
            node !== head &&
            node.fixed() &&
            node._loss === 1 &&
            node._next !== head &&
            node._next.fixed() &&
            node._next._loss === 1 &&
            node._rank === node._next._rank
        ) {
            assert.equal(lossOneRanks.has(node._rank._rank), false, 'duplicate lossOneMultiple rank group');
            lossOneRanks.add(node._rank._rank);
            node = node._next;
            while (
                node !== head &&
                node.fixed() &&
                node._loss === 1 &&
                node._rank === node._prev._rank
            ) {
                node = node._next;
            }
        }
    }

    if (heap._lossOneSingle !== null) {
        assert.equal(node, heap._lossOneSingle, 'lossOneSingle section head mismatch');
        assert.equal(node.fixed(), true, 'lossOneSingle node must be fixed');
        assert.equal(node._loss, 1, 'lossOneSingle loss must be 1');
        assert.equal(lossOneRanks.has(node._rank._rank), false, 'lossOneSingle rank duplicated from lossOneMultiple');
        assert.equal(
            heap._lossOneMultiple !== null || node._rank._lossOne === node,
            true,
            'rank._lossOne should point at lossOneSingle when no multiple group exists'
        );
        lossOneRanks.add(node._rank._rank);
        node = node._next;
        while (node !== head && node.fixed() && node._loss === 1) {
            assert.equal(lossOneRanks.has(node._rank._rank), false, 'duplicate lossOneSingle rank');
            lossOneRanks.add(node._rank._rank);
            node = node._next;
        }
    }

    if (heap._lossTwo !== null) {
        assert.equal(node, heap._lossTwo, 'lossTwo section head mismatch');
        assert.equal(node.fixed(), true, 'lossTwo node must be fixed');
        assert.equal(node._loss >= 2, true, 'lossTwo node must have loss >= 2');
        node = node._next;
        while (node !== head && node.fixed() && node._loss >= 2) {
            node = node._next;
        }
    }

    assert.equal(node, head, 'fix-list section scan must end at head');

    assert.equal(seen.size, expectedSet.size, 'fix-list node count does not match tree node count');
    for (const node of seen) {
        assert.equal(expectedSet.has(node), true, 'fix-list contains node not reachable from root');
    }
    for (const node of expectedSet) {
        assert.equal(seen.has(node), true, 'reachable node missing from fix-list');
    }
}

/**
 * Validate heap structural invariants.
 */
function validate(heap) {
    failureTracker.record({
        label: 'validate(heap)',
        kind: 'validation',
        heaps: [{
            name: 'heap',
            heap
        }]
    });

    assert.equal(heap._active, true, 'validate requires active heap');

    if (heap._size === 0) {
        assert.equal(heap._root, null, 'empty heap must have null root');
        validateRankList(heap, []);
        validateFixList(heap, []);
        return;
    }

    assert.notEqual(heap._root, null, 'non-empty heap must have root');
    const nodes = allNodes(heap);
    assert.equal(nodes.length, heap._size, 'heap size does not match reachable node count');

    const size = nodes.length;
    const passiveCount = nodes.filter((node) => node.passive()).length;
    const R = (5 / 4) * Math.log2(size) + 6;
    const deltaArg = 3 * size - passiveCount;
    assert.equal(deltaArg > 0, true, 'Delta argument must be positive');
    const Delta = (5 / 2) * Math.log2(deltaArg) + 14;

    // Invariant I2: number of free nodes is bounded by R + 1
    const freeCount = nodes.filter((node) => node.free()).length;
    assert.equal(freeCount <= R + 1, true, 'Invariant I2 violated: too many free nodes');

    // Invariant I3: sum of losses over fixed nodes is bounded by R + 1
    const lossSum = nodes
        .filter((node) => node.fixed() && node._loss != null)
        .reduce((sum, node) => sum + node._loss, 0);
    assert.equal(lossSum <= R + 1, true, 'Invariant I3 violated: loss sum too high');

    const seen = new Set();
    for (const node of nodes) {
        assert.equal(seen.has(node), false, 'duplicate node encountered in traversal');
        seen.add(node);

        assert.equal(node._left._right, node, 'broken child-ring left/right pointers');
        assert.equal(node._right._left, node, 'broken child-ring right/left pointers');
        assert.notEqual(node._rank, null, 'node rank must not be null in active heap');

        if (node._parent !== null) {
            assert.equal(node._parent.gt(node), false, 'heap order violated');
        }

        if (node.passive()) {
            assert.equal(node.heap()._size, 0, 'passive node should belong to inactive heap');
        }

        if (node.active()) {
            assert.equal(node.heap(), heap, 'active node must belong to current heap');
        }

        if (node.fixed()) {
            assert.notEqual(node._parent, null, 'fixed node must have parent');
            assert.equal(node._parent.active(), true, 'fixed node parent must be active');
        }

        if (node.free()) {
            assert.equal(node._loss, 0, 'free nodes must have loss 0');
        }
        let fixedChildren = 0;
        let allowPassive = true;
        const children = node.children();
        for (let i = children.length - 1; i >= 0; i -= 1) {
            const child = children[i];
            if (child.active()) {
                if (child.fixed()) {
                    fixedChildren += 1;
                    // Invariant I1: i-th rightmost fixed child has rank + loss >= i - 1
                    assert.equal(
                        child._rank._rank + child._loss >= fixedChildren - 1,
                        true,
                        'Invariant I1 violated for fixed child rank/loss bound'
                    );
                }
                allowPassive = false;
            } else {
                assert.equal(child.passive(), true, 'inactive child must be passive');
                assert.equal(allowPassive, true, 'active children must be left of passive children');
            }
        }

        if (node.active()) {
            assert.equal(node._rank._rank, fixedChildren, 'rank must equal number of fixed children');
        }

        // Invariant I4: degree bound
        const degree = children.length;
        if (node.active()) {
            assert.equal(degree <= Delta, true, 'Invariant I4 violated: active node degree too high');
            assert.equal(node._rank._rank <= R, true, 'active node rank exceeds R bound');
        } else {
            assert.equal(degree <= Delta - 1, true, 'Invariant I4 violated: passive node degree too high');
        }

        for (const child of node.children()) {
            assert.equal(child._parent, node, 'child parent pointer mismatch');
        }
    }

    let minNode = nodes[0];
    for (let i = 1; i < nodes.length; i += 1) {
        if (minNode.gt(nodes[i])) {
            minNode = nodes[i];
        }
    }
    assert.equal(heap._root, minNode, 'root is not minimum node');

    validateRankList(heap, nodes);
    validateFixList(heap, nodes);
}

/**
 * Validate heap content against expected key list (Python S list equivalent).
 */
function validateAgainstExpectedKeys(heap, expectedKeys) {
    failureTracker.record({
        label: 'validateAgainstExpectedKeys',
        kind: 'validation',
        heaps: [{
            name: 'heap',
            heap
        }],
        details: {
            expectedSize: expectedKeys.length
        }
    });

    validate(heap);

    if (heap.empty()) {
        assert.equal(expectedKeys.length, 0, 'Empty heap should have empty expected list');
        return;
    }

    const nodes = allNodes(heap);
    const actualKeys = nodes.map(n => n._key).sort((a, b) => a - b);
    const expected = [...expectedKeys].sort((a, b) => a - b);
    assert.deepEqual(actualKeys, expected, 'Heap contents should match expected keys');
}

/**
 * Insert a key and return the newly created node.
 * Useful for tests that need to reference specific nodes later (e.g., for decreaseKey or delete).
 */
function insertAndReturnNode(heap, key) {
    const beforeIds = new Set(allNodes(heap).map((node) => node._id));
    applyAllSteps(heap.insert(key), {
        label: `insert(${key})`,
        heap
    });
    const created = allNodes(heap).filter((node) => !beforeIds.has(node._id));
    assert.equal(created.length, 1);
    return created[0];
}

/**
 * Create sorted list with all items from heap by calling n × deleteMin.
 * Mirrors delete_all from sfh_v2.py.
 * Validates heap structure before each deletion.
 */
function deleteAll(heap) {
    const sorted = [];
    while (!heap.empty()) {
        validate(heap);
        sorted.push(heap._root._key);
        applyAllSteps(heap.deleteMin(), {
            label: 'deleteMin()',
            heap
        });
    }
    validate(heap);
    return sorted;
}

/**
 * Create a heap from an array of key values.
 * Mirrors make_heap from sfh_v2.py.
 */
function makeHeap(items) {
    const heap = new Heap();
    for (const key of items) {
        applyAllSteps(heap.insert(key), {
            label: `makeHeap.insert(${key})`,
            heap
        });
    }
    return heap;
}

/**
 * Sort using n × insert and n × deleteMin.
 * Mirrors test_sorting_insert from sfh_v2.py.
 */
function testSortingInsert(n, seed) {
    const rng = mulberry32(seed);
    const items = randomItems(n, rng);
    const heap = new Heap();

    validate(heap);

    for (const key of items) {
        applyAllSteps(heap.insert(key), {
            label: `testSortingInsert.insert(${key})`,
            heap
        });
        validate(heap);
    }

    const sorted = deleteAll(heap);
    assert.deepEqual(sorted, [...items].sort((a, b) => a - b));
}

/**
 * Sort using (n-1) × meld in random order and n × deleteMin.
 * Mirrors test_sorting_meld from sfh_v2.py.
 */
function testSortingMeld(n, seed) {
    const rng = mulberry32(seed);
    const items = randomItems(n, rng);
    const heaps = [];

    // Create n heaps with one item each
    for (const key of items) {
        const heap = new Heap();
        applyAllSteps(heap.insert(key), {
            label: `testSortingMeld.singleInsert(${key})`,
            heap
        });
        validate(heap);
        heaps.push(heap);
    }

    // Repeatedly meld two random heaps until one heap remains
    while (heaps.length >= 2) {
        const i = randInt(rng, 0, heaps.length - 1);
        const h1 = heaps.splice(i, 1)[0];
        const j = randInt(rng, 0, heaps.length - 1);
        const h2 = heaps.splice(j, 1)[0];

        failureTracker.record({
            label: 'testSortingMeld.meld(h1, h2)',
            kind: 'mutation',
            heaps: [{
                    name: 'h1',
                    heap: h1
                },
                {
                    name: 'h2',
                    heap: h2
                }
            ]
        });

        const {
            larger,
            steps
        } = h1.meld(h2);
        applyAllSteps(steps, {
            label: 'testSortingMeld.meldSteps',
            heap: larger
        });
        validate(larger);
        heaps.push(larger);
    }

    const heap = heaps.pop();
    const sorted = deleteAll(heap);
    assert.deepEqual(sorted, [...items].sort((a, b) => a - b));
}

/**
 * Sort using n × decreaseKey and n × deleteMin.
 * Mirrors test_sorting_decreasekey from sfh_v2.py.
 */
function testSortingDecreaseKey(n, seed) {
    const rng = mulberry32(seed);
    const targetKeys = randomItems(n, rng);
    const heap = new Heap();
    const pairs = [];

    validate(heap);

    // Create heap with n items each with the same large key
    for (const target of targetKeys) {
        const node = insertAndReturnNode(heap, n + 1);
        pairs.push({
            node,
            target
        });
        validate(heap);
    }

    // Decrease keys to the items' real values
    shuffleInPlace(pairs, rng);
    for (const {
            node,
            target
        }
        of pairs) {
        applyAllSteps(heap.decreaseKey(node, target), {
            label: `testSortingDecreaseKey.decreaseKey(${node._id}, ${target})`,
            heap
        });
        validate(heap);
    }

    const sorted = deleteAll(heap);
    assert.deepEqual(sorted, [...targetKeys].sort((a, b) => a - b));
}

/**
 * Sort n items with a sample removed using delete.
 * Mirrors test_sorting_sample from sfh_v2.py.
 */
function testSortingSample(n, seed, deleteProbability = 0.5) {
    const rng = mulberry32(seed);
    const items = randomItems(n, rng);
    const heap = new Heap();
    const nodes = [];

    validate(heap);

    // Create heap with n nodes
    for (const key of items) {
        const node = insertAndReturnNode(heap, key);
        nodes.push({
            node,
            key
        });
        validate(heap);
    }

    shuffleInPlace(nodes, rng);
    const remaining = [];

    // Remove sample
    for (const {
            node,
            key
        }
        of nodes) {
        if (rng() < deleteProbability) {
            applyAllSteps(heap.delete(node), {
                label: `testSortingSample.delete(node#${node._id})`,
                heap
            });
            validate(heap);
        } else {
            remaining.push(key);
        }
    }

    const sorted = deleteAll(heap);
    assert.deepEqual(sorted, remaining.sort((a, b) => a - b));
}

/**
 * Test the makeHeap function with n items.
 * Mirrors test_make_heap from sfh_v2.py.
 */
function testMakeHeap(n, seed) {
    const rng = mulberry32(seed);
    const items = randomItems(n, rng);
    const heap = makeHeap(items);

    validate(heap);
    assert.equal(heap.empty(), false);
    assert.equal(heap._size, n);

    const sorted = deleteAll(heap);
    assert.deepEqual(sorted, [...items].sort((a, b) => a - b));
}

/**
 * Test a random sequence of n heap operations.
 * Mirrors test_random_operations from sfh_v2.py.
 * 
 * We maintain expected key lists (Python S list equivalent) for each heap.
 * After each iteration we validate both structure and key multiset equality.
 */
function testRandomOperations(n, seed) {
    const rng = mulberry32(seed);
    const heaps = []; // Each entry: { heap, keys, id }
    let heapId = 0;

    for (let iteration = 1; iteration <= n; iteration += 1) {
        const p = rng();

        // New heap (5% probability or if no heaps exist)
        if (heaps.length === 0 || p < 0.05) {
            const heap = new Heap();
            heaps.push({
                heap,
                keys: [],
                id: heapId
            });
            heapId += 1;
            validate(heap);
        }
        // Meld (5% probability if at least 2 heaps)
        else if (p < 0.1 && heaps.length >= 2) {
            const i = randInt(rng, 0, heaps.length - 1);
            const first = heaps.splice(i, 1)[0];
            const j = randInt(rng, 0, heaps.length - 1);
            const second = heaps.splice(j, 1)[0];

            failureTracker.record({
                label: `meld(heap${first.id}, heap${second.id})`,
                kind: 'mutation',
                heaps: [{
                        name: `heap${first.id}`,
                        heap: first.heap
                    },
                    {
                        name: `heap${second.id}`,
                        heap: second.heap
                    }
                ]
            });

            const {
                larger,
                steps
            } = first.heap.meld(second.heap);
            applyAllSteps(steps, {
                label: `testRandomOperations.meldSteps(heap${first.id}, heap${second.id})`,
                heap: larger
            });

            heaps.push({
                heap: larger,
                keys: first.keys.concat(second.keys),
                id: heapId
            });
            heapId += 1;
            validate(larger);
        }
        // Decrease key (40% probability if heap exists and is non-empty)
        else if (p < 0.5) {
            const entry = heaps[randInt(rng, 0, heaps.length - 1)];
            if (!entry.heap.empty()) {
                const nodes = allNodes(entry.heap);
                const node = nodes[randInt(rng, 0, nodes.length - 1)];
                const oldKey = node._key;
                const newKey = randInt(rng, oldKey - 25, oldKey - 1);

                applyAllSteps(entry.heap.decreaseKey(node, newKey), {
                    label: `testRandomOperations.decreaseKey(${node._id}, ${newKey})`,
                    heap: entry.heap
                });

                removeOne(entry.keys, oldKey);
                entry.keys.push(newKey);
                validate(entry.heap);
            }
        }
        // Insert (30% probability)
        else if (p < 0.8) {
            const entry = heaps[randInt(rng, 0, heaps.length - 1)];
            const key = randInt(rng, 1, 100);

            applyAllSteps(entry.heap.insert(key), {
                label: `testRandomOperations.insert(${key})`,
                heap: entry.heap
            });

            entry.keys.push(key);
            validate(entry.heap);
        }
        // Delete min (20% probability if heap is non-empty)
        else {
            const entry = heaps[randInt(rng, 0, heaps.length - 1)];
            if (!entry.heap.empty()) {
                const expectedMin = Math.min(...entry.keys);
                failureTracker.record({
                    label: 'testRandomOperations.assertRootIsExpectedMin',
                    kind: 'validation',
                    heaps: [{
                        name: `heap${entry.id}`,
                        heap: entry.heap
                    }],
                    details: {
                        expectedMin
                    }
                });
                assert.equal(entry.heap._root._key, expectedMin, 'Root should be minimum');

                removeOne(entry.keys, expectedMin);
                applyAllSteps(entry.heap.deleteMin(), {
                    label: 'testRandomOperations.deleteMin()',
                    heap: entry.heap
                });
                validate(entry.heap);
            }
        }

        // Validate all heaps at end of each iteration (like sfh_v2.py)
        for (const entry of heaps) {
            validateAgainstExpectedKeys(entry.heap, entry.keys);
        }
    }
}

/**
 * Main test runner.
 * Test cases mirror the structure from sfh_v2.py's main block.
 */
function run() {
    const options = parseCliOptions();

    if (options.loopRandom) {
        runRandomOperationsLoop(options.seed);
        return;
    }

    const start = Date.now();
    console.log('Running Strict Fibonacci Heap tests...\n');

    // Sorting tests with insert
    runCase('testSortingInsert(1, 1)', () => testSortingInsert(1, 1));
    runCase('testSortingInsert(10, 2)', () => testSortingInsert(10, 2));
    runCase('testSortingInsert(100, 3)', () => testSortingInsert(100, 3));

    // Sorting tests with meld
    runCase('testSortingMeld(1, 10)', () => testSortingMeld(1, 10));
    runCase('testSortingMeld(10, 11)', () => testSortingMeld(10, 11));
    runCase('testSortingMeld(100, 12)', () => testSortingMeld(100, 12));

    // Sorting tests with decreaseKey
    runCase('testSortingDecreaseKey(1, 20)', () => testSortingDecreaseKey(1, 20));
    runCase('testSortingDecreaseKey(10, 21)', () => testSortingDecreaseKey(10, 21));
    runCase('testSortingDecreaseKey(100, 22)', () => testSortingDecreaseKey(100, 22));

    // Sorting tests with delete (sample)
    runCase('testSortingSample(10, 30)', () => testSortingSample(10, 30));
    runCase('testSortingSample(100, 31)', () => testSortingSample(100, 31));

    // Make heap test
    runCase('testMakeHeap(100, 40)', () => testMakeHeap(100, 40));

    // Random operations test
    const randomOperationSeeds = [123456789, 987654321, 112233445, 101010101, 789456123];
    for (const seed of randomOperationSeeds) {
        runCase(
            `testRandomOperations(${RANDOM_OPS_PER_TEST}, ${seed})`,
            () => testRandomOperations(RANDOM_OPS_PER_TEST, seed)
        );
    }

    const ms = Date.now() - start;
    console.log(`\n=== ALL TESTS PASSED in ${ms} ms ===`);
}

run();