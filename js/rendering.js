import * as C from './constants.js';

// === Public UI Functions ===
export function setupNodeClick(cy, appState, isBusy) {
    cy.on('tap', 'node', (evt) => {
        if (isBusy()) return;

        if (appState.ignoreNodeClick.value) {
            appState.ignoreNodeClick.value = false;
            return;
        }

        const nodeId = evt.target.id();
        const heapNode = appState.nodesById[nodeId];
        if (!heapNode) throw new Error('Clicked node not found in nodesById');

        appState.selectedNode.value = heapNode;
        appState.newKeyInput.value = heapNode._key;
        appState.nodeModalOpen.value = true;
        applyInspectFocus(cy, appState, null);
    });
}

export function setupNodeInspect(cy, appState) {
    cy.on('mouseover', 'node', (evt) => {
        if (appState.inspectMode.value) return;
        applyInspectFocus(cy, appState, evt.target.id());
    });

    cy.on('mouseout', 'node', () => {
        if (appState.inspectMode.value) return;
        applyInspectFocus(cy, appState, null);
    });

    cy.on('cxttap', 'node', (evt) => {
        if (!appState.advancedView.value) return;
        const nodeId = evt.target.id();
        appState.inspectMode.value = true;
        applyInspectFocus(cy, appState, nodeId);
    });

    cy.on('taphold', 'node', (evt) => {
        if (!appState.advancedView.value) return;
        const nodeId = evt.target.id();
        appState.inspectMode.value = true;
        appState.ignoreTap.value = true;
        appState.ignoreNodeClick.value = true;
        applyInspectFocus(cy, appState, nodeId);
    });

    cy.on('tap', () => {
        if (appState.ignoreTap.value) {
            appState.ignoreTap.value = false;
            return;
        }
        appState.inspectMode.value = false;
        applyInspectFocus(cy, appState, null);
    });
}

export function setupPlaceholderClick(listsCy, appState) {
    if (!listsCy) throw new Error('listsCy not initialized');

    listsCy.on('tap', 'node.placeholder', (evt) => {
        const nodeId = evt.target.id();
        const match = nodeId.match(/^placeholder-(.+)$/);
        if (!match) return;

        const section = match[1];
        if (!C.FIX_LIST_SECTIONS.includes(section)) return;

        appState.fixListCollapsedSections.value = {
            ...appState.fixListCollapsedSections.value,
            [section]: !appState.fixListCollapsedSections.value[section]
        };
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
            grabbable: false
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
}

export function renderLists(heap, advancedView, ctx, listsCy, fixListConfig = {}, options = {}) {
    if (!listsCy) throw new Error('listsCy not initialized');

    const {
        fit = true
    } = options;
    const collapsedSections = fixListConfig.collapsedSections || {};

    listsCy.elements().remove();

    const {
        elements: fixElements,
        fixNodes
    } = createFixList(advancedView, heap, collapsedSections);

    const fixBounds = getXBounds(fixElements);
    const rankOffset = getRankOffset(fixBounds, getRankCount(heap));
    const rankElements = createRankList(advancedView, heap, rankOffset, fixListConfig.rankListGap);

    assertNoDuplicateIds([...fixElements, ...rankElements]);
    listsCy.add([...fixElements, ...rankElements]);

    if (advancedView.value) listsCy.add(linkLists(listsCy, fixNodes, collapsedSections));

    fitTextIntoNode(listsCy, ctx);

    if (fixNodes.length > 0) {
        listsCy.edges().filter(edge => edge.hasClass('wrap') && !edge.hasClass('collapsed')).forEach(edge => {
            setSegmentWeights(edge);
        });
    }

    if (fit) {
        listsCy.fit(undefined, C.LISTS_PADDING);
    }
}

// === Internal Rendering Helpers ===
function getXBounds(elements) {
    const xs = elements
        .filter(el => el.position && typeof el.position.x === 'number')
        .map(el => el.position.x);
    if (xs.length === 0) return null;
    return {
        min: Math.min(...xs),
        max: Math.max(...xs)
    };
}

function getRankOffset(fixBounds, rankCount) {
    if (!fixBounds || rankCount === 0) return 0;

    const fixCenter = (fixBounds.min + fixBounds.max) / 2;
    const rankSpan = (rankCount - 1) * C.X_STEP;
    const rankCenter = C.RANK_X + rankSpan / 2;

    return fixCenter - rankCenter;
}

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

    if (!start) {
        return {
            elements,
            fixNodes: []
        };
    }

    const visibleSections = C.FIX_LIST_SECTIONS.filter(section => Boolean(heap[section]));
    const visibleSectionCount = visibleSections.length;
    const fixNodes = [];
    const fixY = advancedView.value ? C.ADVANCED_FIX_Y : C.BASIC_FIX_Y;

    let curr = start;
    let i = 0;

    do {
        const section = curr.section();
        const isCollapsed = Boolean(collapsedSections[section]);

        fixNodes.push(curr);

        if (isCollapsed) {
            curr = appendCollapsedSection(elements, heap, curr, section, fixY, i, visibleSectionCount, visibleSections, collapsedSections, advancedView.value);
        } else {
            curr = appendFixListNode(elements, curr, section, fixY, i, start, collapsedSections, advancedView.value);
        }

        i++;
    } while (curr !== start);

    return {
        elements,
        fixNodes
    };
}

function appendCollapsedSection(elements, heap, currentNode, section, fixY, index, visibleSectionCount, visibleSections, collapsedSections, advanced) {
    const placeholderId = `placeholder-${section}`;
    const placeholderX = C.FIX_X + index * C.X_STEP;
    const placeholderCount = countFixSectionNodes(heap[section]);

    elements.push({
        data: {
            id: placeholderId,
            label: formatSectionLabel(section, placeholderCount)
        },
        classes: 'placeholder',
        position: {
            x: placeholderX,
            y: fixY
        },
        grabbable: false
    });

    const isSingle = visibleSectionCount === 1;
    const isFirstSection = section === visibleSections[0];
    const isLastSection = section === visibleSections[visibleSectionCount - 1];

    const prev = currentNode._prev;
    const prevSection = prev.section();
    const prevTarget = collapsedSections[prevSection] ? `placeholder-${prevSection}` : `fix-${prev._id}`;

    elements.push({
        data: {
            source: placeholderId,
            target: prevTarget,
            label: advanced ? 'prev' : ''
        },
        classes: isSingle ? 'single-prev' : isFirstSection ? 'wrap wrap-prev' : ''
    });

    const next = currentNode.getNextSection(section);
    const nextSection = next.section();
    const nextTarget = collapsedSections[nextSection] ? `placeholder-${nextSection}` : `fix-${next._id}`;

    elements.push({
        data: {
            source: placeholderId,
            target: nextTarget,
            label: advanced ? 'next' : ''
        },
        classes: isSingle ? 'single-nxt' : isLastSection ? 'wrap wrap-nxt' : ''
    });

    return next;
}

function appendFixListNode(elements, currentNode, section, fixY, index, startNode, collapsedSections, advanced) {
    elements.push({
        data: {
            id: `fix-${currentNode._id}`,
            label: formatHeapNodeLabel(currentNode, advanced),
            bgColor: nodeColor(currentNode),
            parent: `section-${section}`
        },
        classes: 'fix',
        position: {
            x: C.FIX_X + index * C.X_STEP,
            y: fixY
        },
        grabbable: false
    });

    const isSingle = currentNode._next === currentNode;
    const isWrapNxt = currentNode._next === startNode;
    const isWrapPrev = currentNode === startNode;

    const nextSection = currentNode._next.section();
    const prevSection = currentNode._prev.section();
    const nextCollapsed = Boolean(collapsedSections[nextSection]);
    const prevCollapsed = Boolean(collapsedSections[prevSection]);

    const nextTarget = nextCollapsed ? `placeholder-${nextSection}` : `fix-${currentNode._next._id}`;
    elements.push({
        data: {
            source: `fix-${currentNode._id}`,
            target: nextTarget,
            label: advanced ? 'next' : ''
        },
        classes: isSingle ? 'single-nxt' : isWrapNxt ? 'wrap wrap-nxt' : ''
    });

    const prevTarget = prevCollapsed ? `placeholder-${prevSection}` : `fix-${currentNode._prev._id}`;
    elements.push({
        data: {
            source: `fix-${currentNode._id}`,
            target: prevTarget,
            label: advanced ? 'prev' : ''
        },
        classes: isSingle ? 'single-prev' : isWrapPrev ? 'wrap wrap-prev' : ''
    });

    return currentNode._next;
}

function createRankList(advancedView, heap, xOffset = 0, rankListGap) {
    const elements = [];
    let r = heap._rankList;
    let j = 0;

    const fixY = advancedView.value ? C.ADVANCED_FIX_Y : C.BASIC_FIX_Y;
    const defaultGap = advancedView.value ? C.ADVANCED_FIX_RANK_GAP : C.BASIC_FIX_RANK_GAP;
    const gap = (typeof rankListGap === 'number') ? rankListGap : defaultGap;
    const rankY = fixY - gap;

    while (r) {
        elements.push({
            data: {
                id: `rank-${r._rank}`,
                label: formatRankLabel(r, advancedView.value)
            },
            classes: 'rank',
            position: {
                x: C.RANK_X + j * C.X_STEP + xOffset,
                y: rankY
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

function getRankCount(heap) {
    let count = 0;
    let r = heap._rankList;
    while (r) {
        count++;
        r = r._inc;
    }
    return count;
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
function countFixSectionNodes(head) {
    if (!head) throw new Error('Section cannot be empty');
    let section = head.section();
    let count = 1;
    let current = head._next;
    while (current !== head && current.section() === section) {
        count++;
        current = current._next;
    }
    return count;
}

function formatSectionLabel(section, count) {
    return `${section.replace(/^_/, '')} (${count})`;
}

function getFixSections(heap, collapsedSections) {
    const elements = [];
    let start = null;
    C.FIX_LIST_SECTIONS.forEach(section => {
        if (!heap[section]) return;
        if (!start) start = heap[section];
        const isCollapsed = collapsedSections[section];
        const sectionCount = countFixSectionNodes(heap[section]);
        elements.push({
            data: {
                id: `section-${section}`,
                label: formatSectionLabel(section, sectionCount),
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

function applyInspectFocus(cy, appState, focusedId) {
    const classes = ['inspect-focus', 'inspect-context', 'inspect-dim'];
    cy.elements().removeClass(classes.join(' '));

    if (!appState.advancedView.value || !focusedId) return;

    const focusNode = cy.getElementById(focusedId);
    if (focusNode.empty()) return;
    if (focusNode.hasClass('section')) return;

    const neighborhoodEdges = focusNode.connectedEdges();
    const neighborhoodNodes = neighborhoodEdges.connectedNodes().union(focusNode);
    const highlighted = neighborhoodNodes.union(neighborhoodEdges);
    const keepVisible = highlighted.union(neighborhoodNodes.parents());

    cy.elements().difference(keepVisible).addClass('inspect-dim');
    neighborhoodNodes.difference(focusNode).addClass('inspect-context');
    neighborhoodEdges.addClass('inspect-context');
    focusNode.addClass('inspect-focus');
}

function joinClasses(...classes) {
    return classes.filter(Boolean).join(' ');
}