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

    function validateIntegerKey(value) {
        if (value === null || value === undefined || value === '') return false;
        const numberValue = Number(value);
        if (Number.isNaN(numberValue)) return false;
        if (!Number.isInteger(numberValue)) return false;
        return true;
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
        if (!validateIntegerKey(inputValue.value)) {
            alert('Please enter an integer value for the key');
            return;
        }

        const value = Number(inputValue.value);

        const heap = appState.getCurrentHeap();
        console.log(`Inserting ${value} into heap ${heap._heapId}`);
        const steps = heap.insert(value);
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
        if (!validateIntegerKey(newKey)) {
            alert('Please enter an integer value for the new key');
            return;
        }

        const keyValue = Number(newKey);
        if (keyValue >= appState.selectedNode.value._key) {
            alert('New key must be smaller than current key');
            return;
        }

        const heap = appState.getCurrentHeap();
        console.log(`Decreasing key of node ${appState.selectedNode.value._key} to ${keyValue} in heap ${heap._heapId}`);
        const steps = heap.decreaseKey(appState.selectedNode.value, keyValue);
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

    function exportHeap() {
        if (isBusy()) throw new Error('state inconsistency: should not be able to export while busy');

        const heap = appState.getCurrentHeap();

        if (heap.empty()) {
            alert('Cannot export an empty heap');
            return;
        }

        const data = heap.serialize();

        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `heap_${heap._heapId}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`Exported heap ${heap._heapId}`);
    }

    function triggerImportHeap() {
        if (isBusy()) throw new Error('state inconsistency: should not be able to import while busy');

        const fileInput = document.getElementById('importHeapFile');
        fileInput.click();
    }

    function handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const heap = appState.getCurrentHeap();

        const isEmpty = heap._size === 0;

        if (!isEmpty) {
            const confirmed = confirm(
                'Warning: Importing will overwrite the current heap and all its data will be lost. Do you want to continue?'
            );
            if (!confirmed) {
                event.target.value = '';
                return;
            }
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const newHeap = Heap.deserialize(data);

                const currentIndex = appState.currentHeapIndex.value;
                const currentHeapId = appState.heaps.value[currentIndex]._heapId;
                newHeap._heapId = currentHeapId;

                appState.heaps.value[currentIndex] = newHeap;

                console.log(`Imported heap into heap ${currentHeapId}`);
                renderCy();
            } catch (error) {
                alert(`Failed to import heap: ${error.message}`);
                console.error('Import error:', error);
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
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
        deleteNode,
        exportHeap,
        triggerImportHeap,
        handleImportFile
    };
}