import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * 浮动购物车「一键清空」回归（用户反馈：清理工作集要点两次）。
 *
 * 锁住三件事：
 * 1. 胶囊上直接有清空入口 —— 不展开浮层也能清；
 * 2. 一次点击即清空（不是二分：资产车 + 本地车 + 各模块选中一起清）；
 * 3. 清空可在 toast 里撤销 —— 因为省掉了二次确认，撤销就是误触的兜底。
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

const seed = () => {
    files.clear();
    files.set(`${LIB}/a.json`, JSON.stringify({
        productName: 'A 车型', parameters: [{ id: 'g::整备质量', group: 'g', name: '整备质量', value: '1980' }],
    }));
    files.set(`${LIB}/b.json`, JSON.stringify({
        productName: 'B 车型', parameters: [{ id: 'g::整备质量', group: 'g', name: '整备质量', value: '2100' }],
    }));
};

const keyOf = (fileName: string, productName: string) =>
    buildVehicleInstanceKey('asset', fileName, productName);

describe('浮动购物车一键清空', () => {
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

    it('胶囊上有清空入口，点一次即清空工作集', async () => {
        useVehicleStore.setState({
            activeAssets: ['a.json', 'b.json'],
            selectedProductNames: [keyOf('a.json', 'A 车型'), keyOf('b.json', 'B 车型')],
            currentCompareProducts: [keyOf('a.json', 'A 车型')],
        });
        render(<AssetPoolLayout />);

        // 胶囊出现（未展开浮层）
        const clearButton = await screen.findByRole('button', { name: '清空工作集' });
        expect(screen.getByText('2 台车')).toBeInTheDocument();

        fireEvent.click(clearButton);

        const state = useVehicleStore.getState();
        expect(state.selectedProductNames).toEqual([]);
        expect(state.activeAssets).toEqual([]);
        expect(state.currentCompareProducts).toEqual([]);
        // 胶囊随之消失（工作集为空）
        await waitFor(() => expect(screen.queryByText('2 台车')).toBeNull());
    });

    it('清空后可在 toast 里撤销，工作集原样恢复', async () => {
        const keys = [keyOf('a.json', 'A 车型'), keyOf('b.json', 'B 车型')];
        useVehicleStore.setState({ activeAssets: ['a.json', 'b.json'], selectedProductNames: keys });
        render(<AssetPoolLayout />);

        fireEvent.click(await screen.findByRole('button', { name: '清空工作集' }));
        expect(useVehicleStore.getState().selectedProductNames).toEqual([]);

        fireEvent.click(await screen.findByRole('button', { name: '撤销' }));
        expect(useVehicleStore.getState().selectedProductNames).toEqual(keys);
        expect(useVehicleStore.getState().activeAssets).toEqual(['a.json', 'b.json']);
    });

    it('无选中时胶囊不渲染（清空入口只在有内容时存在）', async () => {
        render(<AssetPoolLayout />);
        await waitFor(() => expect(document.querySelector('[data-asset-file="a.json"]')).toBeTruthy());
        expect(screen.queryByRole('button', { name: '清空工作集' })).toBeNull();
    });
});
