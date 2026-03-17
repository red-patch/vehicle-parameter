import { describe, expect, it } from 'vitest';
import { getVehicleSelectionStates } from '../vehicleSelectionState';
import { buildVehicleInstanceKey } from '../vehicleInstance';
import type { SheetData } from '../../types';

describe('vehicleSelectionState', () => {
  it('marks selected asset instances as pending before asset files finish syncing', () => {
    const excelKey = buildVehicleInstanceKey('excel', 'a.xlsx', '车型A');
    const assetKey = buildVehicleInstanceKey('asset', 'a.json', '车型B');
    const uploadedFiles: SheetData[] = [
      {
        fileName: 'a.xlsx',
        rawHeaders: [],
        data: [
          { id: '1', group: '基础', name: '快充', value: '有', productName: '车型A', instanceKey: excelKey },
        ],
      },
    ];

    const states = getVehicleSelectionStates(uploadedFiles, [excelKey, assetKey], [], ['a.json']);

    expect(states.get(excelKey)?.status).toBe('ready');
    expect(states.get(assetKey)?.status).toBe('pending');
  });
});
