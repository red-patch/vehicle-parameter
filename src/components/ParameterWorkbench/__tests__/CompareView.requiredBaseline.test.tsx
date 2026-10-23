import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildVehicleInstanceKey } from '../../../utils/vehicleInstance';
import type { SheetData } from '../../../types';
import type { FieldGroupConfigItem } from '../../../utils/fieldLists';

/**
 * 必填改成「字段组驱动」后的行为契约（V5.6）：
 * - 选字段组（= 必填基准）→ 出现必填列、「必填」分段，且只认该组勾过的字段
 * - 不选字段组 → 必填列与「必填」分段都不出现（没有基准就没有必填可言）
 * - 切回「全部字段」时，停在「必填」分段上的视图要回落，否则列表被筛成空表
 */

let groups: FieldGroupConfigItem[] = [];

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

vi.mock('../../../utils/fieldLists', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/fieldLists')>();
  return {
    ...actual,
    getFieldGroupsSync: () => groups,
  };
});

const keyA = buildVehicleInstanceKey('excel', 'a.xlsx', '车型A');
const keyB = buildVehicleInstanceKey('excel', 'b.xlsx', '车型B');

const seed = () => {
  mockState.uploadedFiles = [
    {
      fileName: 'a.xlsx',
      rawHeaders: [],
      data: [
        { id: '1', group: '车身', name: '车厢材质', value: '铁平板', productName: '车型A', instanceKey: keyA },
        { id: '2', group: '车身', name: '钢板弹簧片数', value: '3/5+2', productName: '车型A', instanceKey: keyA },
      ],
    },
    {
      fileName: 'b.xlsx',
      rawHeaders: [],
      data: [
        { id: '3', group: '车身', name: '车厢材质', value: '复合板', productName: '车型B', instanceKey: keyB },
        { id: '4', group: '车身', name: '钢板弹簧片数', value: '4/5+2', productName: '车型B', instanceKey: keyB },
      ],
    },
  ];
  mockState.selectedProductNames = [keyA, keyB];
  mockState.currentCompareProducts = [keyA, keyB];
};

/** 结果工具条（第二个 ListToolbar）里的表头文字 */
const headerTexts = () => [...document.querySelectorAll('.ant-table-thead th')].map(th => th.textContent?.trim() ?? '');
const segmentedTexts = () => [...document.querySelectorAll('.ant-segmented-item')].map(el => el.textContent?.trim() ?? '');

beforeEach(() => {
  groups = [
    { id: 'g1', name: '准入模板', fields: ['车厢材质', '钢板弹簧片数'], required: ['车厢材质'] },
  ];
  seed();
});

afterEach(() => {
  cleanup();
  mockState.uploadedFiles = [];
  mockState.selectedProductNames = [];
  mockState.currentCompareProducts = [];
  mockState.requiredBaselineGroupId = null;
});

describe('CompareView 必填基准（字段组驱动）', () => {
  it('没选字段组时不出现必填列，也没有「必填」分段', async () => {
    const { default: CompareView } = await import('../CompareView');
    render(<CompareView />);
    await screen.findByText('车厢材质');

    expect(headerTexts()).not.toContain('必填');
    expect(segmentedTexts().some(t => t.startsWith('必填'))).toBe(false);
  });

  it('选了字段组：出现必填列，且只有组内勾过必填的行标「是」', async () => {
    mockState.requiredBaselineGroupId = 'g1';
    const { default: CompareView } = await import('../CompareView');
    render(<CompareView />);
    await screen.findByText('车厢材质');

    expect(headerTexts()).toContain('必填');
    expect(segmentedTexts().some(t => t.startsWith('必填'))).toBe(true);

    const rowOf = (name: string) => screen.getByText(name).closest('tr')!;
    // 车厢材质 = 组内勾了必填 → 是；钢板弹簧片数 = 组内有、未勾必填 → —
    expect(rowOf('车厢材质').textContent).toContain('是');
    expect(rowOf('钢板弹簧片数').textContent).not.toContain('是');
  });

  it('在「必填」分段上取消基准：视图回落到全部，而不是留一张空表', async () => {
    mockState.requiredBaselineGroupId = 'g1';
    const { default: CompareView } = await import('../CompareView');
    const { rerender } = render(<CompareView />);
    await screen.findByText('车厢材质');

    // 进入「必填」分段：只剩组内勾了必填的那一行
    const requiredSeg = [...document.querySelectorAll('.ant-segmented-item')]
      .find(el => el.textContent?.startsWith('必填')) as HTMLElement;
    fireEvent.click(requiredSeg);
    await screen.findByText('车厢材质');
    expect(screen.queryByText('钢板弹簧片数')).toBeNull();

    // 取消基准（真实环境里由「清除筛选」/字段组下拉触发 store 更新）
    fireEvent.click(screen.getByText('清除筛选'));
    expect(mockState.setRequiredBaselineGroupId).toHaveBeenCalledWith(null);
    mockState.requiredBaselineGroupId = null;
    rerender(<CompareView />);

    // 基准没了：「必填」分段消失，且视图回落——非必填行重新出现（若停在 required 会被筛空）
    expect(segmentedTexts().some(t => t.startsWith('必填'))).toBe(false);
    await screen.findByText('钢板弹簧片数');
  });
});
