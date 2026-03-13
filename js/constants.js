// Heap
export const MAX_HEAPS = 5;
export const FIX_LIST_PASSIVE = '_passive';
export const FIX_LIST_FREE_SINGLE = '_freeSingle';
export const FIX_LIST_FREE_MULTIPLE = '_freeMultiple';
export const FIX_LIST_LOSS_ZERO = '_lossZero';
export const FIX_LIST_LOSS_ONE_SINGLE = '_lossOneSingle';
export const FIX_LIST_LOSS_ONE_MULTIPLE = '_lossOneMultiple';
export const FIX_LIST_LOSS_TWO = '_lossTwo';
export const FIX_LIST_SECTIONS = [
    FIX_LIST_PASSIVE,
    FIX_LIST_FREE_MULTIPLE,
    FIX_LIST_FREE_SINGLE,
    FIX_LIST_LOSS_ZERO,
    FIX_LIST_LOSS_ONE_MULTIPLE,
    FIX_LIST_LOSS_ONE_SINGLE,
    FIX_LIST_LOSS_TWO
];

// Heap rendering
export const HEAP_PADDING = 40;
export const BASIC_NODE_SEP = 15;
export const BASIC_RANK_SEP = 40;
export const ADVANCED_NODE_SEP = 50;
export const ADVANCED_RANK_SEP = 60;

// Lists rendering
export const LISTS_PADDING = 50;
export const FIX_X = 50;
export const BASIC_FIX_Y = 200;
export const ADVANCED_FIX_Y = 300;
export const RANK_X = 50;
export const RANK_Y = 80;
export const X_STEP = 150;

// Node rendering
export const NODE_SIZE = 70;
export const NODE_PADDING = 10;
export const MAX_FONT = 30;
export const MIN_FONT = 2;

// Drawer
export const MIN_DRAWER_HEIGHT = 100;
export const MAX_DRAWER_HEIGHT_OFFSET = 100;

// DOM ids
export const LISTS_CY_DOM = 'lists-cy';
export const HEAP_CY_DOM = 'heap-cy';
export const DRAWER_HANDLE_DOM = 'drawerHandle';