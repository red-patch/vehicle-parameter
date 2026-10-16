import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * 批量字段维护（治理体检入口）写受控属性：词表归一 + 就地收词回归。
 *
 * 不变量：facet 目标经统一抽屉落盘时，词表维度必须走 addVocabValue
 * （设计 docs/plans/2026-10-13-batch-field-maintenance-design.md §6.2）：
 *   1. 输入词表别名（如「上汽大通」）落盘的是规范名「上汽大通汽车有限公司」，
 *      不是原文 → 否则侧栏/筛选里同一主机厂裂成规范名 + 裸别名两行；
 *   2. 词表外新值就地收进 _facet_vocab.json。
 * 该不变量原由 AssetBatchFacetEditor 承载；旧编辑器退役后，回归改用新抽屉驱动
 * （入口：治理体检 →「打开批量字段维护」）。
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

/** 打开治理体检 → 批量字段维护抽屉，选「主机厂」字段并填值，点保存 */
const openFieldEditor = async () => {
    render(<AssetPoolLayout />);
    await waitFor(() => expect(document.querySelector('[data-asset-file="a.json"]')).toBeTruthy());
    // 左栏已浮窗化且默认收起（设计 §3.1 修订：不常驻遮挡列表）——
    // 治理体检入口在浮窗内，须先展开。展开按钮是筛选条左缘的图标钮（Tooltip 文案见下）。
    fireEvent.click(await screen.findByLabelText('展开导航'));
    fireEvent.click(await screen.findByText('治理体检'));
    await waitFor(() => expect(screen.getByText(/打开批量字段维护/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/打开批量字段维护/));
    // 抽屉内锚定：字段选择器 + 预览表（.ant-table）已出现
    await waitFor(() => expect(document.querySelector('.ant-drawer .ant-table')).toBeTruthy());
    // 参数字段需按需读盘后才有行；facet 目标不依赖参数，但等一拍让状态稳定
    await new Promise(r => setTimeout(r, 100));
};

/** 选受控属性「主机厂」→ 填值 → 保存 */
const enterManufacturerAndSave = async (value: string) => {
    const drawer = document.querySelector('.ant-drawer') as HTMLElement;
    // 字段选择器是抽屉内第一个 .ant-select（facet 选项在「受控属性」分组）
    const fieldSelect = drawer.querySelector('.ant-select') as HTMLElement;
    fireEvent.mouseDown(within(fieldSelect).getByRole('combobox'));
    const opt = Array.from(document.querySelectorAll('.ant-select-item-option'))
        .find(o => o.textContent === '主机厂');
    expect(opt).toBeTruthy();
    fireEvent.click(opt!);

    // 值输入器是抽屉内第二个 .ant-select（AutoComplete），placeholder 渲染为 div
    const valueCombo = drawer.querySelectorAll('.ant-select')[1];
    const valueInput = valueCombo.querySelector('input') as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value } });
    await new Promise(r => setTimeout(r, 50));

    const saveBtn = Array.from(drawer.querySelectorAll('button'))
        .find(b => (b.textContent || '').includes('预览并保存')) as HTMLButtonElement | undefined;
    expect(saveBtn?.disabled).toBe(false);
    fireEvent.click(saveBtn!);
    await waitFor(() => expect(files.get(`${LIB}/_facet_values.json`)).toBeTruthy());
};

const savedManufacturer = () =>
    JSON.parse(files.get(`${LIB}/_facet_values.json`)!).assetLevel['a.json']?.manufacturer;

const vocabManufacturers = () =>
    JSON.parse(files.get(`${LIB}/_facet_vocab.json`)!).manufacturer as { name: string }[];

describe('批量字段维护写受控属性：词表归一与就地收词', () => {
    beforeEach(() => {
        seed();
        vi.clearAllMocks();
        memLocalStorage.clear();
        useVehicleStore.setState({ assetLibraryPath: LIB, assetVersion: 0, assetTagGroupsVersion: 0 });
    });

    afterEach(() => { cleanup(); });

    it('输入词表别名时落盘的是规范名，不是原文', async () => {
        await openFieldEditor();
        await enterManufacturerAndSave('上汽大通');
        expect(savedManufacturer()).toBe('上汽大通汽车有限公司');
    });

    it('输入词表外新值时就地收词', async () => {
        await openFieldEditor();
        await enterManufacturerAndSave('新主机厂XYZ');
        expect(savedManufacturer()).toBe('新主机厂XYZ');
        expect(vocabManufacturers().some(e => e.name === '新主机厂XYZ')).toBe(true);
    });
});
