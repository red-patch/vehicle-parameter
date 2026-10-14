import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * 批量补录受控属性：词表归一 + 就地收词回归。
 *
 * 缺陷：V2 面板（AssetPoolLayout）的 handleSaveFacetOverrides 直接把编辑器给的原文
 * 写进 _facet_values.json，没走 addVocabValue 归一/收词（设计文档
 * docs/plans/2026-10-13-batch-field-maintenance-design.md §6.2 要求）：
 *   1. 输入词表别名（如「上汽大通」）会原样落盘，而不是规范名「上汽大通汽车有限公司」
 *      → 侧栏/筛选里同一主机厂裂成两行（规范名 + 裸别名）；
 *   2. 编辑器占位符承诺「可输入新增」，但词表外新值从不写进 _facet_vocab.json。
 */

// zustand persist 依赖 localStorage；本环境 Node 的 --localstorage-file 桩缺 setItem，
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

/** 资产无主机厂（整车生产企业为空）→ 走「补全」路径 */
const seed = () => {
    files.clear();
    files.set(`${LIB}/a.json`, JSON.stringify({
        productName: 'A 车型',
        parameters: [{ id: 'g::整车生产企业', group: 'g', name: '整车生产企业', value: '' }],
    }));
    files.set(`${LIB}/_asset_tags.json`, JSON.stringify({}));
};

/** 打开治理体检 → 批量补录抽屉 */
const openBatchEditor = async () => {
    render(<AssetPoolLayout />);
    await waitFor(() => expect(document.querySelector('[data-asset-file="a.json"]')).toBeTruthy());
    fireEvent.click(screen.getByText('治理体检'));
    await waitFor(() => expect(screen.getByText(/打开批量补录/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/打开批量补录/));
    await waitFor(() => expect(document.querySelector('.ant-drawer .ant-table-tbody')).toBeTruthy());
    await new Promise(r => setTimeout(r, 100));
};

/** 在第一行「主机厂」单元格输入并回车，再点保存 */
const enterManufacturerAndSave = async (value: string) => {
    const combos = document.querySelectorAll('.ant-drawer .ant-table-tbody [role="combobox"]');
    const cell = combos[0] as HTMLInputElement;
    fireEvent.change(cell, { target: { value } });
    fireEvent.keyDown(cell, { key: 'Enter' });
    await new Promise(r => setTimeout(r, 50));

    const saveBtn = Array.from(document.querySelectorAll('.ant-drawer button'))
        .find(b => (b.textContent || '').includes('保存修正')) as HTMLButtonElement | undefined;
    expect(saveBtn?.disabled).toBe(false);
    fireEvent.click(saveBtn!);
    await waitFor(() => expect(files.get(`${LIB}/_facet_values.json`)).toBeTruthy());
};

const savedManufacturer = () =>
    JSON.parse(files.get(`${LIB}/_facet_values.json`)!).assetLevel['a.json']?.manufacturer;

const vocabManufacturers = () =>
    JSON.parse(files.get(`${LIB}/_facet_vocab.json`)!).manufacturer as { name: string }[];

describe('批量补录受控属性：词表归一与就地收词', () => {
    beforeEach(() => {
        seed();
        vi.clearAllMocks();
        memLocalStorage.clear();
        useVehicleStore.setState({ assetLibraryPath: LIB, assetVersion: 0, assetTagGroupsVersion: 0 });
    });

    afterEach(() => { cleanup(); });

    it('输入词表别名时落盘的是规范名，不是原文', async () => {
        await openBatchEditor();
        await enterManufacturerAndSave('上汽大通');
        expect(savedManufacturer()).toBe('上汽大通汽车有限公司');
    });

    it('输入词表外新值时就地收词', async () => {
        await openBatchEditor();
        await enterManufacturerAndSave('新主机厂XYZ');
        expect(savedManufacturer()).toBe('新主机厂XYZ');
        expect(vocabManufacturers().some(e => e.name === '新主机厂XYZ')).toBe(true);
    });
});
