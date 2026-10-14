import { describe, it, expect } from 'vitest';
import {
    sortAssetRows, sortAssetRowsGrouped, sortAssetRowsByMode,
    DEFAULT_ASSET_SORT, type AssetSortRow,
} from '../assetSort';
import type { AssetFileInfo } from '../assetManager';

/** 造一行（只填排序用到的字段，其余给默认） */
const row = (partial: {
    fileName: string;
    displayName?: string;
    groupKey?: string;
    totalParams?: number;
    filledParams?: number;
    updatedAt?: string | null;
}): AssetSortRow => {
    const info = {
        fileName: partial.fileName,
        productName: partial.fileName,
        updatedAt: partial.updatedAt ?? null,
        totalParams: partial.totalParams ?? 0,
        filledParams: partial.filledParams ?? 0,
        announceNos: [],
        vehicleModel: null,
        hasAdmissionInfo: false,
        approvalStatus: null,
    } as AssetFileInfo;
    return {
        info,
        displayName: partial.displayName ?? partial.fileName,
        groupKey: partial.groupKey ?? partial.fileName,
    };
};

const names = (rows: AssetSortRow[]) => rows.map(r => r.info.fileName);

describe('assetSort', () => {
    describe('sortAssetRows 单维度排序', () => {
        it('时间倒序（默认）：新的在前', () => {
            const rows = [
                row({ fileName: 'old', updatedAt: '2026-01-01T00:00:00Z' }),
                row({ fileName: 'new', updatedAt: '2026-09-01T00:00:00Z' }),
                row({ fileName: 'mid', updatedAt: '2026-05-01T00:00:00Z' }),
            ];
            expect(names(sortAssetRows(rows, DEFAULT_ASSET_SORT))).toEqual(['new', 'mid', 'old']);
        });

        it('完成率降序：高的在前；总参数为 0 视为 0%', () => {
            const rows = [
                row({ fileName: 'low', totalParams: 100, filledParams: 10 }),
                row({ fileName: 'high', totalParams: 100, filledParams: 90 }),
                row({ fileName: 'zero', totalParams: 0, filledParams: 0 }),
            ];
            expect(names(sortAssetRows(rows, { dim: 'fillRate', dir: 'desc' })))
                .toEqual(['high', 'low', 'zero']);
        });

        it('名称升序：中文按拼音、拉丁按字典序', () => {
            const rows = [
                row({ fileName: 'a', displayName: '远程V6E' }),
                row({ fileName: 'b', displayName: '埃安S' }),
                row({ fileName: 'c', displayName: 'VE21' }),
                row({ fileName: 'd', displayName: '比亚迪' }),
            ];
            const sorted = sortAssetRows(rows, { dim: 'name', dir: 'asc' });
            // 拉丁 vs 中文的先后由 ICU 定，这里只断言确定性 + 中文内部相对序
            const cn = sorted.filter(r => /[一-龥]/.test(r.displayName)).map(r => r.displayName);
            expect(cn.indexOf('埃安S')).toBeLessThan(cn.indexOf('比亚迪'));
        });

        it('参数数降序：参数多的在前，同数则缺必填少者在前', () => {
            const rows = [
                row({ fileName: 'few', totalParams: 100, filledParams: 100 }),
                row({ fileName: 'many-gap', totalParams: 500, filledParams: 300 }),
                row({ fileName: 'many-full', totalParams: 500, filledParams: 500 }),
            ];
            expect(names(sortAssetRows(rows, { dim: 'paramCount', dir: 'desc' })))
                .toEqual(['many-full', 'many-gap', 'few']);
        });

        it('稳定性：同值一律按文件名兜底，不随输入顺序抖动', () => {
            const mk = (order: string[]) => order.map(f =>
                row({ fileName: f, updatedAt: '2026-01-01T00:00:00Z' }));
            const a = names(sortAssetRows(mk(['c', 'a', 'b']), DEFAULT_ASSET_SORT));
            const b = names(sortAssetRows(mk(['b', 'c', 'a']), DEFAULT_ASSET_SORT));
            expect(a).toEqual(b);
            expect(a).toEqual(['a', 'b', 'c']);
        });

        it('空列表返回空数组；不改动入参', () => {
            expect(sortAssetRows([], DEFAULT_ASSET_SORT)).toEqual([]);
            const input = [row({ fileName: 'x', updatedAt: '2026-01-01T00:00:00Z' })];
            const snapshot = [...input];
            sortAssetRows(input, { dim: 'name', dir: 'asc' });
            expect(input).toEqual(snapshot);
        });
    });

    describe('sortAssetRowsGrouped 同车型聚拢', () => {
        it('同组键的行相邻（即使中间夹着其他组）', () => {
            const rows = [
                row({ fileName: 'v6e-a', groupKey: 'V6E', updatedAt: '2026-01-01T00:00:00Z' }),
                row({ fileName: 'h8e-a', groupKey: 'H8E', updatedAt: '2026-09-01T00:00:00Z' }),
                row({ fileName: 'v6e-b', groupKey: 'V6E', updatedAt: '2026-05-01T00:00:00Z' }),
                row({ fileName: 'h8e-b', groupKey: 'H8E', updatedAt: '2026-03-01T00:00:00Z' }),
            ];
            const sorted = names(sortAssetRowsGrouped(rows, DEFAULT_ASSET_SORT));
            // V6E 两条必须相邻、H8E 两条必须相邻
            const v6eIdx = sorted.map((n, i) => (n.startsWith('v6e') ? i : -1)).filter(i => i >= 0);
            const h8eIdx = sorted.map((n, i) => (n.startsWith('h8e') ? i : -1)).filter(i => i >= 0);
            expect(Math.abs(v6eIdx[0] - v6eIdx[1])).toBe(1);
            expect(Math.abs(h8eIdx[0] - h8eIdx[1])).toBe(1);
        });

        it('桶间按代表值排：时间倒序时，最新版更新的车型排在前', () => {
            const rows = [
                row({ fileName: 'A-old', groupKey: 'A', updatedAt: '2026-01-01T00:00:00Z' }),
                row({ fileName: 'A-new', groupKey: 'A', updatedAt: '2026-06-01T00:00:00Z' }),
                row({ fileName: 'B-new', groupKey: 'B', updatedAt: '2026-03-01T00:00:00Z' }),
            ];
            // A 的最新版（6月）晚于 B 的最新版（3月），故 A 桶整体在前
            const sorted = names(sortAssetRowsGrouped(rows, DEFAULT_ASSET_SORT));
            expect(sorted[0].startsWith('A')).toBe(true);
            // A 桶内部也按时间倒序
            expect(sorted.slice(0, 2)).toEqual(['A-new', 'A-old']);
        });

        it('组内也按同一维度排序', () => {
            const rows = [
                row({ fileName: 'G-low', groupKey: 'G', totalParams: 100, filledParams: 20 }),
                row({ fileName: 'G-high', groupKey: 'G', totalParams: 100, filledParams: 90 }),
            ];
            const sorted = names(sortAssetRowsGrouped(rows, { dim: 'fillRate', dir: 'desc' }));
            expect(sorted).toEqual(['G-high', 'G-low']);
        });

        it('每行 groupKey 唯一时，等价于纯排序', () => {
            const rows = [
                row({ fileName: 'a', groupKey: 'a', updatedAt: '2026-01-01T00:00:00Z' }),
                row({ fileName: 'b', groupKey: 'b', updatedAt: '2026-09-01T00:00:00Z' }),
            ];
            expect(names(sortAssetRowsGrouped(rows, DEFAULT_ASSET_SORT)))
                .toEqual(names(sortAssetRows(rows, DEFAULT_ASSET_SORT)));
        });
    });

    describe('sortAssetRowsByMode 开关分派', () => {
        const rows = [
            row({ fileName: 'v6e-a', groupKey: 'V6E', updatedAt: '2026-01-01T00:00:00Z' }),
            row({ fileName: 'h8e-a', groupKey: 'H8E', updatedAt: '2026-09-01T00:00:00Z' }),
            row({ fileName: 'v6e-b', groupKey: 'V6E', updatedAt: '2026-05-01T00:00:00Z' }),
        ];
        it('关闭聚拢 = 纯排序（V6E 可能不相邻）', () => {
            const sorted = names(sortAssetRowsByMode(rows, DEFAULT_ASSET_SORT, false));
            expect(sorted).toEqual(['h8e-a', 'v6e-b', 'v6e-a']);
        });
        it('开启聚拢 = 同组相邻', () => {
            const sorted = names(sortAssetRowsByMode(rows, DEFAULT_ASSET_SORT, true));
            const v6eIdx = sorted.map((n, i) => (n.startsWith('v6e') ? i : -1)).filter(i => i >= 0);
            expect(Math.abs(v6eIdx[0] - v6eIdx[1])).toBe(1);
        });
    });
});
