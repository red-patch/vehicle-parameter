import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  requiredBaselineGroupId: null as string | null,
  setRequiredBaselineGroupId: vi.fn(),
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

        // 页内两个 ListToolbar：「对比车型」与「对比结果」，取后者
        const resultTitle = [...document.querySelectorAll('[data-slot="list-title"]')].find(
            el => el.textContent === '对比结果',
        );
        const bar = resultTitle?.closest('.list-shell');
        expect(bar).not.toBeNull();
        expect(bar!.className).toContain('surface-container');
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

        // 计数跟在文字后、无括号（CountLabel，列表区设计语言 §5.2）
        const all = [...document.querySelectorAll('.ant-segmented-item-label')].find(el =>
            el.textContent?.startsWith('全部'),
        );
        expect(all?.textContent).toMatch(/^全部\d+$/);
        expect(screen.getByText('字段组：')).toBeInTheDocument();
        // SearchInput 固定带搜索图标（非裸 Input 的写法）
        const searchWrap = document.querySelector('.ant-input-affix-wrapper .anticon-search');
        expect(searchWrap).not.toBeNull();
    }, 15000);

    it('「清除筛选」仅在筛选行非默认时出现，点了回到全量（§5.3）', async () => {
        const { default: CompareView } = await import('../CompareView');
        seed();
        render(<CompareView />);
        await screen.findByText('整备质量');

        // 用查询而不是 getByText：按钮不渲染时 antd/Tailwind 仍会留下一个空 span
        const clearButton = () => screen.queryByText('清除筛选')?.closest('button') ?? null;

        // 两车值不同 → 页面自动切「只看差异」（CompareView 的既有行为），
        // 因此首屏本就处于筛选态，「清除筛选」应在
        expect(clearButton()).not.toBeNull();

        fireEvent.click(clearButton()!);
        // 回到「全部」+ 无条件可清
        expect(clearButton()).toBeNull();

        // 再次切到「差异」算筛选 → 按钮回来
        fireEvent.click(screen.getByText(/^差异/));
        expect(clearButton()).not.toBeNull();
        fireEvent.click(clearButton()!);

        // 显示开关（隐藏无值字段）不属于筛选，不应唤醒清除按钮
        fireEvent.click(screen.getByLabelText(/隐藏无值字段/));
        expect(clearButton()).toBeNull();
    }, 15000);

    it('标题段显示计数：已选车型数与「显示 / 总数」（§5.2 计数是文字不是标签）', async () => {
        const { default: CompareView } = await import('../CompareView');
        seed();
        render(<CompareView />);
        await screen.findByText('整备质量');
        const titles = [...document.querySelectorAll('[data-slot="list-title"]')].map(el => el.textContent);
        expect(titles).toEqual(['对比车型', '对比结果']);
        const counts = [...document.querySelectorAll('[data-slot="list-count"]')].map(el => el.textContent);
        expect(counts).toHaveLength(2);
        for (const c of counts) expect(c).toMatch(/^\d+( \/ \d+)?$/);
        // 旧写法（蓝 Tag「已选 N 款」、灰 Tag「显示: N 条」）不再出现
        expect(screen.queryByText(/显示: \d+ 条/)).toBeNull();
    }, 15000);
});
