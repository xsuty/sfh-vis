export const HEAP_CY_STYLE = [
    /* ================= NODES ================= */
    {
        selector: 'node',
        style: {
            label: 'data(label)',
            'background-color': 'data(bgColor)',
            color: '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
        },
    },

    /* ================= EDGES ================= */
    {
        selector: 'edge',
        style: {
            'curve-style': 'bezier',
            width: 2,
            'line-color': '#999',
            'target-arrow-shape': 'triangle',
            label: 'data(label)',
            'font-size': 8,
            color: '#fff',
            'text-rotation': 'autorotate',
            'text-margin-y': -6,
            'text-background-color': '#000',
            'text-background-opacity': 0.7,
            'text-background-padding': 2,
            'text-background-shape': 'roundrectangle',
            'text-border-color': '#000',
            'text-border-width': 0.5,
        },
    },
    {
        selector: 'edge.invisible',
        style: {
            opacity: 0,
        },
    },

    /* ---------------- WRAP EDGES ---------------- */
    {
        selector: 'edge.wrap',
        style: {
            'curve-style': 'round-segments',
            'edge-distances': 'endpoints',
            'segment-weights': '-0.25 -0.25 1.25 1.25',
            'segment-distances': '0px -40px -40px 0px',
            label: '',
            'source-label': 'data(label)',
            'source-text-offset': 15,
        },
    },
    {
        selector: 'edge.wrap-left',
        style: {
            'source-endpoint': '-80deg',
            'target-endpoint': '80deg',
        },
    },
    {
        selector: 'edge.wrap-right',
        style: {
            'source-endpoint': '100deg',
            'target-endpoint': '-100deg',
            'text-margin-x': 10,
            'text-margin-y': 0,
        },
    },

    /* ---------------- SINGLE NODE LOOPS ---------------- */
    {
        selector: 'edge.single-left',
        style: {
            'control-point-step-size': 40,
            'source-endpoint': '-70deg',
            'target-endpoint': '-110deg',
            'loop-direction': '-90deg',
            'loop-sweep': '-50deg',
        },
    },
    {
        selector: 'edge.single-right',
        style: {
            'control-point-step-size': 40,
            'source-endpoint': '70deg',
            'target-endpoint': '110deg',
            'loop-direction': '90deg',
            'loop-sweep': '50deg',
        },
    },
];

export const LISTS_CY_STYLE = [
    /* ================= NODES ================= */
    {
        selector: 'node',
        style: {
            label: 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': 12,
            'text-wrap': 'wrap',
            padding: '8px',
        },
    },
    {
        selector: 'node.section',
        style: {
            shape: 'roundrectangle',
            'background-opacity': 0.1,
            'border-width': 2,
            'border-color': '#333',
            'text-valign': 'bottom',
            'text-margin-y': 5,
            padding: '10px',
        },
    },
    {
        selector: 'node.fix',
        style: {
            'background-color': 'data(bgColor)',
            color: '#fff',
        },
    },
    {
        selector: 'node.rank',
        style: {
            'background-color': '#3498db',
            color: '#fff',
        },
    },

    /* ================= EDGES ================= */
    {
        selector: 'edge',
        style: {
            'curve-style': 'bezier',
            width: 2,
            'line-color': '#999',
            'target-arrow-shape': 'triangle',
            label: 'data(label)',
            'font-size': 8,
            color: '#fff',
            'text-rotation': 'autorotate',
            'text-margin-y': -6,
            'text-background-color': '#000',
            'text-background-opacity': 0.7,
            'text-background-padding': 2,
            'text-background-shape': 'roundrectangle',
            'text-border-color': '#000',
            'text-border-width': 0.5,
        },
    },

    /* ---------------- WRAP EDGES ---------------- */
    {
        selector: 'edge.wrap',
        style: {
            'curve-style': 'round-segments',
            'edge-distances': 'endpoints',
            'segment-distances': '0px -40px -40px 0px',
            label: '',
            'source-label': 'data(label)',
            'source-text-offset': 15,
        },
    },
    {
        selector: 'edge.wrap-prev',
        style: {
            'source-endpoint': '-80deg',
            'target-endpoint': '80deg',
        },
    },
    {
        selector: 'edge.wrap-nxt',
        style: {
            'source-endpoint': '100deg',
            'target-endpoint': '-100deg',
        },
    },

    /* ---------------- SINGLE NODE LOOPS ---------------- */
    {
        selector: 'edge.single-prev',
        style: {
            'control-point-step-size': 50,
            'source-endpoint': '-70deg',
            'target-endpoint': '-110deg',
            'loop-direction': '-90deg',
            'loop-sweep': '-50deg',
        },
    },
    {
        selector: 'edge.single-nxt',
        style: {
            'control-point-step-size': 50,
            'source-endpoint': '70deg',
            'target-endpoint': '110deg',
            'loop-direction': '90deg',
            'loop-sweep': '50deg',
        },
    },

    /* ---------------- CROSS-LIST EDGES ---------------- */
    {
        selector: 'edge.cross-list',
        style: {
            'target-label': 'rank',
            'target-text-offset': 15,
        },
    },
    {
        selector: 'edge.diagonal',
        style: {
            'curve-style': 'unbundled-bezier',
            'control-point-weights': '0.3 0.7',
            'source-endpoint': '0deg',
            'target-endpoint': '180deg',
        },
    },
    {
        selector: 'edge.left',
        style: {
            'control-point-distances': '40 -40',
        },
    },
    {
        selector: 'edge.right',
        style: {
            'control-point-distances': '-40 40',
        },
    },

    /* ---------------- RANK-LIST POINTERS ---------------- */
    {
        selector: 'edge.free',
        style: {
            'source-label': 'free',
            'source-text-offset': 15,
            'source-arrow-shape': 'triangle',
        },
    },
    {
        selector: 'edge.loss',
        style: {
            'source-label': 'loss_one',
            'source-text-offset': 15,
            'source-arrow-shape': 'triangle',
        },
    },
];