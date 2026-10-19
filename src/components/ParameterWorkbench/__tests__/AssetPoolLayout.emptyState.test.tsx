import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * 资产池空状态回归。
 *
 * 曾存在的缺陷：列表为空时只看「搜索词 / 治理视图」判断是否在筛选，
 * 用 facet / 标签 / 状态 筛空时却提示「资产库空空如也」——让人以为库丢了，
 * 而且没有任何回到全部资产的入口。
 */

// zustand persist 依赖 localStorage。本环境 Node 的 --localstorage-file 桩缺 setItem，
// 且必须早于 vehicleStore 的 import 生效 → 用 vi.hoisted 提升到 import 之前。
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
    // 目录也要「存在」：代码先 exists(libraryPath) 再 readDir
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

const seed = () => {
    files.clear();
    files.set(`${LIB}/a.json`, JSON.stringify({
        productName: 'A 车型', parameters: [{ id: 'g::整备质量', group: 'g', name: '整备质量', value: '1980' }],
    }));
    files.set(`${LIB}/b.json`, JSON.stringify({
        productName: 'B 车型', parameters: [{ id: 'g::整备质量', group: 'g', name: '整备质量', value: '2100' }],
    }));
    files.set(`${LIB}/_asset_tags.json`, JSON.stringify({ 'a.json': ['已有标签'] }));
};

const cardFor = (fileName: string) =>
    document.querySelector(`[data-asset-file="${fileName}"]`);

describe('资产池空状态', () => {
    beforeEach(() => {
        seed();
        vi.clearAllMocks();
        memLocalStorage.clear();
        useVehicleStore.setState({ assetLibraryPath: LIB, assetVersion: 0, assetTagGroupsVersion: 0 });
    });

    it('状态筛选筛空时提示「没有匹配的资产」而非「资产库空空如也」，并可一键清除筛选', async () => {
        render(<AssetPoolLayout />);
        await waitFor(() => expect(cardFor('a.json')).toBeTruthy());

        // 状态 → 已废弃：两台车都不是废弃版本，结果为 0
        fireEvent.click(screen.getByText('状态'));
        fireEvent.click(await screen.findByText('已废弃'));

        await waitFor(() => expect(screen.getByText('没有匹配的资产')).toBeInTheDocument());
        expect(screen.queryByText(/空空如也/)).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
        await waitFor(() => expect(cardFor('a.json')).toBeTruthy());
        expect(cardFor('b.json')).toBeTruthy();
    });
});
