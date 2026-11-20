import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * 组头「对比本组」入口回归。
 *
 * 锁三件事：
 * 1. 车型组头有对比入口；
 * 2. 点击后组内文件全部进入工作集（对比页只消费工作集，不激活就会被 CompareView 踢掉）；
 * 3. 对比页的选择被显式设为这批文件，并触发页面跳转。
 */

const memLocalStorage = vi.hoisted(() => {
    const store = new Map<string, string>();
    const impl = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() { return store.size; },
    };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: impl });
    return impl;
});

const files = new Map<string, string>();
const LIB = '/lib';

vi.mock('@tauri-apps/plugin-fs', () => ({
    readTextFile: vi.fn(async (path: string) => {
        if (!files.has(path)) throw new Error(`ENOENT: ${path}`);
        return files.get(path)!;
    }),
    writeTextFile: vi.fn(async (path: string, content: string) => { files.set(path, content); }),
    exists: vi.fn(async (path: string) => files.has(path) || path === LIB),
    readDir: vi.fn(async (path: string) => Array.from(files.keys())
        .filter(p => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
        .map(p => ({ name: p.slice(path.length + 1), isDirectory: false, isFile: true }))),
    remove: vi.fn(async (path: string) => { files.delete(path); }),
    rename: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/path', () => ({
    join: vi.fn(async (...p: string[]) => p.join('/').replace(/\/+/g, '/')),
}));

import AssetPoolLayout from '../AssetPool/AssetPoolLayout';
import { useVehicleStore } from '../../../store/vehicleStore';
import { buildVehicleInstanceKey } from '../../../utils/vehicleInstance';

const A = 'V6E 宁德时代新能源科技股份有限公司 41.86 AAA111 Ⅱ.json';
const B = 'V6E 宁德时代新能源科技股份有限公司 41.86 BBB222 Ⅱ.json';

const seed = () => {
    files.clear();
    files.set(`${LIB}/${A}`, JSON.stringify({
        productName: 'V6E 宁德时代新能源科技股份有限公司 41.86 AAA111 Ⅱ',
        parameters: [{ id: 'g::整备质量', group: 'g', name: '整备质量', value: '1980' }],
    }));
    files.set(`${LIB}/${B}`, JSON.stringify({
        productName: 'V6E 宁德时代新能源科技股份有限公司 41.86 BBB222 Ⅱ',
        parameters: [{ id: 'g::整备质量', group: 'g', name: '整备质量', value: '2100' }],
    }));
};

const keyOf = (fileName: string, productName: string) =>
    buildVehicleInstanceKey('asset', fileName, productName);

describe('组头「对比本组」', () => {
    beforeEach(() => {
        seed();
        vi.clearAllMocks();
        memLocalStorage.clear();
        useVehicleStore.setState({
            assetLibraryPath: LIB,
            assetVersion: 0,
            assetTagGroupsVersion: 0,
            activeAssets: [],
            selectedProductNames: [],
            currentCompareProducts: [],
            currentPurifyProduct: null,
            currentSmartFillProduct: null,
        });
    });

    it('把组内文件加入工作集，并切到对比页', async () => {
        const onGoCompare = vi.fn();
        render(<AssetPoolLayout onGoCompare={onGoCompare} />);

        const entry = await screen.findByLabelText('对比本组');
        fireEvent.click(entry);

        await waitFor(() => expect(onGoCompare).toHaveBeenCalledTimes(1));

        const state = useVehicleStore.getState();
        const keys = [
            keyOf(A, 'V6E 宁德时代新能源科技股份有限公司 41.86 AAA111 Ⅱ'),
            keyOf(B, 'V6E 宁德时代新能源科技股份有限公司 41.86 BBB222 Ⅱ'),
        ];
        expect(state.activeAssets.sort()).toEqual([A, B].sort());
        expect(state.selectedProductNames.sort()).toEqual(keys.sort());
        expect(state.currentCompareProducts.sort()).toEqual(keys.sort());
    });
});
