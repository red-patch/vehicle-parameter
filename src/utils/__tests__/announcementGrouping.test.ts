import { describe, expect, it } from 'vitest';
import {
    UNSORTED_GROUP_KEY,
    buildAnnouncementTree,
    collectExpandableKeys,
    collectGroupAnnounceNos,
    filterArchiveInfos,
    groupKeyOf,
    normalizeVehicleSeriesName,
    type JoinedAsset,
} from '../announcementGrouping';
import type { AnnouncementInfo } from '../announcementRecord';

/**
 * fixture 直接取自真实库（车型数据库/公告PDF，2026-10-02 扫描的 22 条记录），
 * 字段分布见设计文档 §1 表格。
 */
let seq = 0;
const info = (
    vehicleName: string | null,
    announceNo: string,
    batch: string | null,
    over: Partial<AnnouncementInfo> = {},
): AnnouncementInfo => ({
    jsonFile: `rec-${seq++}.json`,
    announceNo,
    batch,
    vehicleName,
    importedAt: '2026-10-01T10:00:00Z',
    sourceUrl: null,
    hasPdf: false,
    pdfFile: null,
    paramCount: 40,
    orphan: false,
    ...over,
});

/** 真实库 22 条（顺序无关） */
const REAL_LIBRARY: AnnouncementInfo[] = [
    info(null, 'DNC5031XXYBEVGS3', '407'),
    info(null, 'DNC5037XXYBEVP1', null),
    info('龙耀8S', 'XMQ5035XXYBEVL04', '399'),
    info('E80', 'XML5048XXYEV10', '397'),
    info('F1E', 'GGH20250918002', '减免购置税目录批次（第65批）'),
    info('GLE850', 'XML5036XXYEVS0', '381'),
    info('GLE850（邮政）XML5036XYZEVS0', 'XML5036XYZEVS0', '385'),
    info('H8E', 'JGL5047XXYBEVGR8', '403'),
    info('H9E', 'JGL5047XXYBEVGR10', '401'),
    info('I9', 'BJ5030XXYEVZ1', '402'),
    info('大拿V1', 'SH5033XXYU6BEV-Z50', '402'),
    info('大拿V1', 'SH5041XXYU6BEV-J51', '399'),
    info('大拿V1', 'SH5041XXYU6BEV-J51', '399'),
    info('大拿V1', 'SH6520U1BEV-J64', '403'),
    info('V6E', 'DNC5037XXYBEVP1', '398'),
    info('V6E', 'DNC5037XXYBEVP1', '404'),
    info('V6E', 'JHC6480BEV22', '396'),
    info('V6E', 'JHC6480BEV22', '406'),
    info('远程V8E', 'DNC5037XXYBEVGR5', null),
    info('远程V8E', 'DNC5037XXYBEVGR5', '402'),
    info('远程V8E', 'DNC5037XXYBEVGR5', '408'),
    info('V8E', 'DNC5037XXYBEVGS1', '403'),
];

describe('normalizeVehicleSeriesName', () => {
    it('R1 压空白', () => {
        expect(normalizeVehicleSeriesName('  大拿   V1 ')).toBe('大拿 V1');
        expect(normalizeVehicleSeriesName('大拿V1', null)).toBe('大拿V1');
    });

    it('R2 剥粘连公告号（GLE850（邮政）XML5036XYZEVS0 脏数据）', () => {
        expect(normalizeVehicleSeriesName('GLE850（邮政）XML5036XYZEVS0', 'XML5036XYZEVS0')).toBe('GLE850');
        expect(normalizeVehicleSeriesName('V6E_DNC5037XXYBEVP1', 'DNC5037XXYBEVP1')).toBe('V6E');
    });

    it('R3 剥品牌词前缀且可叠多层（V8E ≡ 远程V8E）', () => {
        expect(normalizeVehicleSeriesName('远程V8E')).toBe('V8E');
        expect(normalizeVehicleSeriesName('V8E')).toBe('V8E');
        expect(normalizeVehicleSeriesName('吉利远程V6E')).toBe('V6E');
        // 剥完不能剩空：车型名恰好只是品牌词时保留
        expect(normalizeVehicleSeriesName('远程')).toBe('远程');
    });

    it('R4 剥尾部括号段（GLE850（邮政） ≡ GLE850）', () => {
        expect(normalizeVehicleSeriesName('GLE850（邮政）')).toBe('GLE850');
        expect(normalizeVehicleSeriesName('GLE850(邮政)')).toBe('GLE850');
        expect(normalizeVehicleSeriesName('E80')).toBe('E80');
    });

    it('空车型名返回空串（进未归类桶）', () => {
        expect(normalizeVehicleSeriesName(null)).toBe('');
        expect(normalizeVehicleSeriesName('   ')).toBe('');
        expect(normalizeVehicleSeriesName(undefined, 'DNC1')).toBe('');
    });
});

describe('groupKeyOf / buildAnnouncementTree（真实 22 条）', () => {
    const noAssets = new Map<string, JoinedAsset[]>();
    const tree = buildAnnouncementTree(REAL_LIBRARY, noAssets);

    it('未归类桶置顶且只收孤儿/无车型名记录（2 条）', () => {
        expect(tree[0].key).toBe(UNSORTED_GROUP_KEY);
        expect(tree[0].unsorted).toBe(true);
        expect(tree[0].records).toHaveLength(2);
        // 桶内不设公告号层
        expect(tree[0].announces).toHaveLength(0);
    });

    it('近名合并：V8E 并入远程V8E 组，显示名取票数最多的写法', () => {
        const v8e = tree.find(g => g.displayName === '远程V8E');
        expect(v8e).toBeDefined();
        expect(v8e!.records).toHaveLength(4);
        expect(v8e!.records.map(r => r.vehicleName)).toContain('V8E');
        expect(tree.filter(g => g.displayName === 'V8E')).toHaveLength(0);
    });

    it('粘连公告号的（邮政）记录并入 GLE850 组', () => {
        const gle = tree.find(g => g.displayName === 'GLE850');
        expect(gle).toBeDefined();
        expect(gle!.records).toHaveLength(2);
        expect(gle!.announces).toHaveLength(2); // XML5036XXYEVS0 / XML5036XYZEVS0 是两个公告号
    });

    it('版本链：DNC5037XXYBEVP1 链头 404、历史 398（V6E 组内）', () => {
        const v6e = tree.find(g => g.displayName === 'V6E');
        const node = v6e!.announces.find(n => n.announceNo === 'DNC5037XXYBEVP1');
        expect(node).toBeDefined();
        expect(node!.head.batch).toBe('404');
        expect(node!.history.map(b => b.batch)).toEqual(['398']);
        // 组内公告号按链头批次倒序：JHC6480BEV22(406) 在前
        expect(v6e!.announces[0].announceNo).toBe('JHC6480BEV22');
    });

    it('大拿V1 三个公告号 + 重复对(2)保留在链头旁的历史里', () => {
        const dna = tree.find(g => g.displayName === '大拿V1');
        expect(dna!.announces).toHaveLength(3);
        const j51 = dna!.announces.find(n => n.announceNo === 'SH5041XXYU6BEV-J51');
        expect(j51!.head.batch).toBe('399');
        expect(j51!.history).toHaveLength(1); // 重复对不丢弃
    });

    it('非标批次（减免目录）不参与数字排序误判，单条记录自成链头', () => {
        const f1e = tree.find(g => g.displayName === 'F1E');
        expect(f1e!.announces[0].head.batch).toBe('减免购置税目录批次（第65批）');
        expect(f1e!.announces[0].history).toHaveLength(0);
    });

    it('组间按显示名 zh 排序、未归类恒第一', () => {
        const names = tree.map(g => g.displayName);
        expect(names[0]).toBe('未归类');
        const rest = names.slice(1);
        expect([...rest]).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'zh')));
        expect(tree).toHaveLength(11); // 未归类 + 10 组
    });

    it('组级关联资产数跨公告号去重', () => {
        const assets = new Map<string, JoinedAsset[]>([
            ['DNC5037XXYBEVP1', [{ fileName: 'a.json', productName: 'V6E' }]],
            ['JHC6480BEV22', [{ fileName: 'a.json', productName: 'V6E' }, { fileName: 'b.json', productName: 'V6E 货运' }]],
        ]);
        const tree2 = buildAnnouncementTree(
            REAL_LIBRARY.filter(r => r.vehicleName === 'V6E'),
            assets,
        );
        expect(tree2[0].linkedAssetCount).toBe(2); // a.json 只算一次
    });
});

describe('collectGroupAnnounceNos / collectExpandableKeys', () => {
    it('组内公告号归一化去重（含未归类桶记录的公告号）', () => {
        const noAssets = new Map<string, JoinedAsset[]>();
        const tree = buildAnnouncementTree(REAL_LIBRARY, noAssets);
        const v6e = tree.find(g => g.displayName === 'V6E')!;
        expect(collectGroupAnnounceNos(v6e)).toEqual(['DNC5037XXYBEVP1', 'JHC6480BEV22']);
        const unsorted = tree[0];
        expect(collectGroupAnnounceNos(unsorted)).toEqual(['DNC5031XXYBEVGS3', 'DNC5037XXYBEVP1']);
    });

    it('可展开键 = 组行 + 公告号行 + 有历史时的折叠行', () => {
        const noAssets = new Map<string, JoinedAsset[]>();
        const tree = buildAnnouncementTree(REAL_LIBRARY, noAssets);
        const keys = collectExpandableKeys(tree);
        expect(keys.filter(k => k.startsWith('g:'))).toHaveLength(11);
        // V6E 的 DNC5037XXYBEVP1 有历史 → 折叠行存在
        expect(keys.filter(k => k === 'h:V6E:dnc5037xxyybevp1'.toLowerCase() || k.startsWith('h:V6E')).length)
            .toBeGreaterThan(0);
    });
});

describe('filterArchiveInfos（chips + 搜索 AND）', () => {
    const noAssets = new Map<string, JoinedAsset[]>();
    const withPdf = REAL_LIBRARY.map((r, i) => (i % 3 === 0 ? { ...r, hasPdf: true } : r));

    it('chips: 未归类只留孤儿/无车型名', () => {
        const out = filterArchiveInfos(REAL_LIBRARY, 'unsorted', '', noAssets);
        expect(out).toHaveLength(2);
        expect(out.every(r => groupKeyOf(r) === UNSORTED_GROUP_KEY)).toBe(true);
    });

    it('chips: 有/无 PDF 与搜索叠加', () => {
        expect(filterArchiveInfos(withPdf, 'pdf', '', noAssets).every(r => r.hasPdf)).toBe(true);
        expect(filterArchiveInfos(withPdf, 'nopdf', '', noAssets).every(r => !r.hasPdf)).toBe(true);
        const both = filterArchiveInfos(withPdf, 'pdf', '403', noAssets);
        expect(both.every(r => r.hasPdf && (r.batch ?? '').includes('403'))).toBe(true);
    });

    it('chips: 有关联资产按公告号命中', () => {
        const assets = new Map<string, JoinedAsset[]>([
            ['JHC6480BEV22', [{ fileName: 'a.json', productName: 'V6E' }]],
        ]);
        const out = filterArchiveInfos(REAL_LIBRARY, 'linked', '', assets);
        expect(out).toHaveLength(2);
        expect(out.every(r => r.announceNo === 'JHC6480BEV22')).toBe(true);
    });

    it('搜索匹配车型名/公告号/批次（大小写不敏感）', () => {
        expect(filterArchiveInfos(REAL_LIBRARY, 'all', '403', noAssets).map(r => r.vehicleName))
            .toEqual(['H8E', '大拿V1', 'V8E']);
        expect(filterArchiveInfos(REAL_LIBRARY, 'all', 'jhc6480', noAssets)).toHaveLength(2);
        expect(filterArchiveInfos(REAL_LIBRARY, 'all', '龙耀', noAssets)).toHaveLength(1);
        expect(filterArchiveInfos(REAL_LIBRARY, 'all', '不存在的词', noAssets)).toHaveLength(0);
    });
});
