const {
    computed
} = Vue;

export function getUIComputed(appState, heapManager, stepsManager) {
    const statusText = computed(() => {
        if (stepsManager.stepping.value) return 'Stepping through operation...';
        if (heapManager.mergeState.value.mode) return 'Select two heaps to merge';
        return 'Select an operation';
    });

    const canInsert = computed(() => !heapManager.isBusy());
    const canDeleteMin = computed(() =>
        !heapManager.isBusy() && !appState.getCurrentHeap().empty()
    );
    const canMeldHeaps = computed(() =>
        !heapManager.isBusy() && appState.getHeapCount() > 1
    );

    const canExportHeap = computed(() =>
        !heapManager.isBusy() && !appState.getCurrentHeap().empty()
    );

    const heapTabClasses = computed(() =>
        appState.heaps.value.map((_, index) => ({
            active: appState.currentHeapIndex.value === index &&
                !heapManager.mergeState.value.mode,
            merge: heapManager.mergeState.value.mode,
            selected: heapManager.mergeState.value.first === index ||
                heapManager.mergeState.value.second === index
        }))
    );

    const logStyles = computed(() =>
        stepsManager.stepLogs.value.map(log => ({
            paddingLeft: `${log.level * 16}px`
        }))
    );

    const listsCyStyle = computed(() => ({
        height: appState.drawerOpen.value ?
            `${appState.drawerHeight.value}px` : ''
    }));

    return {
        statusText,
        canInsert,
        canDeleteMin,
        canMeldHeaps,
        canExportHeap,
        heapTabClasses,
        logStyles,
        listsCyStyle
    };
}