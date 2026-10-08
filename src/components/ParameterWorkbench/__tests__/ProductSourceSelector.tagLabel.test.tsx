import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProductSourceSelector from '../ProductSourceSelector';
import { buildVehicleInstanceKey } from '../../../utils/vehicleInstance';
import type { SheetData } from '../../../types';
import type { VehicleStore } from '../../../store/vehicleStore';

const mockState = {
  uploadedFiles: [] as SheetData[],
  assetFiles: [] as SheetData[],
  selectedProductNames: [] as string[],
};

vi.mock('../../../store/vehicleStore', () => ({
  useVehicleStore: (selector: (state: VehicleStore) => unknown) => selector(mockState as unknown as VehicleStore),
}));

describe('ProductSourceSelector tag labels', () => {
  afterEach(() => {
    cleanup();
    mockState.uploadedFiles = [];
    mockState.assetFiles = [];
    mockState.selectedProductNames = [];
  });

  it('uses short numbered labels for selected vehicles with the same product name', () => {
    const firstKey = buildVehicleInstanceKey('excel', '确认版本A.xlsx', 'V6E DNC5037XXYBEVP1');
    const secondKey = buildVehicleInstanceKey('excel', '确认版本B.xlsx', 'V6E DNC5037XXYBEVP1');

    mockState.uploadedFiles = [
      {
        fileName: '确认版本A.xlsx',
        rawHeaders: [],
        data: [
          { id: '1', group: '基础', name: '快充', value: '有', productName: 'V6E DNC5037XXYBEVP1', instanceKey: firstKey },
        ],
      },
      {
        fileName: '确认版本B.xlsx',
        rawHeaders: [],
        data: [
          { id: '2', group: '基础', name: '快充', value: '无', productName: 'V6E DNC5037XXYBEVP1', instanceKey: secondKey },
        ],
      },
    ];
    mockState.selectedProductNames = [firstKey, secondKey];

    render(
      <ProductSourceSelector
        value={[firstKey, secondKey]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('V6E DNC5037XXYBEVP1（1）')).toBeInTheDocument();
    expect(screen.getByText('V6E DNC5037XXYBEVP1（2）')).toBeInTheDocument();
    expect(screen.queryByText('V6E DNC5037XXYBEVP1 · 确认版本A.xlsx')).not.toBeInTheDocument();
    expect(screen.queryByText('V6E DNC5037XXYBEVP1 · 确认版本B.xlsx')).not.toBeInTheDocument();
  });
});
