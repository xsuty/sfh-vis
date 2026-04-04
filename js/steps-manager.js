const {
    ref,
    computed
} = Vue

export function getStepsManager(renderCy) {
    const pendingSteps = ref([]);
    const heapStepLogs = ref({});
    const currentHeapId = ref(null);
    const stepIndex = ref(0);
    const stepping = ref(false);
    const levelCounts = ref([])

    const stepLogs = computed(() => {
        if (currentHeapId.value == null) return [];
        return heapStepLogs.value[currentHeapId.value] || [];
    });

    function setActiveHeapId(heapId) {
        if (heapId == null) throw new Error('Heap id must be provided to setActiveHeapId');
        currentHeapId.value = heapId;
        if (!heapStepLogs.value[heapId]) {
            heapStepLogs.value[heapId] = [];
        }
    }

    function startSteps(steps) {
        if (!steps || steps.length === 0) throw new Error("No steps provided to startSteps");
        if (currentHeapId.value == null) throw new Error('Cannot start steps without an active heap id');
        pendingSteps.value = steps.map(s => ({
            ...s,
            level: 0,
            indexPath: []
        }));
        levelCounts.value = [];
        stepIndex.value = 0;
        stepping.value = true;
        heapStepLogs.value[currentHeapId.value] = [];
        nextStep();
    }

    function nextStep() {
        if (!stepping.value) throw new Error("Cannot call nextStep when not stepping");

        const step = pendingSteps.value[stepIndex.value];

        if (levelCounts.value[step.level] == null) levelCounts.value[step.level] = 0;
        if (!step.silent) levelCounts.value[step.level]++;
        levelCounts.value.length = step.level + 1;
        const index = levelCounts.value[step.level];

        if (typeof step.apply !== 'function') {
            throw new Error('Step is missing apply()');
        }

        const result = step.apply();

        if (Array.isArray(result) && result.length > 0) {
            const nested = result.map(s => ({
                ...s,
                level: step.nest ? step.level + 1 : step.level,
                indexPath: step.nest ? [...step.indexPath, index] : [...step.indexPath]
            }));
            pendingSteps.value.splice(stepIndex.value + 1, 0, ...nested);
        }

        step.indexPath = [...step.indexPath, index];

        if (step.label) {
            heapStepLogs.value[currentHeapId.value].push({
                text: `${step.indexPath.join('.')} ${step.label}`,
                level: step.level
            });
        }

        stepIndex.value++;
        renderCy();

        if (stepIndex.value >= pendingSteps.value.length) {
            stepping.value = false;
            return;
        }

        const nxt = pendingSteps.value[stepIndex.value];
        if (nxt.silent) {
            nextStep();
        }
    }

    function skipSteps() {
        if (!stepping.value) throw new Error("Cannot call skipSteps when not stepping");
        while (stepping.value) {
            nextStep();
        }
    }

    return {
        stepLogs,
        stepping,
        startSteps,
        nextStep,
        skipSteps,
        setActiveHeapId
    };
}