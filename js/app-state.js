import * as C from './constants.js';
import {
    Heap
} from './heap.js';
const {
    ref
} = Vue

export function initAppState() {
    const heaps = ref([new Heap()]);
    heaps.value[0]._heapId = 1;
    const currentHeapIndex = ref(0);

    const canvas = document.createElement('canvas');

    function getHeap(index) {
        return heaps.value[index];
    }

    function getCurrentHeap() {
        return heaps.value[currentHeapIndex.value];
    }

    function getHeapCount() {
        return heaps.value.length;
    }

    return {
        heaps,
        currentHeapIndex,
        nodesById: {},
        selectedNode: ref(null),
        advancedView: ref(false),
        nodeModalOpen: ref(false),
        newKeyInput: ref(null),
        drawerOpen: ref(false),
        drawerHeight: ref(window.innerHeight / 2),
        ctx: canvas.getContext('2d'),
        fixListCollapsedSections: ref(Object.fromEntries(C.FIX_LIST_SECTIONS.map(section => [section, false]))),
        getHeap,
        getCurrentHeap,
        getHeapCount
    };
}