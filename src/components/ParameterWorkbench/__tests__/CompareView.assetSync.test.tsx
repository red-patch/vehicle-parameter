import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildVehicleInstanceKey } from '../../../utils/vehicleInstance';

const mockState = {
  uploadedFiles: [] as any[],
  assetFiles: [] as any[],
  selectedProductNames: [] as string[],
  currentCompareProducts: [] as string[],
  setCompareProducts: vi.fn(),
  setPurifyProduct: vi.fn(),
  setRepairContext: vi.fn(),
  fieldGroupsVersion: 0,
};

vi.mock('../../../store/vehicleStore', () => ({
  useVehicleStore: (selector: any) => selector(mockState),
}));

describe('CompareView asset sync', () => {
  afterEach(() => {
    cleanup();
    mockState.uploadedFiles = [];
    mockState.assetFiles = [];
    mockState.selectedProductNames = [];
    mockState.currentCompareProducts = [];
    mockState.setCompareProducts.mockClear();
    mockState.setPurifyProduct.mockClear();
    mockState.setRepairContext.mockClear();
  });

  it('recomputes comparison rows when assetFiles are loaded after initial render', async () => {
    const { default: CompareView } = await import('../CompareView');
    const excelKey = buildVehicleInstanceKey('excel', 'a.xlsx', '车型A');
    const assetKey = buildVehicleInstanceKey('asset', 'a.json', '车型A资产');

    mockState.uploadedFiles = [
      {
        fileName: 'a.xlsx',
        rawHeaders: [],
        data: [
          { id: '1', group: '基础', name: '快充', value: '有', productName: '车型A', instanceKey: excelKey },
        ],
      },
    ];
    mockState.assetFiles = [];
    mockState.selectedProductNames = [excelKey, assetKey];
    mockState.currentCompareProducts = [excelKey, assetKey];

    const { rerender } = render(<CompareView />);

    expect(await screen.findByText('快充')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);

    mockState.assetFiles = [
      {
        fileName: 'a.json',
        rawHeaders: [],
        data: [
          { id: '2', group: '基础', name: '快充', value: '无', productName: '车型A资产', instanceKey: assetKey },
        ],
      },
    ];

    rerender(<CompareView />);

    await waitFor(() => {
      expect(screen.getByText('无')).toBeInTheDocument();
    });
  }, 15000);
});
