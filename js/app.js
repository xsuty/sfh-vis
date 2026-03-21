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
    setupListsInspect,
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

        let heapCy = null;
        let listsCy = null;

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

        function renderCy() {
            if (!heapCy) throw new Error('heapCy not initialized');
            renderHeap(appState, heapCy, listsCy);
            if (appState.drawerOpen.value) {
                if (!listsCy) throw new Error('listsCy not initialized');
                const heap = appState.getCurrentHeap();
                if (!heap) throw new Error('incorrect heap index');
                nextTick(() => renderLists(heap, appState.advancedView, appState.selectedNode, appState.ctx, listsCy, {
                    collapsedSections: appState.fixListCollapsedSections.value
                }));
            }
        }

        watch(() => appState.advancedView.value, renderCy);
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

        function toggleAllFixListSections() {
            const allCollapsed = Object.values(appState.fixListCollapsedSections.value).every(v => v);
            appState.fixListCollapsedSections.value = Object.fromEntries(
                C.FIX_LIST_SECTIONS.map(section => [section, !allCollapsed])
            );
        }

        onMounted(() => {
            initHeapCy(document.getElementById(C.HEAP_CY_DOM));
            initListsCy(document.getElementById(C.LISTS_CY_DOM));
            setupNodeClick(heapCy, appState, heapManager.isBusy);
            setupListsInspect(listsCy, appState);
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
            toggleAllFixListSections,
            MAX_HEAPS: C.MAX_HEAPS
        };
    }
}).mount('#app');