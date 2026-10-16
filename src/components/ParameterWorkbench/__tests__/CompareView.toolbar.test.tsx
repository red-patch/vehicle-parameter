import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildVehicleInstanceKey } from '../../../utils/vehicleInstance';
import type { SheetData } from '../../../types';

/**
 * 批次 3（设计：docs/plans/2026-10-16-列表页设计语言-design.md §7）：
 * 版本对比是压力最大的页面——三段槽位、双轨容器、重复导出入口都在这。
 *
 * 结构契约：
 * - 结果工具条走 ListToolbar 三段（title+actions / filters / display）
 * - 两个「显示选项」Checkbox 在 display 段，不与筛选混排（§4.1）
 * - 「导出报告」一屏只出现一次（§5.1）
 * - 搜索走 SearchInput（控件唯一形态）
 */

const mockState = {
  uploadedFiles: [] as SheetData[],
  assetFiles: [] as SheetData[],
  activeAssets: [] as string[],
  selectedProductNames: [] as string[],
  currentCompareProducts: [] as string[],
  setCompareProducts: vi.fn(),
  setPurifyProduct: vi.fn(),
  setRepairContext: vi.fn(),
  fieldGroupsVersion: 0,
};

vi.mock('../../../store/vehicleStore', () => ({
  useVehicleStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

const keyA = buildVehicleInstanceKey('excel', 'a.xlsx', '车型A');
const keyB = buildVehicleInstanceKey('excel', 'b.xlsx', '车型B');

const seed = () => {
  mockState.uploadedFiles = [
    {
      fileName: 'a.xlsx',
      rawHeaders: [],
      data: [{ id: '1', group: '车身', name: '整备质量', value: '1000', productName: '车型A', instanceKey: keyA }],
    },
    {
      fileName: 'b.xlsx',
      rawHeaders: [],
      data: [{ id: '2', group: '车身', name: '整备质量', value: '1200', productName: '车型B', instanceKey: keyB }],
    },
  ];
  mockState.selectedProductNames = [keyA, keyB];
  mockState.currentCompareProducts = [keyA, keyB];
};

afterEach(() => {
  cleanup();
  mockState.uploadedFiles = [];
  mockState.selectedProductNames = [];
  mockState.currentCompareProducts = [];
});

describe('CompareView 结果工具条（批次 3）', () => {
    it('显示选项独立成段，不与筛选混排（§4.1）', async () => {
        const { default: CompareView } = await import('../CompareView');
        seed();
        render(<CompareView />);
        await screen.findByText('整备质量');

        const bar = document.querySelector('.surface-container.border.rounded-lg');
        expect(bar).not.toBeNull();
        // 三段：标题/筛选/显示 → 两条分隔线
        const rows = bar!.children;
        expect(rows.length).toBeGreaterThanOrEqual(3);
        const displayRow = rows[rows.length - 2]; // display 段（其后是主体）
        expect(displayRow.textContent).toContain('隐藏无值字段');
        expect(displayRow.textContent).toContain('按字段名合并');
        // 筛选段不含这两个开关
        const filterRow = rows[1];
        expect(filterRow.textContent).not.toContain('隐藏无值字段');
        expect(filterRow.textContent).not.toContain('按字段名合并');
    }, 15000);

    it('导出报告一屏内只出现一次（§5.1）', async () => {
        const { default: CompareView } = await import('../CompareView');
        seed();
        render(<CompareView />);
        await screen.findByText('整备质量');
        expect(screen.getAllByText(/导出报告/)).toHaveLength(1);
    }, 15000);

    it('筛选段含视图切换与字段组，搜索走 SearchInput', async () => {
        const { default: CompareView } = await import('../CompareView');
        seed();
        render(<CompareView />);
        await screen.findByText('整备质量');

        expect(screen.getByText(/^全部 \(/)).toBeInTheDocument();
        expect(screen.getByText('字段组：')).toBeInTheDocument();
        // SearchInput 固定带搜索图标（非裸 Input 的写法）
        const searchWrap = document.querySelector('.ant-input-affix-wrapper .anticon-search');
        expect(searchWrap).not.toBeNull();
    }, 15000);

    it('标题段显示项数与导出行数，操作在右端', async () => {
        const { default: CompareView } = await import('../CompareView');
        seed();
        render(<CompareView />);
        await screen.findByText('整备质量');
        expect(screen.getByText(/共 \d+ 项/)).toBeInTheDocument();
        expect(screen.getByText(/显示: \d+ 条/)).toBeInTheDocument();
    }, 15000);
});
