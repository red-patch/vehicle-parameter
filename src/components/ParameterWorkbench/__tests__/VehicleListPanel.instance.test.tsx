import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VehicleListPanel from '../VehicleListPanel';
import { buildVehicleInstanceKey } from '../../../utils/vehicleInstance';

const sameName = 'V6E小卡车-20260206';
const firstKey = buildVehicleInstanceKey('excel', 'first.xlsx', sameName);
const secondKey = buildVehicleInstanceKey('excel', 'second.xlsx', sameName);

vi.mock('../../../store/vehicleStore', () => ({
  useVehicleStore: (selector: (state: unknown) => unknown) => selector({
    uploadedFiles: [
      {
        fileName: 'first.xlsx',
        rawHeaders: [],
        data: [
          { id: '1', group: '基础信息', name: '整备质量', value: '1000', productName: sameName, instanceKey: firstKey },
        ],
      },
      {
        fileName: 'second.xlsx',
        rawHeaders: [],
        data: [
          { id: '2', group: '基础信息', name: '整备质量', value: '1200', productName: sameName, instanceKey: secondKey },
        ],
      },
    ],
    assetFiles: [],
    selectedProductNames: [firstKey, secondKey],
    setSelectedProductNames: vi.fn(),
    setCompareProducts: vi.fn(),
    assetLibraryPath: null,
    activeAssets: [],
    ignoredProductNames: [],
  }),
}));

vi.mock('../../../utils/assetManager', () => ({
  getAssetFilesWithInfo: vi.fn().mockResolvedValue([]),
}));

afterEach(() => {
  cleanup();
});

describe('VehicleListPanel instance identity', () => {
  it('shows same-name vehicles from different files as separate active cards with stable numbered titles', () => {
    render(
      <VehicleListPanel
        focusedProduct={null}
        onFocusProduct={vi.fn()}
      />
    );

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(`${sameName}（1）`)).toBeInTheDocument();
    expect(screen.getByText(`${sameName}（2）`)).toBeInTheDocument();
    expect(screen.getByText('@first.xlsx')).toBeInTheDocument();
    expect(screen.getByText('@second.xlsx')).toBeInTheDocument();
  });
});
