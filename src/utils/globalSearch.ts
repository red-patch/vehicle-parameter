import type { AssetFileInfo } from './assetManager';
import type { AnnouncementInfo } from './announcementRecord';
import type { RegulationRecord } from './regulationTypes';
import { normalizeAnnounceNo } from './announcementRecord';

/**
 * 全局搜索纯函数层（设计文档 docs/plans/2026-10-15-全局搜索面板-design.md §3.3）。
 *
 * 职责：把三域领域数据压成统一的「检索条目」，再按关键字做打分过滤。
 * UI（GlobalSearchModal）只消费 searchAllDomains 的结果，不做匹配逻辑——
 * 便于直测（体例同 assetFacets）。
 *
 * 非目标：拼音、参数行全文、模糊容错（设计 §2）。
 */

// ==================== 数据模型 ====================

/** 检索条目：三域归一后的最小可搜单元 */
export interface SearchItem {
    /** 域内唯一 id（资产=文件名，公告=json 文件名，法规=标准号@年份） */
    id: string;
    /** 主显示文本（结果行第一行） */
    primary: string;
    /** 次要文本（结果行第二行，可空串） */
    secondary: string;
    /** 参与检索的全部文本（含 primary/secondary，已小写化） */
    keywords: string[];
}

export type AssetSearchItem = SearchItem;
export type AnnouncementSearchItem = SearchItem;
export type RegulationSearchItem = SearchItem;

export interface GlobalSearchIndex {
    assets: AssetSearchItem[];
    announcements: AnnouncementSearchItem[];
    regulations: RegulationSearchItem[];
}

/** 单域搜索结果：hits = 命中条目（带分），total = 该域命中总数（面板外「查看全部」用） */
export interface DomainSearchResult<T extends SearchItem = SearchItem> {
    items: Array<T & { score: number }>;
    /** 本域命中总数（未截断前的 count；items 已按 score 降序） */
    total: number;
}

export interface GlobalSearchResults {
    assets: DomainSearchResult;
    announcements: DomainSearchResult;
    regulations: DomainSearchResult;
}

// ==================== 打分 ====================

/** 精确命中：归一化（去空白）后与 primary 或身份类 keyword 相等 */
export const SCORE_EXACT = 100;
/** 前缀命中：primary 以关键字开头 */
export const SCORE_PREFIX = 60;
/** 包含命中：任一检索文本包含关键字 */
export const SCORE_INCLUDES = 30;

const compact = (raw: string): string => raw.replace(/\s+/g, '').toLowerCase();

/**
 * 单条目打分：多路命中取最高分。
 * 精确口径对 primary 与「身份类 keyword」（公告号/标准号）生效——
 * 归一化只做去空白 + 小写（与 normalizeAnnounceNo 的去空白大写同方向）。
 */
const scoreItem = (item: SearchItem, qCompact: string, q: string): number => {
    // 精确：primary 归一化相等
    if (compact(item.primary) === qCompact) return SCORE_EXACT;
    // 精确：身份类 keyword（约定：列表第 0 位是身份键，如公告号/标准号/文件名）——assets 无身份键时用 primary 已覆盖
    const identity = item.keywords[0];
    if (identity && compact(identity) === qCompact) return SCORE_EXACT;
    // 前缀
    if (item.primary.toLowerCase().startsWith(q)) return SCORE_PREFIX;
    // 包含：primary 与任一检索文本（含 secondary 由 builder 决定，这里只兜底 primary）
    if (item.primary.toLowerCase().includes(q) || item.keywords.some(k => k.includes(q))) return SCORE_INCLUDES;
    return 0;
};

// ==================== 索引构造 ====================

/** 资产 → 检索条目（检索面与资产池六路搜索同口径，见 AssetPoolLayout filteredInfos） */
export const assetToSearchItem = (
    info: AssetFileInfo,
    displayName: string,
    tags: string[],
    manufacturer: string | null,
): AssetSearchItem => {
    const announceNos = (info.announceNos || []).map(n => normalizeAnnounceNo(n));
    const keywords = [
        info.fileName,
        displayName,
        info.productName,
        ...announceNos,
        ...tags,
    ];
    if (manufacturer) keywords.push(manufacturer);
    return {
        id: info.fileName,
        primary: displayName || info.fileName,
        secondary: info.productName || info.fileName,
        keywords: keywords.map(k => k.toLowerCase()),
    };
};

/** 公告 → 检索条目（检索面：公告号 / 车型名 / 批次；归档在册才可搜，孤儿不进） */
export const announcementToSearchItem = (info: AnnouncementInfo): AnnouncementSearchItem => {
    const secondaryParts = [info.vehicleName ?? '', info.batch ?? ''].filter(Boolean);
    return {
        id: info.jsonFile,
        primary: info.announceNo,
        secondary: secondaryParts.join(' · '),
        keywords: [
            info.announceNo,
            info.vehicleName ?? '',
            info.batch ?? '',
            ...secondaryParts,
        ].filter(Boolean).map(k => k.toLowerCase()),
    };
};

/** 法规 → 检索条目（检索面：标准号 / 名称 / 主题域，与 filterRecords 同口径） */
export const regulationToSearchItem = (rec: RegulationRecord): RegulationSearchItem => ({
    id: `${rec.standardNo}@${rec.year ?? ''}`,
    primary: rec.standardNo + (rec.year ? `（${rec.year}）` : ''),
    secondary: rec.title,
    keywords: [rec.standardNo, rec.title, ...(rec.domains ?? []), rec.note ?? '']
        .filter(Boolean)
        .map(k => k.toLowerCase()),
});

export const buildGlobalSearchIndex = (input: {
    assets: AssetSearchItem[];
    announcements: AnnouncementSearchItem[];
    regulations: RegulationSearchItem[];
}): GlobalSearchIndex => ({ ...input });

// ==================== 搜索 ====================

const emptyResult = (): DomainSearchResult => ({ items: [], total: 0 });

/** 单域过滤 + 打分 + 降序（items 不截断，截断由 UI 决定） */
const searchDomain = <T extends SearchItem>(items: T[], q: string): DomainSearchResult<T> => {
    if (!q) return { items: [], total: items.length };
    const qCompact = compact(q);
    const hits = items
        .map(item => ({ item, score: scoreItem(item, qCompact, q) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score);
    return { items: hits.map(({ item, score }) => ({ ...item, score })), total: hits.length };
};

/** 三域统一搜索入口 */
export const searchAllDomains = (index: GlobalSearchIndex, query: string): GlobalSearchResults => {
    const q = query.trim().toLowerCase();
    if (!q) {
        return {
            assets: { items: [], total: index.assets.length },
            announcements: { items: [], total: index.announcements.length },
            regulations: { items: [], total: index.regulations.length },
        };
    }
    return {
        assets: searchDomain(index.assets, q) || emptyResult(),
        announcements: searchDomain(index.announcements, q) || emptyResult(),
        regulations: searchDomain(index.regulations, q) || emptyResult(),
    };
};
