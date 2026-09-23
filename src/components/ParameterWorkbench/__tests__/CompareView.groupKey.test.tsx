import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

const excelKeyA = buildVehicleInstanceKey('excel', 'a.xlsx', '车型A');
const excelKeyB = buildVehicleInstanceKey('excel', 'b.xlsx', '车型B');

describe('CompareView 合并 key（分组+参数名）', () => {
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

  it('同名参数在不同分组下生成独立行，各自的值都展示', async () => {
    const { default: CompareView } = await import('../CompareView');
    mockState.uploadedFiles = [
      {
        fileName: 'a.xlsx',
        rawHeaders: [],
        data: [
          { id: '1', group: '红绿灯相机', name: '型号', value: 'CAM-A', productName: '车型A', instanceKey: excelKeyA },
          { id: '2', group: '超声波雷达', name: '型号', value: 'USS-B', productName: '车型A', instanceKey: excelKeyA },
        ],
      },
    ];
    mockState.selectedProductNames = [excelKeyA];
    mockState.currentCompareProducts = [excelKeyA];

    render(<CompareView />);

    expect(await screen.findByText('CAM-A')).toBeInTheDocument();
    expect(screen.getByText('USS-B')).toBeInTheDocument();
    expect(screen.getAllByText('型号').length).toBe(2);
  }, 15000);

  it('同分组同名的重复行，后面的空值不覆盖前面已填的值', async () => {
    const { default: CompareView } = await import('../CompareView');
    mockState.uploadedFiles = [
      {
        fileName: 'a.xlsx',
        rawHeaders: [],
        data: [
          { id: '1', group: '红绿灯相机', name: '型号', value: 'CAM-A', productName: '车型A', instanceKey: excelKeyA },
          { id: '2', group: '红绿灯相机', name: '型号', value: '', productName: '车型A', instanceKey: excelKeyA },
        ],
      },
    ];
    mockState.selectedProductNames = [excelKeyA];
    mockState.currentCompareProducts = [excelKeyA];

    render(<CompareView />);

    await screen.findByText('型号');
    expect(screen.getByText('CAM-A')).toBeInTheDocument();
  }, 15000);

  it('双车对比时不同总成的同名参数按分组配对，不再错位比较', async () => {
    const { default: CompareView } = await import('../CompareView');
    mockState.uploadedFiles = [
      {
        fileName: 'a.xlsx',
        rawHeaders: [],
        data: [
          { id: '1', group: '红绿灯相机', name: '型号', value: 'CAM-A', productName: '车型A', instanceKey: excelKeyA },
          { id: '2', group: '超声波雷达', name: '型号', value: 'USS-A', productName: '车型A', instanceKey: excelKeyA },
        ],
      },
      {
        fileName: 'b.xlsx',
        rawHeaders: [],
        data: [
          { id: '3', group: '红绿灯相机', name: '型号', value: 'CAM-B', productName: '车型B', instanceKey: excelKeyB },
          { id: '4', group: '超声波雷达', name: '型号', value: 'USS-B', productName: '车型B', instanceKey: excelKeyB },
        ],
      },
    ];
    mockState.selectedProductNames = [excelKeyA, excelKeyB];
    mockState.currentCompareProducts = [excelKeyA, excelKeyB];

    render(<CompareView />);

    // 双车且有差异时会自动切到"只看差异"，两行都在
    await waitFor(() => {
      expect(screen.getByText('CAM-A')).toBeInTheDocument();
      expect(screen.getByText('CAM-B')).toBeInTheDocument();
      expect(screen.getByText('USS-A')).toBeInTheDocument();
      expect(screen.getByText('USS-B')).toBeInTheDocument();
    });
    expect(screen.getAllByText('型号').length).toBe(2);
  }, 15000);
});
