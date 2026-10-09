/**
 * 法规标准库 —— 类型与纯函数（设计文档 docs/plans/2026-10-08-regulation-library-design.md）
 *
 * 与 src-tauri/src/regulations.rs 的 serde(camelCase) 结构同构。
 * **文件名解析不在这里**——那是 Rust 的单源职责（设计 §5.1 / Q18），
 * 本文件只做「消费 Rust 结果」的展示层逻辑：状态推导、站点 URL、筛选、版本链。
 */

// ==================== 数据模型 ====================

/** 法规记录。身份 = standardNo（含部分号），year 是版本（设计 §4.2 / Q5） */
export interface RegulationRecord {
    version: string;
    /** 身份键：规范化标准号（含部分号）—— "GB 44495"、"GB/T 18386.1" */
    standardNo: string;
    /** 版本：发布年份；无年份为 null */
    year: string | null;
    title: string;
    /** 受控属性①：标准层级（单值） */
    level: string;
    /** 受控属性②：主题域（多值） */
    domains: string[];
    publishedAt: string | null;
    effectiveAt: string | null;
    /** 现行 / 即将实施 / 已被替代 / 废止 / 草案（空串 = 未知） */
    status: string;
    /** true = 已被人工覆盖，不再随日期自动推导 */
    statusOverridden: boolean;
    /** 本记录替代的标准号 */
    replaces: string[];
    /** 相对法规库根的文件名；null = 无 PDF（合法状态，Q8） */
    fileName: string | null;
    fileSize: number | null;
    /** 引用失效：文件被移走/改名（扫描算出，不持久） */
    fileMissing: boolean;
    /** iCloud 未下载占位文件 */
    notDownloaded: boolean;
    /** has / none / unknown */
    textLayer: string;
    /** 知识卡相对文件名（P2 自动填充） */
    knowledgeCards: string[];
    unparsedReason?: string;
    note: string;
    updatedAt: string;
}

export interface RegulationVocab {
    levels: string[];
    domains: string[];
}

/** 权威查询站点模板（设计 §5.4 / Q26） */
export interface SiteTemplate {
    name: string;
    /** 适用层级（空 = 全部） */
    levels: string[];
    /** URL 模板，占位符 {no} / {compact} / {lower} */
    urlTemplate: string;
    /** 是否支持自动回填（仅国标 true） */
    supportsVerify: boolean;
}

export interface RegulationSidecar {
    version: string;
    rootPath: string;
    vocab: RegulationVocab;
    sites: SiteTemplate[];
    records: RegulationRecord[];
}

/** 文件名解析结果（Rust 回传） */
export interface ParsedName {
    standardNo: string;
    year: string | null;
    title: string;
    level: string;
    marker: string | null;
    unparsedReason: string | null;
}

/** 盘上未登记的文件 */
export interface UnregisteredFile {
    fileName: string;
    fileSize: number;
    notDownloaded: boolean;
    parsed: ParsedName;
}

export interface RegulationScanResult {
    rootExists: boolean;
    records: RegulationRecord[];
    unregistered: UnregisteredFile[];
    sidecarExists: boolean;
}

/**
 * 首页预填线索（设计 Q16）。Rust 从标准 PDF 首页抽出，**仅供预填**——
 * 人工确认后才入库。抽不出时 Rust 返回 null。
 */
export interface FirstPageHints {
    publishedAt: string | null;
    effectiveAt: string | null;
    replaces: string[];
    isDraft: boolean;
    /** `has` / `none`——本工具能否从这份 PDF 抽出正文 */
    textLayer: string;
}

/** 把线索并进一条记录（不覆盖已填的值——人工填的优先） */
export const applyHints = (rec: RegulationRecord, hints: FirstPageHints | null): RegulationRecord => {
    if (!hints) return rec;
    return {
        ...rec,
        publishedAt: rec.publishedAt ?? hints.publishedAt,
        effectiveAt: rec.effectiveAt ?? hints.effectiveAt,
        replaces: rec.replaces.length ? rec.replaces : hints.replaces,
        status: rec.status || (hints.isDraft ? '草案' : ''),
        // 文本层只在原本未知时采纳探测结果；不把 has/none 降级成 unknown
        textLayer:
            rec.textLayer === 'unknown' && hints.textLayer ? hints.textLayer : rec.textLayer,
    };
};

// ==================== 状态推导（设计 Q7：日期推导 + 人工覆盖位） ====================

export const STATUS_VALUES = ['现行', '即将实施', '已被替代', '废止', '草案', '未知'] as const;
export type StatusValue = (typeof STATUS_VALUES)[number];

/** 状态展示顺序（筛选项按此排列） */
export const STATUS_ORDER: Record<string, number> = {
    现行: 0,
    即将实施: 1,
    草案: 2,
    已被替代: 3,
    废止: 4,
    未知: 9,
};

export const statusLabel = (s: string): string => (s && s.trim() ? s : '未知');

/** 稿别判定：标记文本或显式状态为「草案」都算 */
const DRAFT_RE = /征求意见稿|报批稿|送审稿|草案/;

/**
 * 推导状态（纯函数）。
 *
 * 顺序即优先级：人工覆盖 > 稿别（草案）> 日期推导 > 显式状态 > 未知。
 *
 * 「已被替代 / 废止」**无法从日期推出**——那要靠权威核验（P1）或人工标注，
 * 所以这里只覆盖「现行 / 即将实施 / 草案」三档，其余交给 `statusOverridden`。
 *
 * 草案优先于日期：登记时对征求意见稿预填了 `status='草案'`（Q7/Q16），
 * 若让日期先判，这份草案一旦填了实施日期就会被显示成「现行」——把稿别丢了。
 */
export const deriveStatus = (
    rec: Pick<RegulationRecord, 'status' | 'statusOverridden' | 'publishedAt' | 'effectiveAt'> & {
        marker?: string | null;
    },
    today: string = new Date().toISOString().slice(0, 10),
): StatusValue => {
    if (rec.statusOverridden && rec.status?.trim()) return rec.status.trim() as StatusValue;

    const explicit = rec.status?.trim() ?? '';
    const isDraft = DRAFT_RE.test(rec.marker?.trim() ?? '') || explicit === '草案';
    if (isDraft) return '草案';

    const eff = rec.effectiveAt?.trim();
    if (eff && /^\d{4}-\d{2}-\d{2}$/.test(eff)) {
        return today < eff ? '即将实施' : '现行';
    }
    // 只有发布日期、没有实施日期：标准已发布（如早年未标注实施日的文件）
    const pub = rec.publishedAt?.trim();
    if (pub && /^\d{4}-\d{2}-\d{2}$/.test(pub)) return '现行';

    // 显式写死的状态（人工填了但没勾"覆盖"）也认
    if (explicit && explicit !== '未知') return explicit as StatusValue;
    return '未知';
};

// ==================== 权威查询站点（设计 §5.4） ====================

/**
 * 填充站点 URL 模板。
 *
 * 占位符：
 * - `{no}`      原样标准号（"GB 44495"）
 * - `{compact}` 去空格（"GB/T18386.1"）
 * - `{lower}`   去空格小写（"gbt18386.1"）
 * - `{code}`    **去掉发布机构前缀后的代号**，小写（"SAE J3016" → "j3016"）。
 *   SAE 规范页只认代号（实测 `…/content/j3016/` 200，`…/content/saej3016/` 不存在）。
 */
export const formatSiteUrl = (template: string, standardNo: string): string => {
    const no = (standardNo ?? '').trim();
    const parts = no.split(/\s+/).filter(Boolean);
    const code = (parts.length > 1 ? parts[parts.length - 1] : no).toLowerCase();
    return template
        .replace(/\{no\}/g, encodeURIComponent(no))
        .replace(/\{compact\}/g, encodeURIComponent(no.replace(/\s+/g, '')))
        .replace(/\{lower\}/g, encodeURIComponent(no.replace(/\s+/g, '').toLowerCase()))
        .replace(/\{code\}/g, encodeURIComponent(code));
};

/** 按层级挑站点：levels 命中优先，空 levels 视为通用兜底 */
export const pickSite = (sites: SiteTemplate[], level: string): SiteTemplate | null => {
    if (!sites.length) return null;
    const exact = sites.find(s => s.levels.includes(level));
    if (exact) return exact;
    return sites.find(s => s.levels.length === 0) ?? null;
};

/** 该记录可用的全部站点入口（精确匹配 + 通用），供「权威查询」下拉 */
export const sitesForLevel = (sites: SiteTemplate[], level: string): SiteTemplate[] => {
    const exact = sites.filter(s => s.levels.includes(level));
    const generic = sites.filter(s => s.levels.length === 0);
    return [...exact, ...generic];
};

// ==================== 版本链（设计 Q6 / Q13） ====================

/**
 * 取身份键：标准号本身（年份是版本，不是身份——设计 Q5）。
 *
 * 会**去掉尾部 4 位年份**：用户若把 `GB 44495-2024` 整串填进标准号，
 * 年份会同时落在 standardNo 和 year 上，身份键就废了（同一标准的不同版本会被当成两条）。
 * 部分号**保留**（`GB/T 34590.1-2022` → `GB/T 34590.1`）——部分号属身份本身。
 * 非 4 位尾部不去年份（`SAE J3016-202104` 是修订代号）。
 */
export const identityOf = (rec: Pick<RegulationRecord, 'standardNo'>): string => {
    const s = (rec.standardNo ?? '').trim();
    const m = /^(.*?)-\s*(\d{4})$/.exec(s);
    return m ? m[1].trim() : s;
};

/**
 * 把「标准号整串」拆成身份 + 版本：`GB 44495-2024` → `{standardNo:'GB 44495', year:'2024'}`。
 * 用于用户把标准号和年份连在一起填进一个输入框时自动归位（部分号不受影响：
 * `GB/T 34590.1` 尾部不是 4 位数字，不会被拆）。
 */
export const splitStandardNoYear = (raw: string): { standardNo: string; year: string | null } => {
    const s = (raw ?? '').trim();
    const m = /^(.*?\S)\s*-\s*(\d{4})$/.exec(s);
    return m ? { standardNo: m[1].trim(), year: m[2] } : { standardNo: s, year: null };
};

/** 冲突判定的归一键：身份 + 版本；年份连写在标准号里也先拆开 */
const conflictKey = (r: Pick<RegulationRecord, 'standardNo' | 'year'>): string => {
    const split = splitStandardNoYear(r.standardNo);
    const year = r.year ?? split.year;
    return `${identityOf({ standardNo: split.standardNo })}@${year ?? ''}`;
};

/** 待登记项与已有记录的身份+版本冲突（设计 ADR-0002：永不静默覆盖） */
export const findConflicts = (
    existing: RegulationRecord[],
    incoming: Array<Pick<RegulationRecord, 'standardNo' | 'year'>>,
): Array<Pick<RegulationRecord, 'standardNo' | 'year'>> => {
    const taken = new Set(existing.map(conflictKey));
    const seen = new Set<string>();
    const out: Array<Pick<RegulationRecord, 'standardNo' | 'year'>> = [];
    for (const inc of incoming) {
        const key = conflictKey(inc);
        if ((taken.has(key) || seen.has(key)) && !out.some(o => conflictKey(o) === key)) {
            out.push(inc);
        }
        seen.add(key);
    }
    return out;
};

/** 版本排序：年份新在前；无年份排最后 */
export const compareVersionDesc = (a: RegulationRecord, b: RegulationRecord): number => {
    const ya = a.year ?? '';
    const yb = b.year ?? '';
    if (ya !== yb) return yb.localeCompare(ya);
    return (a.title ?? '').localeCompare(b.title ?? '');
};

/** 按身份分组出「版本链」：同 standardNo 的多条记录 */
export const buildVersionChains = (
    records: RegulationRecord[],
): Map<string, RegulationRecord[]> => {
    const map = new Map<string, RegulationRecord[]>();
    for (const rec of records) {
        const key = identityOf(rec);
        const list = map.get(key);
        if (list) list.push(rec);
        else map.set(key, [rec]);
    }
    for (const list of map.values()) list.sort(compareVersionDesc);
    return map;
};

/** 同身份下的最新版本（列表主行用） */
export const latestOfChain = (chain: RegulationRecord[]): RegulationRecord =>
    [...chain].sort(compareVersionDesc)[0];

// ==================== 筛选与搜索（纯函数） ====================

export interface RegulationFilters {
    levels: string[];
    domains: string[];
    statuses: string[];
    /** 关键词：标准号 / 名称 / 主题域 / 备注 */
    query: string;
}

export const EMPTY_FILTERS: RegulationFilters = { levels: [], domains: [], statuses: [], query: '' };

/** 多值 facet 语义：空筛选 = 不过滤；命中「任一」即通过（与资产受控属性一致） */
const hitsAny = (selected: string[], values: string[]): boolean =>
    selected.length === 0 || selected.some(s => values.includes(s));

export const filterRecords = (
    records: RegulationRecord[],
    filters: RegulationFilters,
    today?: string,
): RegulationRecord[] => {
    const q = filters.query.trim().toLowerCase();
    return records.filter(rec => {
        const status = deriveStatus(rec, today);
        if (!hitsAny(filters.levels, rec.level ? [rec.level] : [])) return false;
        if (!hitsAny(filters.domains, rec.domains ?? [])) return false;
        if (!hitsAny(filters.statuses, [statusLabel(status)])) return false;
        if (!q) return true;
        const haystack = [rec.standardNo, rec.title, ...(rec.domains ?? []), rec.note ?? '']
            .join(' ')
            .toLowerCase();
        return haystack.includes(q);
    });
};

// ==================== 其它展示助手 ====================

/** 人类可读文件大小 */
export const formatSize = (bytes: number | null | undefined): string => {
    if (!bytes || bytes <= 0) return '—';
    const mb = bytes / 1024 / 1024;
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

/** 从相对路径取末段文件名 */
export const baseNameOf = (relPath: string): string =>
    relPath.split('/').filter(Boolean).pop() ?? relPath;

/** 记录的健康告警（列表行上以图标提示，详情抽屉给整句） */
export type RecordIssue = 'file-missing' | 'no-file' | 'not-downloaded' | 'no-text-layer' | null;

export const recordIssue = (rec: RegulationRecord): RecordIssue => {
    if (rec.fileMissing) return 'file-missing';
    if (!rec.fileName) return 'no-file';
    if (rec.notDownloaded) return 'not-downloaded';
    if (rec.textLayer === 'none') return 'no-text-layer';
    return null;
};

export const issueText: Record<Exclude<RecordIssue, null>, string> = {
    'file-missing': '文件缺失：登记的文件不在库目录里，可能已被移动或改名',
    'no-file': '未收录文件：仅有元数据（如标准需购买，或只留了知识卡）',
    'not-downloaded': '文件未下载到本机（iCloud 占位），打开前需先下载',
    'no-text-layer': '扫描件：无可提取文本，正文检索覆盖不到这一份',
};

/** 生成新记录的空模板（登记未识别文件 / 手工新增用） */
export const emptyRecord = (over: Partial<RegulationRecord> = {}): RegulationRecord => ({
    version: '1.0',
    standardNo: '',
    year: null,
    title: '',
    level: '',
    domains: [],
    publishedAt: null,
    effectiveAt: null,
    status: '',
    statusOverridden: false,
    replaces: [],
    fileName: null,
    fileSize: null,
    fileMissing: false,
    notDownloaded: false,
    textLayer: 'unknown',
    knowledgeCards: [],
    note: '',
    updatedAt: new Date().toISOString(),
    ...over,
});
