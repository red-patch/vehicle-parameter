import { describe, expect, it } from 'vitest';
import {
    DEFAULT_POOL_SIDEBAR_WIDTH,
    DEFAULT_POOL_WORKSPACE_HEIGHT,
    clampPoolSidebarWidth,
    clampPoolWorkspaceHeight,
} from '../poolLayout';

describe('poolLayout', () => {
    it('uses a wider default sidebar than the old fixed layout', () => {
        expect(DEFAULT_POOL_SIDEBAR_WIDTH).toBeGreaterThan(380);
        expect(DEFAULT_POOL_WORKSPACE_HEIGHT).toBeGreaterThan(180);
    });

    it('clamps sidebar width into safe bounds', () => {
        expect(clampPoolSidebarWidth(100, 1200)).toBe(360);
        expect(clampPoolSidebarWidth(900, 1200)).toBe(576);
        expect(clampPoolSidebarWidth(460, 1200)).toBe(460);
    });

    it('clamps workspace height into safe bounds', () => {
        expect(clampPoolWorkspaceHeight(80, 900)).toBe(170);
        expect(clampPoolWorkspaceHeight(700, 900)).toBe(420);
        expect(clampPoolWorkspaceHeight(260, 900)).toBe(260);
    });
});
