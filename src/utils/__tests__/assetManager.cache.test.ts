import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
// join() 底层也走 invoke('plugin:path|join')，不 mock 会把 path IPC 计进 invoke 调用次数
vi.mock('@tauri-apps/api/path', () => ({ join: vi.fn(async (...p: string[]) => p.join('/')) }));
// scanAssetFiles 内部调用 reconcileSidecarEntries → plugin-fs（读/写旁路文件）
vi.mock('@tauri-apps/plugin-fs', () => ({
    readTextFile: vi.fn().mockRejectedValue(new Error('not tauri')),
    writeTextFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    readDir: vi.fn().mockResolvedValue([]),
    remove: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
}));

import {
    archiveAssetFile,
    deleteAssetFile,
    getAssetFilesWithInfo,
    invalidateAssetScanCache,
    renameAssetFile,
    saveAssetFile,
    saveAssetsBatch,
} from '../assetManager';
import type { AssetFileInfo } from '../assetManager';

// 非空夹具：缓存对空结果一律不缓存（瞬时故障与真空库不可区分），故需真实数据才能命中
const ONE_ASSET: AssetFileInfo[] = [{
    fileName: 'a.json',
    productName: 'A',
    updatedAt: null,
    totalParams: 0,
    filledParams: 0,
    announceNos: [],
    vehicleModel: null,
    hasAdmissionInfo: false,
    approvalStatus: null,
    manufacturerRaw: null,
    batteryBrandRaw: null,
    capacityRaw: null,
    admissionLevelRaw: null,
    admissionNos: [],
}];

describe('getAssetFilesWithInfo scan cache', () => {
    beforeEach(() => {
        invokeMock.mockReset();
        invokeMock.mockResolvedValue(ONE_ASSET);
        invalidateAssetScanCache();
        (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
    });

    it('serves the second call for the same library + version from cache', async () => {
        await getAssetFilesWithInfo('/lib');
        await getAssetFilesWithInfo('/lib');
        expect(invokeMock).toHaveBeenCalledTimes(1);
    });

    it('re-scans after invalidation (assetVersion bump)', async () => {
        await getAssetFilesWithInfo('/lib');
        invalidateAssetScanCache();
        await getAssetFilesWithInfo('/lib');
        expect(invokeMock).toHaveBeenCalledTimes(2);
    });

    it('re-scans when the library path changes', async () => {
        await getAssetFilesWithInfo('/lib-a');
        await getAssetFilesWithInfo('/lib-b');
        expect(invokeMock).toHaveBeenCalledTimes(2);
    });

    it('does not fossilise a transient failure as an empty library', async () => {
        // 第 1 次：Rust 抛错 + fs 不可用 → 回退扫描得到 []
        invokeMock.mockRejectedValueOnce(new Error('transient'));
        const first = await getAssetFilesWithInfo('/lib');
        expect(first).toEqual([]);
        // 第 2 次：故障恢复，应重新扫描并拿到真实数据（而不是缓存的空数组）
        invokeMock.mockResolvedValue(ONE_ASSET);
        const second = await getAssetFilesWithInfo('/lib');
        expect(second).toEqual(ONE_ASSET);
        expect(invokeMock).toHaveBeenCalledTimes(2);
    });

    it('shares a single scan across concurrent callers even when the result is empty', async () => {
        invokeMock.mockResolvedValue([]);
        const [a, b] = await Promise.all([getAssetFilesWithInfo('/lib'), getAssetFilesWithInfo('/lib')]);
        expect(a).toEqual([]);
        expect(b).toEqual([]);
        expect(invokeMock).toHaveBeenCalledTimes(1);
    });

    it('re-scans when force is true, even with a warm cache', async () => {
        // 「刷新资产库」按钮：应用外的文件增删改没有失效信号，必须能强制重扫
        await getAssetFilesWithInfo('/lib');
        await getAssetFilesWithInfo('/lib', true);
        expect(invokeMock).toHaveBeenCalledTimes(2);
    });

    it('does not force a re-scan for a truthy non-true force value', async () => {
        // 直传事件对象给 force 参数会得到 truthy——不应误触发强制重扫
        await getAssetFilesWithInfo('/lib');
        await getAssetFilesWithInfo('/lib', {} as unknown as boolean);
        expect(invokeMock).toHaveBeenCalledTimes(1);
    });
});

// 写操作必须使缓存失效：否则 UI 会长期展示过期资产列表。
// 这是本分支引入的最高风险行为，逐个锁住。
describe('write operations invalidate the scan cache', () => {
    const scanCount = () => invokeMock.mock.calls.filter(c => c[0] === 'scan_asset_library').length;

    beforeEach(async () => {
        vi.clearAllMocks();
        invokeMock.mockResolvedValue(ONE_ASSET);
        invalidateAssetScanCache();
        (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
        // 让写操作走「成功」路径（否则 exists→false 会 early-return，不触发失效——
        // 这正是「只在成功时失效」的设计，另有断言覆盖）
        const fs = await import('@tauri-apps/plugin-fs');
        (fs.exists as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (fs.readTextFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify({ productName: 'A', parameters: [] }));
        await getAssetFilesWithInfo('/lib'); // 预热缓存
    });

    it('saveAssetFile invalidates', async () => {
        const before = scanCount();
        await saveAssetFile('/lib', 'a.json', 'A', []).catch(() => {});
        await getAssetFilesWithInfo('/lib');
        expect(scanCount()).toBe(before + 1);
    });

    it('deleteAssetFile invalidates', async () => {
        const before = scanCount();
        await deleteAssetFile('/lib', 'a.json').catch(() => {});
        await getAssetFilesWithInfo('/lib');
        expect(scanCount()).toBe(before + 1);
    });

    it('renameAssetFile invalidates', async () => {
        const before = scanCount();
        await renameAssetFile('/lib', 'a.json', 'b.json').catch(() => {});
        await getAssetFilesWithInfo('/lib');
        expect(scanCount()).toBe(before + 1);
    });

    it('archiveAssetFile invalidates', async () => {
        const before = scanCount();
        await archiveAssetFile('/lib', 'a.json').catch(() => {});
        await getAssetFilesWithInfo('/lib');
        expect(scanCount()).toBe(before + 1);
    });

    it('saveAssetsBatch invalidates when at least one item succeeds', async () => {
        const before = scanCount();
        // Rust 快路径按 invoke 名分派：save_assets_batch 回每项 {ok}
        invokeMock.mockImplementation(async (cmd: string) =>
            cmd === 'save_assets_batch' ? [{ index: 0, fileName: 'x.json', ok: true }] : ONE_ASSET
        );
        await saveAssetsBatch('/lib', [{ baseName: 'x', productName: 'X', parameters: [] }]).catch(() => {});
        await getAssetFilesWithInfo('/lib');
        expect(scanCount()).toBe(before + 1);
    });
});
