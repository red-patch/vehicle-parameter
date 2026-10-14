import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { SheetData, VehicleParameter } from '../../../types';

/**
 * 资产数据同步器必须在 assetVersion 变化时重读磁盘。
 *
 * 缺陷（2026-10-14 报）：批量字段维护就地改写资产并 bumpAssetVersion，但同步器
 * 只监听 [activeAssets, assetLibraryPath]。就地改写不改 activeAssets → 同步器不
 * 重跑 → Store 的 assetFiles 停留在改前内容 → 版本对比/工作区车辆读到旧值
 * （「已改成 11，对比模块仍空值」）。
 */

// 模拟磁盘：fileName → 参数行
const disk = new Map<string, VehicleParameter[]>();

vi.mock('../../../utils/assetManager', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../utils/assetManager')>();
    return {
        ...actual,
        loadAssetFile: vi.fn(async (_libraryPath: string, fileName: string): Promise<SheetData | null> =>
            disk.has(fileName)
                ? { fileName, data: disk.get(fileName)!, rawHeaders: [] }
                : null),
    };
});
vi.mock('../../../utils/assetKeyHeal', () => ({ deriveCanonicalAssetProductNames: () => ({}) }));

// zustand persist 依赖 localStorage；桩须早于 vehicleStore 的 import 生效
vi.hoisted(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
            setItem: (k: string, v: string) => { store.set(k, String(v)); },
            removeItem: (k: string) => { store.delete(k); },
            clear: () => { store.clear(); },
            key: (i: number) => Array.from(store.keys())[i] ?? null,
            get length() { return store.size; },
        },
    });
});

import AssetDataSynchronizer from '../AssetDataSynchronizer';
import { useVehicleStore } from '../../../store/vehicleStore';
import { buildVehicleInstanceKey } from '../../../utils/vehicleInstance';
import { getVehicleSelectionStates } from '../../../utils/vehicleSelectionState';

const fileValue = (fileName: string): string | number | undefined =>
    useVehicleStore.getState().assetFiles.find(f => f.fileName === fileName)?.data[0]?.value;

describe('AssetDataSynchronizer 按 assetVersion 重读', () => {
    beforeEach(() => {
        disk.clear();
        disk.set('a.json', [{ id: 'g::初速', group: 'g', name: '初速', value: '16' }]);
        useVehicleStore.setState({
            assetLibraryPath: '/lib',
            activeAssets: ['a.json'],
            assetFiles: [],
            assetVersion: 0,
        });
    });

    afterEach(() => { cleanup(); });

    it('首次挂载即从磁盘读入 activeAssets', async () => {
        render(<AssetDataSynchronizer />);
        await waitFor(() => expect(fileValue('a.json')).toBe('16'));
    });

    it('磁盘内容变更 + bumpAssetVersion 后，Store 里刷新为新值', async () => {
        render(<AssetDataSynchronizer />);
        await waitFor(() => expect(fileValue('a.json')).toBe('16'));

        // 模拟批量字段维护：就地写盘改成 11，然后 bump
        disk.set('a.json', [{ id: 'g::初速', group: 'g', name: '初速', value: '11' }]);
        useVehicleStore.getState().bumpAssetVersion();

        // 回归：修复前 assetVersion 不进依赖，Store 停在 '16'
        await waitFor(() => expect(fileValue('a.json')).toBe('11'));
    });

    it('版本对比读到的值随之更新（对比模块的数据路径）', async () => {
        render(<AssetDataSynchronizer />);
        const instanceKey = buildVehicleInstanceKey('asset', 'a.json', 'A 车型');

        // 先把该资产「送去对比」（selectedProductNames 里放实例键）
        useVehicleStore.setState({ selectedProductNames: [instanceKey], currentCompareProducts: [instanceKey] });
        await waitFor(() => {
            const st = getVehicleSelectionStates([], [instanceKey], useVehicleStore.getState().assetFiles, ['a.json']);
            expect(String(st.get(instanceKey)?.data.find(p => p.name === '初速')?.value)).toBe('16');
        });

        // 就地改写 + bump → 对比取到新值（回归：修复前停在旧值）
        disk.set('a.json', [{ id: 'g::初速', group: 'g', name: '初速', value: '11' }]);
        useVehicleStore.getState().bumpAssetVersion();

        await waitFor(() => {
            const st = getVehicleSelectionStates([], [instanceKey], useVehicleStore.getState().assetFiles, ['a.json']);
            expect(String(st.get(instanceKey)?.data.find(p => p.name === '初速')?.value)).toBe('11');
        });
    });
});
