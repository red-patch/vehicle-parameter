import { describe, expect, it } from 'vitest';
import { getProductData } from '../vehicleSelectors';
import type { SheetData } from '../../types';

describe('vehicleSelectors instance identity', () => {
  it('keeps same-name vehicles from different files isolated', () => {
    const uploadedFiles: SheetData[] = [
      {
        fileName: 'first.xlsx',
        rawHeaders: [],
        data: [
          {
            id: '1',
            group: '基础信息',
            name: '整备质量',
            value: '1000',
            productName: 'V6E小卡车-20260206',
          },
        ],
      },
      {
        fileName: 'second.xlsx',
        rawHeaders: [],
        data: [
          {
            id: '2',
            group: '基础信息',
            name: '整备质量',
            value: '1200',
            productName: 'V6E小卡车-20260206',
          },
        ],
      },
    ];

    const firstVehicle = getProductData(uploadedFiles, 'excel::first.xlsx::V6E小卡车-20260206');
    const secondVehicle = getProductData(uploadedFiles, 'excel::second.xlsx::V6E小卡车-20260206');

    expect(firstVehicle).toHaveLength(1);
    expect(firstVehicle[0]?.value).toBe('1000');
    expect(secondVehicle).toHaveLength(1);
    expect(secondVehicle[0]?.value).toBe('1200');
  });
});
