import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('CompareView asset sync', () => {
  it('recomputes comparison rows when assetFiles arrive after first render', async () => {
    const { default: CompareView } = await import('../CompareView');

    mockState.uploadedFiles = [
      {
        fileName: 'a.xlsx',
        rawHeaders: [],
        data: [
          { id: '1', group: '基础', name: '快充', value: '有', productName: '车型A' },
        ],
      },
    ];
    mockState.assetFiles = [];
    mockState.selectedProductNames = ['车型A', '车型B'];
    mockState.currentCompareProducts = ['车型A', '车型B'];

    const { rerender } = render(<CompareView />);

    expect(await screen.findByText('快充')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);

    mockState.assetFiles = [
      {
        fileName: 'b.json',
        rawHeaders: [],
        data: [
          { id: '2', group: '基础', name: '快充', value: '无', productName: '车型B' },
        ],
      },
    ];

    rerender(<CompareView />);

    await waitFor(() => {
      expect(screen.getByText('无')).toBeInTheDocument();
    });
  }, 15000);
});
