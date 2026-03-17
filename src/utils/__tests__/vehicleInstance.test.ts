import { describe, expect, it } from 'vitest';
import { buildVehicleInstanceKey } from '../vehicleInstance';

describe('vehicleInstance', () => {
  it('builds different instance keys for same product name from different files', () => {
    const first = buildVehicleInstanceKey('excel', 'first.xlsx', 'V6E小卡车-20260206');
    const second = buildVehicleInstanceKey('excel', 'second.xlsx', 'V6E小卡车-20260206');

    expect(first).not.toBe(second);
    expect(first).toBe('excel::first.xlsx::V6E小卡车-20260206');
    expect(second).toBe('excel::second.xlsx::V6E小卡车-20260206');
  });
});
