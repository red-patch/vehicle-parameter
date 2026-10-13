import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 别名持久化回归（设计：docs/plans/2026-10-13-asset-alias-design.md §6.1）。
 * 核对：写入落在 _asset_meta.json 的 alias 字段、清除语义为「两态」、
 * 且与 status/groupName 等既有标注共存不互相覆盖。
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

import { loadAssetMeta, setAssetAlias, setAssetFileMeta } from '../assetManager';

const LIB = '/lib';
const META_PATH = '/lib/_asset_meta.json';
const readMeta = () => JSON.parse(files.get(META_PATH)!) as Record<string, Record<string, unknown>>;

describe('setAssetAlias 持久化', () => {
    beforeEach(() => files.clear());

    it('写入别名到 _asset_meta.json 的 alias 字段', async () => {
        await setAssetAlias(LIB, 'a.json', 'V8E');
        expect(readMeta()['a.json'].alias).toBe('V8E');
        expect(await loadAssetMeta(LIB)).toMatchObject({ 'a.json': { alias: 'V8E' } });
    });

    it('trim 后写入', async () => {
        await setAssetAlias(LIB, 'a.json', '  V8E  ');
        expect(readMeta()['a.json'].alias).toBe('V8E');
    });

    it('与已有 status/groupName 共存，不互相覆盖', async () => {
        await setAssetFileMeta(LIB, 'a.json', { status: 'superseded', groupName: '星享V6E' });
        await setAssetAlias(LIB, 'a.json', 'V6E');
        expect(readMeta()['a.json']).toEqual({ status: 'superseded', groupName: '星享V6E', alias: 'V6E' });
    });

    it('空串清除 alias，但保留其他标注', async () => {
        await setAssetFileMeta(LIB, 'a.json', { status: 'deprecated', alias: 'V8E' });
        await setAssetAlias(LIB, 'a.json', '');
        expect(readMeta()['a.json']).toEqual({ status: 'deprecated' });
    });

    it('null 清除 alias，但保留其他标注', async () => {
        await setAssetFileMeta(LIB, 'a.json', { groupName: '组名', alias: 'V8E' });
        await setAssetAlias(LIB, 'a.json', null);
        expect(readMeta()['a.json']).toEqual({ groupName: '组名' });
    });

    it('仅别名一条标注时清空，整条从 meta 删除（不留空对象）', async () => {
        await setAssetAlias(LIB, 'a.json', 'V8E');
        await setAssetAlias(LIB, 'a.json', '');
        expect(readMeta()['a.json']).toBeUndefined();
    });

    it('清除不存在的条目是 no-op，不创建 meta 文件', async () => {
        await setAssetAlias(LIB, 'missing.json', '');
        expect(files.has(META_PATH)).toBe(false);
    });

    it('覆盖已有别名', async () => {
        await setAssetAlias(LIB, 'a.json', '旧名');
        await setAssetAlias(LIB, 'a.json', '新名');
        expect(readMeta()['a.json'].alias).toBe('新名');
    });
});
