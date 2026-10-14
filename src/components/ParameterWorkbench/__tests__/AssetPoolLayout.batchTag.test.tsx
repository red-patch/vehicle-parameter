import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * 批量打标签后列表即时回显回归。
 *
 * 曾存在的缺陷：AssetPoolLayout.handleBatchAddTags 只落盘、不触发快照重拉
 * （useAssetLibrarySnapshot 只在 assetLibraryPath/assetVersion 变化时重读），
 * 于是标签写进了 _asset_tags.json，卡片却仍显示旧标签，直到刷新/切页才出现。
 *
 * 本测试断言「落盘后卡片回显新标签」，不关心是谁触发的刷新信号。
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

/** 批量栏输入标签并回车 */
const applyTag = (tag: string) => {
    const input = screen.getByPlaceholderText(/回车应用到已选/);
    fireEvent.change(input, { target: { value: tag } });
    fireEvent.keyDown(input, { key: 'Enter' });
};

describe('批量打标签后的列表回显', () => {
    beforeEach(() => {
        seed();
        vi.clearAllMocks();
        memLocalStorage.clear();
        useVehicleStore.setState({ assetLibraryPath: LIB, assetVersion: 0, assetTagGroupsVersion: 0 });
    });

    it('应用标签后，卡片立即显示新标签（无需刷新）', async () => {
        render(<AssetPoolLayout />);

        // 进入批量模式 = 右键卡片 → 批量选择；顺带选定该资产（V8E 实测路径）
        await waitFor(() => expect(cardFor('a.json')).toBeTruthy());
        fireEvent.contextMenu(cardFor('a.json') as HTMLElement);
        fireEvent.click(await screen.findByText('批量选择'));

        await waitFor(() => expect(screen.getByText(/^已选 1 \/ 2$/)).toBeInTheDocument());
        applyTag('公告数据');

        // 盘上确实写入了
        await waitFor(() => {
            const stored = JSON.parse(files.get(`${LIB}/_asset_tags.json`)!);
            expect(stored['a.json']).toContain('公告数据');
        });

        // 卡片也必须回显——这条断言就是回归点
        await waitFor(() => {
            expect(within(cardFor('a.json') as HTMLElement).getByText('公告数据')).toBeInTheDocument();
        });
    });
});
