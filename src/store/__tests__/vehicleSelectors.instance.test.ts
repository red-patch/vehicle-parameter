import { describe, expect, it } from 'vitest';
import { getProductData, getProductOptions } from '../vehicleSelectors';
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

  it('includes selected asset instances in product options before asset files finish syncing', () => {
    const selectedProductNames = [
      'excel::first.xlsx::车型A',
      'asset::asset.json::车型A',
      'excel::second.xlsx::车型B',
    ];

    const options = getProductOptions([], selectedProductNames, []);

    expect(options.map((option) => option.value)).toEqual(selectedProductNames);
    expect(options[0]).toEqual({
      value: 'excel::first.xlsx::车型A',
      label: '车型A（2）',
    });
    expect(options[1]).toEqual({
      value: 'asset::asset.json::车型A',
      label: '车型A（1）',
    });
    expect(options[2]).toEqual({
      value: 'excel::second.xlsx::车型B',
      label: '车型B',
    });
  });
});
