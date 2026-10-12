// 字段关联方案抽屉：方案选择与外部取数面板双向联动 + 规则一键置顶
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BidMappingDrawer from '../BidMappingDrawer';
import { createDefaultBidScheme } from '../../../utils/bidFieldMapping';
import type { BidMappingScheme } from '../../../utils/bidFieldMapping';

/** 两个方案：默认 13 项 + 一个 3 项的「投标方案 2」（观察顺序用） */
const schemeA = createDefaultBidScheme();
const schemeB: BidMappingScheme = {
    id: 'bid-scheme-b',
    name: '投标方案 2',
    rules: [
        { id: 'b-1', target: '字段甲', sources: [] },
        { id: 'b-2', target: '字段乙', sources: [] },
        { id: 'b-3', target: '字段丙', sources: [] },
    ],
};

const mockState = {
    uploadedFiles: [] as never[],
    assetFiles: [] as never[],
    activeAssets: [] as string[],
    assetLibraryPath: '/tmp/library',
    bumpBidMappingsVersion: vi.fn(),
    bidPullSchemeId: null as string | null,
    setBidPullSchemeId: vi.fn((id: string | null) => {
        mockState.bidPullSchemeId = id;
    }),
};

vi.mock('../../../store/vehicleStore', () => ({
    useVehicleStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

vi.mock('../../../utils/bidFieldMapping', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../utils/bidFieldMapping')>();
    return {
        ...actual,
        getBidSchemesSync: () => [schemeA, schemeB],
        saveBidMappingsConfig: vi.fn(async () => true),
        reloadBidMappings: vi.fn(async () => undefined),
    };
});

/** 抽屉当前展示的规则目标字段，按行序 */
const renderedTargets = (): string[] =>
    screen
        .getAllByPlaceholderText('投标字段名，如：外扩尺寸')
        .map((el) => (el as HTMLInputElement).value);

describe('BidMappingDrawer 方案联动与置顶', () => {
    beforeEach(() => {
        mockState.bidPullSchemeId = null;
    });

    afterEach(() => {
        cleanup();
        mockState.setBidPullSchemeId.mockClear();
        mockState.bumpBidMappingsVersion.mockClear();
    });

    it('落在外部已选方案上，而不是列表首个方案', () => {
        mockState.bidPullSchemeId = schemeB.id;
        render(<BidMappingDrawer open onClose={() => {}} />);

        expect(renderedTargets()).toEqual(['字段甲', '字段乙', '字段丙']);
        expect(screen.getByDisplayValue('投标方案 2')).toBeTruthy();
    });

    it('外部未选方案时回退首个方案，且不回写 store', () => {
        mockState.bidPullSchemeId = null;
        render(<BidMappingDrawer open onClose={() => {}} />);

        expect(renderedTargets()).toHaveLength(13);
        expect(mockState.setBidPullSchemeId).not.toHaveBeenCalled();
    });

    it('在抽屉里切换方案会同步给外部', () => {
        mockState.bidPullSchemeId = schemeB.id;
        render(<BidMappingDrawer open onClose={() => {}} />);

        fireEvent.mouseDown(screen.getByRole('combobox'));
        fireEvent.click(screen.getByTitle(`${schemeA.name}（13 项）`));

        // antd Select 的 onChange 会带 (value, option) 两个参数
        expect(mockState.setBidPullSchemeId.mock.calls[0]?.[0]).toBe(schemeA.id);
    });

    it('点第 2 条的置顶按钮后该规则排到最前', () => {
        mockState.bidPullSchemeId = schemeB.id;
        render(<BidMappingDrawer open onClose={() => {}} />);

        expect(renderedTargets()).toEqual(['字段甲', '字段乙', '字段丙']);
        fireEvent.click(screen.getAllByTitle('置顶')[1]);
        expect(renderedTargets()).toEqual(['字段乙', '字段甲', '字段丙']);
    });

    it('首条规则的置顶按钮禁用', () => {
        mockState.bidPullSchemeId = schemeB.id;
        render(<BidMappingDrawer open onClose={() => {}} />);

        const [first, second] = screen.getAllByTitle('置顶');
        expect((first as HTMLButtonElement).disabled).toBe(true);
        expect((second as HTMLButtonElement).disabled).toBe(false);
    });
});
