import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildVehicleInstanceKey } from '../../../utils/vehicleInstance';
import type { SheetData } from '../../../types';

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

const carA = buildVehicleInstanceKey('excel', 'a.xlsx', '车型A');
const carB = buildVehicleInstanceKey('excel', 'b.xlsx', '车型B');

describe('CompareView 按字段名合并', () => {
  afterEach(() => {
    cleanup();
    mockState.uploadedFiles = [];
    mockState.assetFiles = [];
    mockState.activeAssets = [];
    mockState.selectedProductNames = [];
    mockState.currentCompareProducts = [];
    mockState.setCompareProducts.mockClear();
    mockState.setPurifyProduct.mockClear();
    mockState.setRepairContext.mockClear();
  });

  /** 两台同源车：同一字段「迎风面积 (m²)」值一致，只是导入时归属总成不同 */
  const seedSameFieldDifferentGroups = () => {
    mockState.uploadedFiles = [
      {
        fileName: 'a.xlsx',
        rawHeaders: [],
        data: [
          { id: '1', group: '空气动力学', name: '迎风面积 (m²)', value: '3.33', productName: '车型A', instanceKey: carA },
        ],
      },
      {
        fileName: 'b.xlsx',
        rawHeaders: [],
        data: [
          { id: '2', group: '基础信息', name: '迎风面积 (m²)', value: '3.33', productName: '车型B', instanceKey: carB },
        ],
      },
    ];
    mockState.selectedProductNames = [carA, carB];
    mockState.currentCompareProducts = [carA, carB];
  };

  it('默认关闭时，同字段不同总成被拆成两行并判为差异', async () => {
    const { default: CompareView } = await import('../CompareView');
    seedSameFieldDifferentGroups();

    render(<CompareView />);

    // 两行同名参数
    await waitFor(() => expect(screen.getAllByText('迎风面积 (m²)').length).toBe(2));
  }, 15000);

  it('开启后，同字段跨总成合并为一行且判为一致', async () => {
    const { default: CompareView } = await import('../CompareView');
    seedSameFieldDifferentGroups();

    render(<CompareView />);

    const toggle = await screen.findByText('按字段名合并');
    fireEvent.click(toggle);

    // 合并成一行，分组显示为「多组」
    await waitFor(() => expect(screen.getAllByText('迎风面积 (m²)').length).toBe(1));
    expect(screen.getByText('多组')).toBeInTheDocument();
    // 值一致 → 差异计数归零
    const diff = [...document.querySelectorAll('.ant-segmented-item-label')].find(el =>
      el.textContent?.startsWith('差异'),
    );
    expect(diff?.textContent).toBe('差异0');
  }, 15000);
});
