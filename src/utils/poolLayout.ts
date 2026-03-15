export const DEFAULT_POOL_SIDEBAR_WIDTH = 440;
export const DEFAULT_POOL_WORKSPACE_HEIGHT = 220;

const MIN_POOL_SIDEBAR_WIDTH = 360;
const MAX_POOL_SIDEBAR_RATIO = 0.48;

const MIN_POOL_WORKSPACE_HEIGHT = 170;
const MAX_POOL_WORKSPACE_HEIGHT = 420;

export const clampPoolSidebarWidth = (width: number, containerWidth: number) => {
    const maxWidth = Math.max(MIN_POOL_SIDEBAR_WIDTH, Math.floor(containerWidth * MAX_POOL_SIDEBAR_RATIO));
    return Math.min(Math.max(width, MIN_POOL_SIDEBAR_WIDTH), maxWidth);
};

export const clampPoolWorkspaceHeight = (height: number, containerHeight: number) => {
    const maxHeight = Math.min(MAX_POOL_WORKSPACE_HEIGHT, Math.max(MIN_POOL_WORKSPACE_HEIGHT, containerHeight - 220));
    return Math.min(Math.max(height, MIN_POOL_WORKSPACE_HEIGHT), maxHeight);
};
