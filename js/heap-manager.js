import {
    Heap
} from './heap.js';
import {
    MAX_HEAPS
} from './constants.js';
const {
    ref
} = Vue;

export function getHeapManager(appState, stepsManager, renderCy) {
    const inputValue = ref(null);
    const nextHeapId = ref(2);
    const mergeState = ref({
        mode: false,
        first: null,
        second: null
    });

    function isBusy() {
        return stepsManager.stepping.value || mergeState.value.mode;
    }

    function clickHeap(index) {
        if (stepsManager.stepping.value) throw new Error('state inconsistency: should not be able to click heaps while stepping');
        if (mergeState.value.mode) {
            toggleMergeSelect(index);
            return;
        }
        appState.currentHeapIndex.value = index;
        renderCy();
    }

    function addHeap() {
        if (isBusy()) throw new Error('state inconsistency: should not be able to add heaps while busy');
        if (appState.getHeapCount() >= MAX_HEAPS) throw new Error(`Cannot have more than ${MAX_HEAPS} heaps`);
        const newHeap = new Heap();
        newHeap._heapId = nextHeapId.value++;
        appState.heaps.value.push(newHeap);
        appState.currentHeapIndex.value = appState.getHeapCount() - 1;
        renderCy();
    }

    function deleteHeap(index) {
        if (isBusy()) throw new Error('state inconsistency: should not be able to delete heaps while busy');
        if (appState.getHeapCount() === 1) throw new Error('state inconsistency: should not be able to delete the last heap');
        appState.heaps.value.splice(index, 1);
        if (appState.currentHeapIndex.value >= appState.getHeapCount()) {
            appState.currentHeapIndex.value = appState.getHeapCount() - 1;
        }
        renderCy();
    }

    function meldHeaps() {
        if (appState.getHeapCount() < 2) throw new Error('state inconsistency: should not be able to meld heaps when less than 2 heaps exist');
        mergeState.value.mode = true;
        mergeState.value.first = null;
        mergeState.value.second = null;
    }

    function toggleMergeSelect(index) {
        const s = mergeState.value;
        if (stepsManager.stepping.value) throw new Error('state inconsistency: should not be able to select heaps while stepping');
        if (!s.mode) throw new Error('state inconsistency: not in merge mode');

        if (s.first === index) {
            s.first = null;
            return;
        }
        if (s.second === index) throw new Error('second heap should only be selected once');

        if (s.first === null) {
            s.first = index;
            return;
        }
        if (s.second === null) {
            s.second = index;
            confirmMerge();
        }
    }

    function confirmMerge() {
        const i = mergeState.value.first;
        const j = mergeState.value.second;

        if (i === null || j === null) throw new Error('confirmMerge called with incomplete selection');

        const heap1 = appState.getHeap(i);
        const heap2 = appState.getHeap(j);

        console.log(`Melding heaps ${heap1._heapId} and ${heap2._heapId}`);

        const {
            larger: activeHeap,
            steps
        } = heap1.meld(heap2);

        const keepIndex = Math.min(i, j);
        const removeIndex = Math.max(i, j);

        activeHeap._heapId = appState.getHeap(keepIndex)._heapId;
        appState.heaps.value[keepIndex] = activeHeap;
        appState.heaps.value.splice(removeIndex, 1);

        appState.currentHeapIndex.value = keepIndex;

        mergeState.value.mode = false;
        mergeState.value.first = null;
        mergeState.value.second = null;

        stepsManager.startSteps(steps);
    }

    function insert() {
        if (isBusy()) throw new Error('state inconsistency: should not be able to insert while busy');
        if (inputValue.value == null) {
            alert('Please enter a value to insert');
            return;
        }

        const heap = appState.getCurrentHeap();
        console.log(`Inserting ${inputValue.value} into heap ${heap._heapId}`);
        const steps = heap.insert(inputValue.value);
        inputValue.value = null;
        stepsManager.startSteps(steps);
    }

    function removeMin() {
        if (isBusy()) throw new Error('state inconsistency: should not be able to remove min while busy');

        const heap = appState.getCurrentHeap();
        if (heap.empty()) throw new Error('state inconsistency: should not be able to remove min from empty heap');

        console.log(`Removing min from heap ${heap._heapId}`);
        const steps = heap.deleteMin();
        stepsManager.startSteps(steps);
    }

    function decreaseKey(newKey) {
        if (isBusy() || !appState.selectedNode.value) throw new Error('state inconsistency: should not be able to decrease key while busy or with no selected node');

        const heap = appState.getCurrentHeap();
        if (newKey >= appState.selectedNode.value._key) {
            alert('New key must be smaller than current key');
            return;
        }

        console.log(`Decreasing key of node ${appState.selectedNode.value._key} to ${newKey} in heap ${heap._heapId}`);
        const steps = heap.decreaseKey(appState.selectedNode.value, newKey);
        stepsManager.startSteps(steps);

        appState.selectedNode.value = null;
        appState.nodeModalOpen.value = false;
        appState.newKeyInput.value = null;
    }

    function deleteNode() {
        if (isBusy() || !appState.selectedNode.value) throw new Error('state inconsistency: should not be able to delete node while busy or with no selected node');

        const heap = appState.getCurrentHeap();
        console.log(`Deleting node ${appState.selectedNode.value._key} from heap ${heap._heapId}`);
        const steps = heap.delete(appState.selectedNode.value);
        stepsManager.startSteps(steps);

        appState.selectedNode.value = null;
        appState.nodeModalOpen.value = false;
        appState.newKeyInput.value = null;
    }

    return {
        inputValue,
        mergeState,
        isBusy,
        clickHeap,
        addHeap,
        deleteHeap,
        meldHeaps,
        insert,
        removeMin,
        decreaseKey,
        deleteNode
    };
}