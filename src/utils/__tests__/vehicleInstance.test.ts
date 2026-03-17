import { describe, expect, it } from 'vitest';
import { buildVehicleDisplayLabels, buildVehicleInstanceKey } from '../vehicleInstance';

describe('vehicleInstance', () => {
  it('builds different instance keys for same product name from different files', () => {
    const first = buildVehicleInstanceKey('excel', 'first.xlsx', 'V6E小卡车-20260206');
    const second = buildVehicleInstanceKey('excel', 'second.xlsx', 'V6E小卡车-20260206');

    expect(first).not.toBe(second);
    expect(first).toBe('excel::first.xlsx::V6E小卡车-20260206');
    expect(second).toBe('excel::second.xlsx::V6E小卡车-20260206');
  });

  it('builds stable short display labels and auto numbers duplicate product names', () => {
    const first = buildVehicleInstanceKey('excel', 'b.xlsx', '车型A');
    const second = buildVehicleInstanceKey('asset', 'a.json', '车型A');
    const third = buildVehicleInstanceKey('excel', 'c.xlsx', '车型B');

    const labels = buildVehicleDisplayLabels([first, second, third]);

    expect(labels.get(first)).toEqual({
      shortLabel: '车型A（2）',
      fullLabel: '车型A · b.xlsx',
    });
    expect(labels.get(second)).toEqual({
      shortLabel: '车型A（1）',
      fullLabel: '车型A · a.json',
    });
    expect(labels.get(third)).toEqual({
      shortLabel: '车型B',
      fullLabel: '车型B · c.xlsx',
    });
  });
});
