import { batchSeq, normalizeAnnounceNo, type AnnouncementInfo } from './announcementRecord';

/**
 * 公告归档分组（设计文档 docs/plans/2026-10-02-announcement-archive-grouped-view-design.md §3）。
 *
 * 车型 → 公告号 → 批次 三层树，纯视图层聚合（存储/扫描零改动）：
 * - 车型名归一化组键：R1 压空白 → R2 剥粘连公告号 → R3 剥品牌词前缀 → R4 剥尾部括号段；
 *   词表不全顶多没合并、不会拆错。
 * - 同公告号多批次 = 版本链：批次号最大为链头，其余为历史；链头只是展示焦点，不改数据语义。
 * - vehicleName 空/孤儿 → 未归类桶（不设公告号层，直接平铺记录）。
 */

/** 未归类桶组键（vehicleName 空/孤儿专用），勿改为其它值——chips 筛选依赖它 */
export const UNSORTED_GROUP_KEY = '__unsorted__';

/** 未归类桶显示名 */
export const UNSORTED_GROUP_LABEL = '未归类';

/** 品牌词表（R3 车型名前缀剥除）。按库内数据扩充；初始词表来自真实库（远程牌）。 */
export const BRAND_WORDS: readonly string[] = ['远程', '解放', '吉利'];

/**
 * 车型系列名归一化（组键）。返回空串 = 无有效车型名（进未归类桶）。
 * R2 治「GLE850（邮政）XML5036XYZEVS0」这类车型名粘连公告号的脏数据；
 * R4 剥尾括号治「GLE850（邮政）」≡「GLE850」。
 */
export const normalizeVehicleSeriesName = (
    vehicleName: string | null | undefined,
    announceNo?: string | null,
): string => {
    let name = String(vehicleName ?? '').replace(/\s+/g, ' ').trim();
    const no = String(announceNo ?? '').trim();
    if (name && no && name.includes(no)) {
        name = name.split(no).join(' ')
            .replace(/^[\s_\-·]+|[\s_\-·]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    let stripped = true;
    while (stripped && name) {
        stripped = false;
        for (const word of BRAND_WORDS) {
            if (name.startsWith(word) && name.length > word.length) {
                name = name.slice(word.length).trim();
                stripped = true;
            }
        }
    }
    return name.replace(/[（(][^（()）]*[)）]\s*$/, '').trim();
};

/** 公告号节点内的批次记录：链头（批次号最大）+ 历史（新→旧） */
export interface AnnounceNode {
    announceNo: string;
    head: AnnouncementInfo;
    /** 其余批次，新→旧 */
    history: AnnouncementInfo[];
}

/** 车型分组（含未归类桶；桶内 announces 为空、records 直接平铺） */
export interface VehicleGroup {
    key: string;
    displayName: string;
    unsorted: boolean;
    /** 组内全部记录 */
    records: AnnouncementInfo[];
    announces: AnnounceNode[];
    /** 组内关联资产数（跨公告号去重） */
    linkedAssetCount: number;
}

/** 关联资产条目（公告面板视图层的最小投影） */
export interface JoinedAsset {
    fileName: string;
    productName: string;
}

/** 记录归属组键：孤儿或无有效车型名 → 未归类 */
export const groupKeyOf = (info: AnnouncementInfo): string => {
    if (info.orphan || !normalizeVehicleSeriesName(info.vehicleName, info.announceNo)) {
        return UNSORTED_GROUP_KEY;
    }
    return normalizeVehicleSeriesName(info.vehicleName, info.announceNo);
};

/** 组显示名：组内原样车型名票数最多者（平票取更短者——脏写法往往更长，如粘连公告号的那种）；未归类桶恒为「未归类」 */
const pickDisplayName = (records: AnnouncementInfo[]): string => {
    const votes = new Map<string, number>();
    for (const r of records) {
        const name = String(r.vehicleName ?? '').trim();
        if (!name) continue;
        votes.set(name, (votes.get(name) ?? 0) + 1);
    }
    let best = '';
    let bestCount = -1;
    for (const [name, count] of votes) {
        if (count > bestCount || (count === bestCount && name.length < best.length)) {
            best = name;
            bestCount = count;
        }
    }
    return best;
};

/**
 * 构建分组树（纯函数）。
 * @param infos 记录（已过搜索/chips 筛选亦可，本函数不做筛选）
 * @param linkedAssets 公告号（归一化）→ 关联资产列表
 */
export const buildAnnouncementTree = (
    infos: AnnouncementInfo[],
    linkedAssets: Map<string, JoinedAsset[]>,
): VehicleGroup[] => {
    const buckets = new Map<string, AnnouncementInfo[]>();
    for (const info of infos) {
        const key = groupKeyOf(info);
        const list = buckets.get(key);
        if (list) list.push(info);
        else buckets.set(key, [info]);
    }

    const groups: VehicleGroup[] = [];
    for (const [key, records] of buckets) {
        const unsorted = key === UNSORTED_GROUP_KEY;

        // 关联资产跨公告号去重
        const assetNames = new Set<string>();
        for (const r of records) {
            for (const a of linkedAssets.get(normalizeAnnounceNo(r.announceNo)) ?? []) {
                assetNames.add(a.fileName);
            }
        }

        const byNo = new Map<string, AnnouncementInfo[]>();
        for (const r of records) {
            const no = normalizeAnnounceNo(r.announceNo);
            if (!no || unsorted) continue; // 未归类桶不设公告号层
            const list = byNo.get(no);
            if (list) list.push(r);
            else byNo.set(no, [r]);
        }
        const announces: AnnounceNode[] = [...byNo.entries()].map(([, batchRecords]) => {
            const sorted = [...batchRecords].sort((a, b) => batchSeq(b.batch) - batchSeq(a.batch));
            return { announceNo: sorted[0].announceNo, head: sorted[0], history: sorted.slice(1) };
        });
        // 公告号按链头批次号新→旧
        announces.sort((a, b) => batchSeq(b.head.batch) - batchSeq(a.head.batch));

        groups.push({
            key,
            displayName: unsorted ? UNSORTED_GROUP_LABEL : (pickDisplayName(records) || UNSORTED_GROUP_LABEL),
            unsorted,
            records,
            announces,
            linkedAssetCount: assetNames.size,
        });
    }

    // 未归类桶恒置顶，其余按显示名排序
    return groups.sort((a, b) => {
        if (a.unsorted !== b.unsorted) return a.unsorted ? -1 : 1;
        return a.displayName.localeCompare(b.displayName, 'zh');
    });
};

// ==================== 筛选（chips + 搜索叠加，AND） ====================

export type ArchiveChip = 'all' | 'pdf' | 'nopdf' | 'unsorted' | 'linked';

export const ARCHIVE_CHIPS: { key: ArchiveChip; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'pdf', label: '有 PDF' },
    { key: 'nopdf', label: '无 PDF' },
    { key: 'unsorted', label: '未归类' },
    { key: 'linked', label: '有关联资产' },
];

export const matchArchiveChip = (
    info: AnnouncementInfo,
    chip: ArchiveChip,
    linkedAssets: Map<string, JoinedAsset[]>,
): boolean => {
    switch (chip) {
        case 'pdf':
            return info.hasPdf;
        case 'nopdf':
            return !info.hasPdf;
        case 'unsorted':
            return groupKeyOf(info) === UNSORTED_GROUP_KEY;
        case 'linked':
            return (linkedAssets.get(normalizeAnnounceNo(info.announceNo))?.length ?? 0) > 0;
        default:
            return true;
    }
};

/** 记录级筛选：chips 与搜索叠加（AND）；搜索匹配 车型名/公告号/批次 子串（大小写不敏感） */
export const filterArchiveInfos = (
    infos: AnnouncementInfo[],
    chip: ArchiveChip,
    search: string,
    linkedAssets: Map<string, JoinedAsset[]>,
): AnnouncementInfo[] => {
    const q = search.trim().toLowerCase();
    return infos.filter(i => {
        if (!matchArchiveChip(i, chip, linkedAssets)) return false;
        if (!q) return true;
        return [i.vehicleName, i.announceNo, i.batch].some(v => v && v.toLowerCase().includes(q));
    });
};

// ==================== 树形表格行键 ====================

export const groupRowKey = (g: VehicleGroup): string => `g:${g.key}`;
export const announceRowKey = (g: VehicleGroup, node: AnnounceNode): string =>
    `a:${g.key}:${normalizeAnnounceNo(node.announceNo)}`;
export const historyRowKey = (g: VehicleGroup, node: AnnounceNode): string =>
    `h:${g.key}:${normalizeAnnounceNo(node.announceNo)}`;

/** 全部可展开父行的键（组行 + 公告号行 + 历史折叠行）——搜索命中时全展开用 */
export const collectExpandableKeys = (groups: VehicleGroup[]): string[] => {
    const keys: string[] = [];
    for (const g of groups) {
        keys.push(groupRowKey(g));
        for (const node of g.announces) {
            keys.push(announceRowKey(g, node));
            if (node.history.length > 0) keys.push(historyRowKey(g, node));
        }
    }
    return keys;
};

/** 组内全部公告号（归一化去重）——组级「查看全部关联资产」用 */
export const collectGroupAnnounceNos = (g: VehicleGroup): string[] => {
    const nos = new Set<string>();
    for (const r of g.records) {
        const no = normalizeAnnounceNo(r.announceNo);
        if (no) nos.add(no);
    }
    return [...nos];
};

/** 导入时间展示（ui 层共享的小格式化器） */
export const formatArchiveDate = (iso: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' as never });
};
