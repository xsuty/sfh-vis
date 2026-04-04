import {
    HEAP_CY_STYLE,
    LISTS_CY_STYLE
} from './cy-styles.js';
import * as C from './constants.js';
import {
    initAppState
} from './app-state.js';
import {
    getStepsManager
} from './steps-manager.js';
import {
    getHeapManager
} from './heap-manager.js';
import {
    renderHeap,
    renderLists,
    setupNodeClick,
    setupNodeInspect,
    setupPlaceholderClick,
    makeDrawerResizable
} from './rendering.js';
import {
    getUIComputed
} from './ui-computed.js';

const {
    createApp,
    onMounted,
    watch,
    nextTick
} = Vue;

createApp({
    setup() {
        const appState = initAppState();
        const stepsManager = getStepsManager(renderCy);
        const heapManager = getHeapManager(appState, stepsManager, renderCy);
        const ui = getUIComputed(appState, heapManager, stepsManager);

        stepsManager.setActiveHeapId(appState.getCurrentHeap()._heapId);

        let heapCy = null;
        let listsCy = null;
        let skipNextGapRender = false;

        function defaultFixRankGap(isAdvanced) {
            return isAdvanced ? C.ADVANCED_FIX_RANK_GAP : C.BASIC_FIX_RANK_GAP;
        }

        function initHeapCy(container) {
            heapCy = cytoscape({
                container,
                maxZoom: 4,
                style: HEAP_CY_STYLE,
                layout: {
                    name: 'preset'
                }
            });
        }

        function initListsCy(container) {
            if (listsCy) throw new Error('listsCy already initialized');
            listsCy = cytoscape({
                container,
                maxZoom: 4,
                style: LISTS_CY_STYLE,
                layout: {
                    name: 'preset'
                }
            });
        }

        function renderCy(options = {}) {
            if (!heapCy) throw new Error('heapCy not initialized');
            renderHeap(appState, heapCy, listsCy);
            if (appState.drawerOpen.value) {
                if (!listsCy) throw new Error('listsCy not initialized');
                const heap = appState.getCurrentHeap();
                if (!heap) throw new Error('incorrect heap index');
                const activeDefaultGap = defaultFixRankGap(appState.advancedView.value);
                const rankListGap = appState.fixRankGap.value === activeDefaultGap ? undefined : appState.fixRankGap.value;
                nextTick(() => renderLists(heap, appState.advancedView, appState.ctx, listsCy, {
                    collapsedSections: appState.fixListCollapsedSections.value,
                    rankListGap
                }, options));
            }
        }

        watch(() => appState.advancedView.value, (isAdvanced, wasAdvanced) => {
            const previousDefault = defaultFixRankGap(wasAdvanced);
            const nextDefault = defaultFixRankGap(isAdvanced);

            // Keep user custom value; only switch when the gap was still at the prior mode default.
            if (appState.fixRankGap.value === previousDefault) {
                skipNextGapRender = true;
                appState.fixRankGap.value = nextDefault;
            }

            renderCy({ fit: true });
        });

        watch(() => appState.fixRankGap.value, () => {
            if (skipNextGapRender) {
                skipNextGapRender = false;
                return;
            }
            renderCy({ fit: false });
        });
        watch(() => appState.fixListCollapsedSections.value, renderCy, {
            deep: true
        });

        watch(() => appState.drawerOpen.value, (open) => {
            if (open) {
                if (!listsCy) throw new Error('listsCy not initialized');
                listsCy.resize();
                listsCy.fit(undefined, C.LISTS_PADDING);
                renderCy();
            }
        });

        function toggleFixListSection(section) {
            appState.fixListCollapsedSections.value = {
                ...appState.fixListCollapsedSections.value,
                [section]: !appState.fixListCollapsedSections.value[section]
            };
        }

        onMounted(() => {
            initHeapCy(document.getElementById(C.HEAP_CY_DOM));
            initListsCy(document.getElementById(C.LISTS_CY_DOM));
            setupNodeClick(heapCy, appState, heapManager.isBusy);
            setupNodeInspect(heapCy, appState);
            setupNodeInspect(listsCy, appState);
            setupPlaceholderClick(listsCy, appState);
            makeDrawerResizable({
                drawerOpen: appState.drawerOpen,
                drawerHeight: appState.drawerHeight,
                handle: document.getElementById(C.DRAWER_HANDLE_DOM),
                listsDiv: document.getElementById(C.LISTS_CY_DOM),
                listsCy
            });
        });

        return {
            ...appState,
            ...stepsManager,
            ...heapManager,
            ...ui,
            fixListSections: C.FIX_LIST_SECTIONS,
            toggleFixListSection,
            MAX_HEAPS: C.MAX_HEAPS,
            FIX_RANK_GAP_MIN: C.FIX_RANK_GAP_MIN,
            FIX_RANK_GAP_MAX: C.FIX_RANK_GAP_MAX
        };
    }
}).mount('#app');