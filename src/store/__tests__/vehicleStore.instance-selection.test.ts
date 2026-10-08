import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SheetData } from '../../types';

let useVehicleStore: typeof import('../vehicleStore').useVehicleStore;

const sameName = 'V6E DNC5037XXYBEVP1';

const makeFile = (fileName: string, value: string): SheetData => ({
  fileName,
  rawHeaders: [],
  data: [
    {
      id: `${fileName}-1`,
      group: '基础信息',
      name: '整备质量',
      value,
      productName: sameName,
    },
    {
      id: `${fileName}-2`,
      group: '基础信息',
      name: '最高车速',
      value: '90',
      productName: sameName,
    },
    {
      id: `${fileName}-3`,
      group: '基础信息',
      name: '轴距',
      value: '3000',
      productName: sameName,
    },
    {
      id: `${fileName}-4`,
      group: '基础信息',
      name: '外形尺寸长',
      value: '5000',
      productName: sameName,
    },
    {
      id: `${fileName}-5`,
      group: '基础信息',
      name: '外形尺寸宽',
      value: '1800',
      productName: sameName,
    },
  ],
});

describe('vehicleStore instance selection', () => {
  beforeAll(async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });

    ({ useVehicleStore } = await import('../vehicleStore'));
  });

  beforeEach(() => {
    useVehicleStore.getState().clearFiles();
    useVehicleStore.setState({
      confirmedProducts: [],
      excludedProducts: [],
      ignoredProductNames: [],
    });
    window.localStorage.clear();
  });

  it('auto-selects same-name vehicles from different files as two instance keys', () => {
    const store = useVehicleStore.getState();

    store.addFile(makeFile('first.xlsx', '1000'));
    store.addFile(makeFile('second.xlsx', '1200'));

    const { selectedProductNames, uploadedFiles } = useVehicleStore.getState();

    expect(uploadedFiles).toHaveLength(2);
    expect(selectedProductNames).toHaveLength(2);
    expect(selectedProductNames[0]).toContain('first.xlsx');
    expect(selectedProductNames[1]).toContain('second.xlsx');
  });

  it('keeps compare and multi-vehicle local selections independent while pruning both by selected vehicles', () => {
    const compareKey = 'excel::first.xlsx::车型A';
    const multiKey = 'asset::a.json::车型B';

    useVehicleStore.getState().setCompareProducts([compareKey]);
    useVehicleStore.getState().setMultiVehicleProducts([multiKey]);

    let state = useVehicleStore.getState();
    expect(state.currentCompareProducts).toEqual([compareKey]);
    expect(state.currentMultiVehicleProducts).toEqual([multiKey]);

    useVehicleStore.getState().setSelectedProductNames([compareKey]);

    state = useVehicleStore.getState();
    expect(state.currentCompareProducts).toEqual([compareKey]);
    expect(state.currentMultiVehicleProducts).toEqual([]);
  });

  it('heals drifted asset selection keys across module selections', () => {
    const driftedKey = 'asset::白犀牛R3_20260309.json::白犀牛R3_20260309';
    const healedKey = 'asset::白犀牛R3_20260309.json::白犀牛R3';

    useVehicleStore.setState({
      selectedProductNames: [driftedKey],
      currentCompareProducts: [driftedKey],
      currentSmartFillProduct: driftedKey,
      activeAssets: ['白犀牛R3_20260309.json'],
    });

    useVehicleStore.getState().healAssetSelectionKeys({ '白犀牛R3_20260309.json': '白犀牛R3' });

    const state = useVehicleStore.getState();
    expect(state.selectedProductNames).toEqual([healedKey]);
    expect(state.currentCompareProducts).toEqual([healedKey]);
    expect(state.currentSmartFillProduct).toBe(healedKey);
    // activeAssets 按文件名记录，不受 productName 漂移影响
    expect(state.activeAssets).toEqual(['白犀牛R3_20260309.json']);
  });

  it('leaves selection references untouched when healing has nothing to fix', () => {
    const key = 'excel::first.xlsx::车型A';
    useVehicleStore.setState({ selectedProductNames: [key], currentCompareProducts: [key] });

    const before = useVehicleStore.getState().selectedProductNames;
    useVehicleStore.getState().healAssetSelectionKeys({ '某资产.json': '某车型' });

    expect(useVehicleStore.getState().selectedProductNames).toBe(before);
  });
});
