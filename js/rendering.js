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
        applyInspectFocus(heapCy, appState, nodeId);
    });

    heapCy.on('mouseover', 'node', (evt) => {
        applyInspectFocus(heapCy, appState, evt.target.id());
    });

    heapCy.on('mouseout', 'node', () => {
        const selectedId = appState.selectedNode.value ? `n${appState.selectedNode.value._id}` : null;
        applyInspectFocus(heapCy, appState, selectedId);
    });

    heapCy.on('tap', (evt) => {
        if (evt.target !== heapCy) return;
        const selectedId = appState.selectedNode.value ? `n${appState.selectedNode.value._id}` : null;
        applyInspectFocus(heapCy, appState, selectedId);
    });
}

export function setupListsInspect(listsCy, appState) {
    function processNonSectionNode(evt, callback) {
        const target = evt.target;
        if (target.hasClass('section')) return;
        callback(target.id());
    }

    listsCy.on('mouseover', 'node', (evt) => {
        processNonSectionNode(evt, (id) => applyListInspectFocus(listsCy, appState.advancedView, [id]));
    });

    listsCy.on('mouseout', 'node', () => {
        applyListInspectFromSelection(listsCy, appState.advancedView, appState.selectedNode.value);
    });

    listsCy.on('tap', 'node', (evt) => {
        processNonSectionNode(evt, (id) => applyListInspectFocus(listsCy, appState.advancedView, [id]));
    });

    listsCy.on('tap', (evt) => {
        if (evt.target !== listsCy) return;
        applyListInspectFromSelection(listsCy, appState.advancedView, appState.selectedNode.value);
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

    assertNoDuplicateIds(elements);
    heapCy.add(elements);
    fitTextIntoNode(heapCy, appState.ctx);

    const nodeSep = appState.advancedView.value ? C.ADVANCED_NODE_SEP : C.BASIC_NODE_SEP;
    const rankSep = appState.advancedView.value ? C.ADVANCED_RANK_SEP : C.BASIC_RANK_SEP;
    layoutTree(heap, heapCy, nodeSep, rankSep);

    heapCy.edges('.wrap').forEach(edge => {
        setSegmentWeights(edge);
    });

    heapCy.fit(undefined, C.HEAP_PADDING);

    const selectedId = appState.selectedNode.value ? `n${appState.selectedNode.value._id}` : null;
    applyInspectFocus(heapCy, appState, selectedId);
}

export function renderLists(heap, advancedView, selectedNode, ctx, listsCy, fixListConfig = {}) {
    if (!listsCy) throw new Error('listsCy not initialized');

    const collapsedSections = fixListConfig.collapsedSections || {};

    listsCy.elements().remove();

    const {
        elements: fixElements,
        fixNodes
    } = createFixList(advancedView, heap, collapsedSections);
    const rankElements = createRankList(advancedView, heap);
    assertNoDuplicateIds([...fixElements, ...rankElements]);
    listsCy.add([...fixElements, ...rankElements]);

    if (advancedView.value) listsCy.add(linkLists(listsCy, fixNodes, collapsedSections));

    fitTextIntoNode(listsCy, ctx);

    if (fixNodes.length > 0) {
        listsCy.edges().filter(edge => edge.hasClass('wrap') && !edge.hasClass('collapsed')).forEach(edge => {
            setSegmentWeights(edge);
        });
    }

    listsCy.fit(undefined, C.LISTS_PADDING);

    applyListInspectFromSelection(listsCy, advancedView, selectedNode.value);
}

// === Internal Rendering Helpers ===
function collectNodes(advancedView, root) {
    const nodes = [];
    const edges = [];

    function dfs(node, first, last) {
        nodes.push(node);
        if (advancedView.value) {
            const isSingle = node._left === node;
            edges.push({
                data: {
                    source: `n${node._id}`,
                    target: `n${node._left._id}`,
                    label: 'left'
                },
                classes: joinClasses('pointer-edge lateral-edge left-pointer', isSingle ? 'single-left' : first ? 'wrap wrap-left' : '')
            });
            edges.push({
                data: {
                    source: `n${node._id}`,
                    target: `n${node._right._id}`,
                    label: 'right'
                },
                classes: joinClasses('pointer-edge lateral-edge right-pointer', isSingle ? 'single-right' : last ? 'wrap wrap-right' : '')
            });
        }
        const children = node.children();
        for (const child of children) {
            if (!advancedView.value) {
                edges.push({
                    data: {
                        source: `n${node._id}`,
                        target: `n${child._id}`,
                        label: ''
                    },
                    classes: 'tree-edge simple-tree-edge'
                });
            } else {
                if (child === node._leftChild) {
                    edges.push({
                        data: {
                            source: `n${node._id}`,
                            target: `n${child._id}`,
                            label: 'left_child',
                        },
                        classes: 'tree-edge left-child-edge'
                    });
                }
                edges.push({
                    data: {
                        source: `n${child._id}`,
                        target: `n${node._id}`,
                        label: 'parent'
                    },
                    classes: 'pointer-edge parent-edge'
                });
            }
            const isFirst = child === children[0];
            const isLast = child === children[children.length - 1];
            dfs(child, isFirst, isLast);
        }
    }

    if (root) dfs(root, true, true);
    return {
        nodes,
        edges
    };
}

function createFixList(advancedView, heap, collapsedSections = {}) {
    const {
        start,
        elements
    } = getFixSections(heap, collapsedSections);
    const visibleSections = C.FIX_LIST_SECTIONS.filter(section => Boolean(heap[section]));
    const visibleSectionCount = visibleSections.length;

    if (start) {
        const fixNodes = [];
        const fixY = advancedView.value ? C.ADVANCED_FIX_Y : C.BASIC_FIX_Y;
        let curr = start;
        let i = 0;

        do {
            const section = curr.section();
            const isCollapsed = collapsedSections[section];
            let target;

            fixNodes.push(curr);

            if (isCollapsed) {
                const isSingle = visibleSectionCount === 1;
                const isFirstSection = section === visibleSections[0];
                const isLastSection = section === visibleSections[visibleSectionCount - 1];

                const placeholderId = `placeholder-${section}`;
                const placeholderX = C.FIX_X + i * C.X_STEP;

                elements.push({
                    data: {
                        id: placeholderId,
                        label: section
                    },
                    classes: 'placeholder',
                    position: {
                        x: placeholderX,
                        y: fixY
                    },
                    grabbable: false
                });

                const prev = curr._prev;
                const prevSection = prev.section();
                if (collapsedSections[prevSection]) {
                    target = `placeholder-${prevSection}`;
                } else {
                    target = `fix-${prev._id}`;
                }
                elements.push({
                    data: {
                        source: placeholderId,
                        target: target,
                        label: advancedView.value ? 'prev' : ''
                    },
                    classes: isSingle ? 'single-prev' : isFirstSection ? 'wrap wrap-prev' : ''
                });

                const next = curr.getNextSection(section);
                const nextSection = next.section();
                if (collapsedSections[nextSection]) {
                    target = `placeholder-${nextSection}`;
                } else {
                    target = `fix-${next._id}`;
                }
                elements.push({
                    data: {
                        source: placeholderId,
                        target: target,
                        label: advancedView.value ? 'next' : ''
                    },
                    classes: isSingle ? 'single-nxt' : isLastSection ? 'wrap wrap-nxt' : ''
                });

                curr = next;
            } else {
                elements.push({
                    data: {
                        id: `fix-${curr._id}`,
                        label: formatHeapNodeLabel(curr, advancedView.value),
                        bgColor: nodeColor(curr),
                        parent: `section-${section}`
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

                const nextSection = curr._next.section();
                const prevSection = curr._prev.section();
                const nextCollapsed = !!collapsedSections[nextSection];
                const prevCollapsed = !!collapsedSections[prevSection];

                if (nextCollapsed) {
                    target = `placeholder-${nextSection}`;
                } else {
                    target = `fix-${curr._next._id}`;
                }

                elements.push({
                    data: {
                        source: `fix-${curr._id}`,
                        target: target,
                        label: advancedView.value ? 'next' : ''
                    },
                    classes: isSingle ? 'single-nxt' : isWrapNxt ? 'wrap wrap-nxt' : ''
                });

                if (prevCollapsed) {
                    target = `placeholder-${prevSection}`;
                } else {
                    target = `fix-${curr._prev._id}`;
                }

                elements.push({
                    data: {
                        source: `fix-${curr._id}`,
                        target: target,
                        label: advancedView.value ? 'prev' : ''
                    },
                    classes: isSingle ? 'single-prev' : isWrapPrev ? 'wrap wrap-prev' : ''
                });

                curr = curr._next;
            }

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
    let r = heap._rankList;
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

function linkLists(listsCy, fixNodes, collapsedSections = {}) {
    const elements = [];

    fixNodes.forEach(n => {
        if (n.passive()) return;
        if (collapsedSections[n.section()]) return;

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
        if (n._rank._lossOne === n) cls += ' loss';

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

function setSegmentWeights(edge) {
    const source = edge.sourceEndpoint();
    const target = edge.targetEndpoint();
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const endpointDistance = Math.hypot(dx, dy);
    const w = endpointDistance > 0 ? C.WRAP_STUB_LENGTH / endpointDistance : 0;

    edge.style('segment-weights', `${-w} ${-w} ${1 + w} ${1 + w}`);
}

// === Utility / Data Extraction Helpers ===
function getFixSections(heap, collapsedSections) {
    const elements = [];
    let start = null;
    C.FIX_LIST_SECTIONS.forEach(section => {
        if (!heap[section]) return;
        if (!start) start = heap[section];
        const isCollapsed = !!collapsedSections[section];
        elements.push({
            data: {
                id: `section-${section}`,
                label: section,
            },
            classes: joinClasses('section', isCollapsed ? 'collapsed' : ''),
            grabbable: false
        });
    });
    return {
        start,
        elements
    };
}

function layoutTree(heap, heapCy, nodeSep, rankSep) {
    function subtreeWidth(node) {
        const c = node.children();
        if (c.length === 0) return C.NODE_SIZE;
        const total = c.reduce((sum, child) => sum + subtreeWidth(child), 0) + (c.length - 1) * nodeSep;
        return Math.max(C.NODE_SIZE, total);
    }

    const positions = {};

    function place(node, centerX, y) {
        positions[`n${node._id}`] = {
            x: centerX,
            y
        };
        const c = node.children();
        if (c.length === 0) return;
        const totalW = c.reduce((sum, child) => sum + subtreeWidth(child), 0) + (c.length - 1) * nodeSep;
        let x = centerX - totalW / 2;
        for (const child of c) {
            const w = subtreeWidth(child);
            place(child, x + w / 2, y + C.NODE_SIZE + rankSep);
            x += w + nodeSep;
        }
    }

    place(heap._root, 0, 0);
    heapCy.nodes().forEach(n => {
        const pos = positions[n.id()];
        if (pos) n.position(pos);
    });
}

function assertNoDuplicateIds(elements) {
    const seen = new Set();
    for (const el of elements) {
        const id = el?.data?.id;
        if (id == null) continue;
        if (seen.has(id)) throw new Error(`Duplicate Cytoscape element ID detected: "${id}"`);
        seen.add(id);
    }
}

function formatHeapNodeLabel(node, advanced) {
    if (!advanced) return `${node._key}`;
    return `Key: ${node._key}\nRank: ${node.rank()}\nLoss: ${node._loss}`;
}

function formatRankLabel(rankNode, advanced) {
    if (!advanced) return `r${rankNode._rank}`;
    return `Rank: ${rankNode._rank}\nRefs: ${rankNode._refCount}`;
}

function applyInspectFocus(heapCy, appState, focusedId) {
    const classes = ['inspect-focus', 'inspect-context', 'inspect-dim'];
    heapCy.elements().removeClass(classes.join(' '));

    if (!appState.advancedView.value || !focusedId) return;

    const focusNode = heapCy.getElementById(focusedId);
    if (focusNode.empty()) return;

    const neighborhoodEdges = focusNode.connectedEdges();
    const neighborhoodNodes = neighborhoodEdges.connectedNodes().union(focusNode);
    const highlighted = neighborhoodNodes.union(neighborhoodEdges);

    heapCy.elements().difference(highlighted).addClass('inspect-dim');
    neighborhoodNodes.difference(focusNode).addClass('inspect-context');
    neighborhoodEdges.addClass('inspect-context');
    focusNode.addClass('inspect-focus');
}

function applyListInspectFromSelection(listsCy, advancedView, selectedNode) {
    if (!selectedNode) {
        applyListInspectFocus(listsCy, advancedView, []);
        return;
    }

    applyListInspectFocus(listsCy, advancedView, [
        `fix-${selectedNode._id}`,
        `rank-${selectedNode.rank()}`
    ]);
}

function applyListInspectFocus(listsCy, advancedView, focusedIds) {
    const classes = ['inspect-focus', 'inspect-context', 'inspect-dim'];
    listsCy.elements().removeClass(classes.join(' '));

    if (!advancedView.value || focusedIds.length === 0) return;

    let focused = listsCy.collection();
    for (const id of focusedIds) {
        const node = listsCy.getElementById(id);
        if (!node.empty()) focused = focused.union(node);
    }

    if (focused.empty()) return;

    let neighborhoodEdges = listsCy.collection();
    focused.forEach((node) => {
        neighborhoodEdges = neighborhoodEdges.union(node.connectedEdges());
    });

    const neighborhoodNodes = neighborhoodEdges.connectedNodes().union(focused);
    const highlighted = neighborhoodNodes.union(neighborhoodEdges);

    // Keep compound parents visible so highlighted child nodes do not get dimmed by parent opacity.
    const keepVisible = highlighted.union(neighborhoodNodes.parents());

    listsCy.elements().difference(keepVisible).addClass('inspect-dim');
    neighborhoodNodes.difference(focused).addClass('inspect-context');
    neighborhoodEdges.addClass('inspect-context');
    focused.addClass('inspect-focus');
}

function joinClasses(...classes) {
    return classes.filter(Boolean).join(' ');
}