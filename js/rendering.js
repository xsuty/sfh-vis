import * as C from './constants.js';

// === Public UI Functions ===
export function setupNodeClick(heapCy, appState, isBusy) {
    heapCy.on('tap', 'node', (evt) => {
        if (isBusy()) return;

        const nodeId = evt.target.id();
        const heapNode = appState.nodesById[nodeId];
        if (!heapNode) throw new Error('Clicked node not found in nodesById');

        appState.selectedNode.value = heapNode;
        appState.newKeyInput.value = heapNode._key;
        appState.nodeModalOpen.value = true;
    });
}

export function makeDrawerResizable({
    drawerOpen,
    drawerHeight,
    handle,
    listsCy,
    listsDiv
}) {
    handle.addEventListener('mousedown', (e) => {
        if (!drawerOpen.value) return;
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = listsDiv.offsetHeight;

        function onMouseMove(e) {
            const dy = startY - e.clientY;
            let newHeight = startHeight + dy;
            const maxHeight = window.innerHeight - C.MAX_DRAWER_HEIGHT_OFFSET;
            newHeight = Math.max(C.MIN_DRAWER_HEIGHT, Math.min(maxHeight, newHeight));

            listsDiv.style.height = newHeight + 'px';
            drawerHeight.value = newHeight;

            if (!listsCy) throw new Error('listsCy not initialized');

            listsCy.resize();
            listsCy.fit(undefined, C.LISTS_PADDING);
        }

        function onMouseUp() {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });
}

// === Public Rendering Functions ===
export function renderHeap(appState, heapCy) {
    if (!heapCy) throw new Error('heapCy not initialized');

    heapCy.elements().remove();

    const heap = appState.getCurrentHeap();
    Object.keys(appState.nodesById).forEach(k => delete appState.nodesById[k]);
    if (!heap._root) return;

    const {
        nodes,
        edges
    } = collectNodes(appState.advancedView, heap._root);
    const elements = [];

    for (const n of nodes) {
        const id = `n${n._id}`;
        appState.nodesById[id] = n;

        elements.push({
            data: {
                id: id,
                label: formatHeapNodeLabel(n, appState.advancedView.value),
                bgColor: nodeColor(n)
            },
            grabbable: !appState.advancedView.value
        });
    }

    for (const e of edges) {
        elements.push(e);
    }

    heapCy.add(elements);
    fitTextIntoNode(heapCy, appState.ctx);
    heapCy.fit(undefined, C.HEAP_PADDING);

    const structureElements = heapCy.elements().filter(el => !el.data('displayOnly'));
    structureElements.layout({
        name: 'dagre',
        rankDir: 'TB',
        ranker: 'tight-tree',
        nodeSep: appState.advancedView.value ? C.ADVANCED_NODE_SEP : C.BASIC_NODE_SEP,
        rankSep: appState.advancedView.value ? C.ADVANCED_RANK_SEP : C.BASIC_RANK_SEP,
        edgeSep: appState.advancedView.value ? C.ADVANCED_EDGE_SEP : C.BASIC_EDGE_SEP,
        marginx: C.MARGIN_X,
        marginy: C.MARGIN_Y
    }).run();

    heapCy.edges('.wrap').forEach(edge => {
        const w = edge.data('segmentWeight');
        setSegmentWeights(edge, w);
    });
}

export function renderLists(heap, advancedView, ctx, listsCy) {
    if (!listsCy) throw new Error('listsCy not initialized');

    listsCy.elements().remove();

    const {
        elements: fixElements,
        fixNodes
    } = createFixList(advancedView, heap);
    const rankElements = createRankList(advancedView, heap);
    listsCy.add([...fixElements, ...rankElements]);

    if (advancedView.value) listsCy.add(linkLists(listsCy, fixNodes));

    fitTextIntoNode(listsCy, ctx);
    listsCy.fit(undefined, C.LISTS_PADDING);

    if (fixNodes.length > 0) {
        const w = 1 / (fixNodes.length * 3);
        listsCy.edges('.wrap').forEach(edge => {
            setSegmentWeights(edge, w);
        });
    }
}

// === Internal Rendering Helpers ===
function collectNodes(advancedView, root) {
    const nodes = [];
    const edges = [];

    function dfs(node, siblingCount, first, last) {
        nodes.push(node);
        const w = 1 / (siblingCount * 4);
        if (advancedView.value) {
            const isSingle = node._left === node;
            edges.push({
                data: {
                    source: `n${node._id}`,
                    target: `n${node._left._id}`,
                    label: 'left',
                    displayOnly: true,
                    segmentWeight: w
                },
                classes: isSingle ? 'single-left' : first ? 'wrap wrap-left' : ''
            });
            edges.push({
                data: {
                    source: `n${node._id}`,
                    target: `n${node._right._id}`,
                    label: 'right',
                    displayOnly: true,
                    segmentWeight: w
                },
                classes: isSingle ? 'single-right' : last ? 'wrap wrap-right' : ''
            });
        }
        const children = node.children()
        for (const child of children) {
            if (!advancedView.value) {
                edges.push({
                    data: {
                        source: `n${node._id}`,
                        target: `n${child._id}`,
                        label: '',
                        displayOnly: false
                    }
                });
            } else {
                const invisible = child !== node.left_child;
                edges.push({
                    data: {
                        source: `n${node._id}`,
                        target: `n${child._id}`,
                        label: 'left_child',
                        displayOnly: false,
                    },
                    classes: invisible ? 'invisible' : ''
                });
                edges.push({
                    data: {
                        source: `n${child._id}`,
                        target: `n${node._id}`,
                        label: 'parent',
                        displayOnly: true
                    }
                });
            }
            const isFirst = child === children[0];
            const isLast = child === children[children.length - 1];
            dfs(child, children.length, isFirst, isLast);
        }
    }

    if (root) dfs(root, 1, true, true);
    return {
        nodes,
        edges
    };
}

function createFixList(advancedView, heap) {
    const {
        start,
        elements
    } = getFixSections(heap);
    if (start) {
        const fixNodes = [];
        const fixY = advancedView.value ? C.ADVANCED_FIX_Y : C.BASIC_FIX_Y;
        let curr = start;
        let i = 0;

        do {
            elements.push({
                data: {
                    id: `fix-${curr._id}`,
                    label: formatHeapNodeLabel(curr, advancedView.value),
                    bgColor: nodeColor(curr),
                    parent: `section-${curr.section()}`
                },
                classes: 'fix',
                position: {
                    x: C.FIX_X + i * C.X_STEP,
                    y: fixY
                },
                grabbable: false
            });

            const isSingle = curr._next === curr;
            const isWrapNxt = curr._next === start;
            const isWrapPrev = curr === start;

            elements.push({
                data: {
                    source: `fix-${curr._id}`,
                    target: `fix-${curr._next._id}`,
                    label: advancedView.value ? 'next' : ''
                },
                classes: isSingle ? 'single-nxt' : isWrapNxt ? 'wrap wrap-nxt' : ''
            });

            elements.push({
                data: {
                    source: `fix-${curr._id}`,
                    target: `fix-${curr._prev._id}`,
                    label: advancedView.value ? 'prev' : ''
                },
                classes: isSingle ? 'single-prev' : isWrapPrev ? 'wrap wrap-prev' : ''
            });

            fixNodes.push(curr);
            curr = curr._next;
            i++;
        } while (curr !== start);

        return {
            elements,
            fixNodes
        };
    }

    return {
        elements,
        fixNodes: []
    };
}

function createRankList(advancedView, heap) {
    const elements = [];
    let r = heap._rank_list;
    let j = 0;

    while (r) {
        elements.push({
            data: {
                id: `rank-${r._rank}`,
                label: formatRankLabel(r, advancedView.value)
            },
            classes: 'rank',
            position: {
                x: C.RANK_X + j * C.X_STEP,
                y: C.RANK_Y
            },
            grabbable: false
        });

        if (r._inc) elements.push({
            data: {
                source: `rank-${r._rank}`,
                target: `rank-${r._inc._rank}`,
                label: advancedView.value ? 'inc' : ''
            }
        });
        if (r._dec) elements.push({
            data: {
                source: `rank-${r._rank}`,
                target: `rank-${r._dec._rank}`,
                label: advancedView.value ? 'dec' : ''
            }
        });

        r = r._inc;
        j++;
    }

    return elements;
}

function linkLists(listsCy, fixNodes) {
    const elements = [];

    fixNodes.forEach(n => {
        if (n.passive()) return;
        const sourceId = `fix-${n._id}`;
        const targetId = `rank-${n.rank()}`;

        const source = listsCy.getElementById(sourceId);
        const target = listsCy.getElementById(targetId);
        if (source.empty()) throw new Error(`Source node ${sourceId} not found`);
        if (target.empty()) throw new Error(`Target node ${targetId} not found`);

        const dx = target.position().x - source.position().x;
        const dirClass = dx < 0 ? 'diagonal left' : dx === 0 ? '' : 'diagonal right';

        let cls = `cross-list ${dirClass}`;

        if (n._rank._free === n) cls += ' free';
        if (n._rank._loss_one === n) cls += ' loss';

        elements.push({
            data: {
                source: sourceId,
                target: targetId,
                label: ''
            },
            classes: cls
        });
    });

    return elements;
}

// === Styling / Layout Helpers ===
function nodeColor(n) {
    if (n.fixed()) return 'red';
    if (n.free()) return 'green';
    if (n.passive()) return 'blue';
    throw new Error(`Unknown node state for node ${n._id}`);
}

function fitTextIntoNode(cy, ctx) {
    if (!cy) throw new Error('Cytoscape instance not initialized');
    if (!ctx) throw new Error('Canvas context required for text measurement');
    cy.nodes().forEach(n => {
        const label = n.data('label').toString();
        const lines = label.split('\n');
        const fontFamily = n.pstyle('font-family').strValue || 'Arial';

        let fontSize = C.MAX_FONT;

        while (fontSize >= C.MIN_FONT) {
            ctx.font = `${fontSize}px ${fontFamily}`;

            let maxWidth = 0;
            for (const line of lines) {
                maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
            }

            const textHeight = lines.length * (fontSize + 2);

            if (
                maxWidth <= C.NODE_SIZE - C.NODE_PADDING * 2 &&
                textHeight <= C.NODE_SIZE - C.NODE_PADDING * 2
            ) {
                break;
            }

            fontSize--;
        }

        n.style({
            width: C.NODE_SIZE,
            height: C.NODE_SIZE,
            'font-size': fontSize
        });
    });
}

function setSegmentWeights(edge, w) {
    edge.style('segment-weights', `${-w} ${-w} ${1 + w} ${1 + w}`);
}

// === Utility / Data Extraction Helpers ===
function getFixSections(heap) {
    const elements = [];
    let start = null;
    C.FIX_LIST_SECTIONS.forEach(section => {
        if (!heap[section]) return;
        if (!start) start = heap[section];
        elements.push({
            data: {
                id: `section-${section}`,
                label: section,
            },
            classes: 'section',
            grabbable: false
        });
    });
    return {
        start,
        elements
    };
}

function formatHeapNodeLabel(node, advanced) {
    if (!advanced) return `${node._key}`;
    return `Key: ${node._key}\nRank: ${node.rank()}\nLoss: ${node._loss}`;
}

function formatRankLabel(rankNode, advanced) {
    if (!advanced) return `r${rankNode._rank}`;
    return `Rank: ${rankNode._rank}\nRefs: ${rankNode._ref_count}`;
}