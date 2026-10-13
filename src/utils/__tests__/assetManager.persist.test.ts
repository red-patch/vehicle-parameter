import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 读-改-写保真回归（设计：docs/plans/2026-10-13-batch-field-maintenance-design.md §6.3）。
 * 覆盖曾存在的两个缺陷：saveAssetFile 每次重置 createdAt、loadAssetFile 丢弃文件级元数据。
 */

const files = new Map<string, string>();

vi.mock('@tauri-apps/plugin-fs', () => ({
    readTextFile: vi.fn(async (path: string) => {
        if (!files.has(path)) throw new Error(`ENOENT: ${path}`);
        return files.get(path)!;
    }),
    writeTextFile: vi.fn(async (path: string, content: string) => { files.set(path, content); }),
    exists: vi.fn(async (path: string) => files.has(path)),
    readDir: vi.fn(async () => []),
    remove: vi.fn(async (path: string) => { files.delete(path); }),
    rename: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/path', () => ({ join: vi.fn(async (...p: string[]) => p.join('/')) }));

import { loadAssetFile, saveAssetFile } from '../assetManager';

const LIB = '/lib';

describe('saveAssetFile createdAt 保真', () => {
    beforeEach(() => files.clear());

    it('传入 createdAt 时保留原创建时间，只更新 updatedAt', async () => {
        const OLD = '2024-01-01T00:00:00.000Z';
        await saveAssetFile(LIB, 'a.json', 'A', [], OLD);
        const written = JSON.parse(files.get('/lib/a.json')!);
        expect(written.createdAt).toBe(OLD);
        expect(written.updatedAt).not.toBe(OLD);
    });

    it('未传 createdAt 时按新建处理（现状不变）', async () => {
        await saveAssetFile(LIB, 'a.json', 'A', []);
        const written = JSON.parse(files.get('/lib/a.json')!);
        expect(Date.parse(written.createdAt)).not.toBeNaN();
        expect(written.createdAt).toBe(written.updatedAt);
    });
});

describe('loadAssetFile 文件级元数据回填', () => {
    beforeEach(() => files.clear());

    it('回填 productName 与 createdAt', async () => {
        await saveAssetFile(LIB, 'a.json', 'V6E 客运版', [], '2024-01-01T00:00:00.000Z');
        const sheet = await loadAssetFile(LIB, 'a.json');
        expect(sheet).not.toBeNull();
        expect(sheet!.productName).toBe('V6E 客运版');
        expect(sheet!.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });
});

describe('读-改-写round-trip 保真', () => {
    beforeEach(() => files.clear());

    it('改一个参数值后，productName 与 createdAt 不变、其他行原样保留', async () => {
        const OLD = '2023-06-06T06:06:06.000Z';
        await saveAssetFile(LIB, 'v6e.json', 'V6E', [
            { id: 'g::整备质量', group: 'g', name: '整备质量', value: '1980' },
            { id: 'g::轴距', group: 'g', name: '轴距', value: '3000' },
        ], OLD);

        const sheet = await loadAssetFile(LIB, 'v6e.json');
        const nextParams = sheet!.data.map(p => (p.name === '整备质量' ? { ...p, value: '1990' } : p));
        await saveAssetFile(LIB, 'v6e.json', sheet!.productName!, nextParams, sheet!.createdAt);

        const after = JSON.parse(files.get('/lib/v6e.json')!);
        expect(after.productName).toBe('V6E');
        expect(after.createdAt).toBe(OLD);
        expect(after.parameters).toHaveLength(2);
        expect(after.parameters.find((p: { name: string }) => p.name === '整备质量').value).toBe('1990');
        expect(after.parameters.find((p: { name: string }) => p.name === '轴距').value).toBe('3000');
    });
});
