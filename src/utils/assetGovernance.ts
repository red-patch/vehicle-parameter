import type { AssetFileInfo, AssetGovernanceMeta, AssetMetaMap } from './assetManager';
import { getAssetBaseName, parseAssetName, validateAssetName } from './assetNaming';

// ============================================================
// 资产数据治理：车型分组、主文件建议、治理体检报告
// 纯函数模块，所有 IO（_asset_meta.json 读写）在 assetManager.ts
// ============================================================

/** 已知厂商名单兜底（与资产库标签组「厂商」对齐，config 里有的会合并进来） */
export const DEFAULT_BRAND_NAMES = [
  '吉利', '金旅', '福田', '九识', '新石器', '大通', '陕汽', '东风', '徐工', '金龙', '白犀牛',
];

/** 变体尾缀：同一车型不同上装/用途的叫法，分组时视为同组 */
const VARIANT_SUFFIX_RE = /(客运版|货运版)$/;

/** 尾部括号内容（全角/半角）：V6E（客运版）、金旅ET850（货厢） */
const TRAILING_PAREN_RE = /[（(][^（）()]*[）)]$/;

interface TagGroupLike {
  id: string;
  name: string;
  tags: string[];
}

/**
 * 从标签分组配置提取厂商名单（按组名「厂商」识别），并入默认名单。
 * 用于分组键的厂商前缀剥离（金旅ET850 → ET850）。
 */
export const extractBrandNames = (groups?: TagGroupLike[]): string[] => {
  const set = new Set(DEFAULT_BRAND_NAMES);
  const vendorGroup = groups?.find(g => g.name === '厂商' || g.id === 'vendor');
  vendorGroup?.tags.forEach(t => set.add(t));
  return Array.from(set);
};

const normalizeSeriesToken = (token: string, brandNames: string[]): string => {
  let s = token.trim();
  s = s.replace(TRAILING_PAREN_RE, '');
  // 剥离已知厂商前缀（最长匹配优先；「新石器牌」这类 厂商+牌 连写一并剥离，
  // 剥空时返回空串，由调用方顺延取下一个 token）
  const brands = [...brandNames].sort((a, b) => b.length - a.length);
  for (const brand of brands) {
    if (!brand) continue;
    if (s.startsWith(`${brand}牌`)) {
      s = s.slice(brand.length + 1);
      break;
    }
    if (s.startsWith(brand)) {
      s = s.slice(brand.length);
      break;
    }
  }
  s = s.replace(VARIANT_SUFFIX_RE, '');
  return s.toUpperCase();
};

/**
 * 车型分组键：主文件唯一性的作用域。
 * 优先五段式命名规范的 series；否则取首个 token（空格/-/—/_ 分隔），
 * 依次剥离尾部括号内容、厂商前缀、变体尾缀；token 被剥空时（如「新石器牌_X3_...」）
 * 顺延取下一个 token；拉丁部分归一大写。
 */
export const deriveVehicleGroupKey = (
  fileName: string,
  productName?: string | null,
  brandNames: string[] = DEFAULT_BRAND_NAMES,
): string => {
  const sources = [getAssetBaseName(fileName)];
  if (productName && productName.trim()) sources.push(productName.trim());

  for (const source of sources) {
    const base = source.replace(/^【[^】]*】/, '').trim();
    if (!base) continue;

    const parsed = parseAssetName(base);
    if (parsed) return normalizeSeriesToken(parsed.series, brandNames);

    const tokens = base.split(/[\s_—–-]+/).filter(Boolean);
    let fallback = '';
    for (const token of tokens) {
      const normalized = normalizeSeriesToken(token, brandNames);
      if (normalized) return normalized;
      if (!fallback && token) fallback = token;
    }
    if (fallback) return fallback.toUpperCase();
  }
  return '未分组';
};

export interface GovernanceFileEntry {
  info: AssetFileInfo;
  meta: AssetGovernanceMeta;
  groupKey: string;
}

export interface VehicleGroup {
  groupKey: string;
  files: GovernanceFileEntry[];
  /** 规则推荐的主文件 fileName */
  suggestedPrimary: string | null;
  /** 用户已标记的主文件 fileName（多个时取第一个，多主文件问题单独上报） */
  currentPrimary: string | null;
}

export interface DuplicateCluster {
  /** 命中的公告号/车辆型号（可能多个） */
  keys: string[];
  fileNames: string[];
}

export interface GovernanceReport {
  totalFiles: number;
  totalGroups: number;
  groups: VehicleGroup[];
  missingPrimaryGroups: VehicleGroup[];
  multiPrimaryGroups: VehicleGroup[];
  /** 审批状态为「驳回」的文件（自动派生，无需标注） */
  rejectedFiles: AssetFileInfo[];
  /** 疑似重复：同车辆型号/公告号的文件簇（含 ZR 重报对） */
  duplicateClusters: DuplicateCluster[];
  namingNonCompliant: { name: string; errors: string[] }[];
}

/**
 * 主文件建议规则（确定性排序）：
 * 文件名带「废弃」的降级 → 审批状态=已审核 优先 → 填写参数最多 → updatedAt 最新 → 文件名字典序兜底
 */
export const suggestPrimary = (entries: GovernanceFileEntry[]): string | null => {
  if (entries.length === 0) return null;
  const timeOf = (v: string | null) => {
    const t = v ? Date.parse(v) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  const sorted = [...entries].sort((a, b) => {
    const ad = a.info.fileName.includes('废弃') ? 0 : 1;
    const bd = b.info.fileName.includes('废弃') ? 0 : 1;
    if (ad !== bd) return bd - ad;
    const ap = a.info.approvalStatus === '已审核' ? 1 : 0;
    const bp = b.info.approvalStatus === '已审核' ? 1 : 0;
    if (ap !== bp) return bp - ap;
    if (a.info.filledParams !== b.info.filledParams) return b.info.filledParams - a.info.filledParams;
    const at = timeOf(a.info.updatedAt);
    const bt = timeOf(b.info.updatedAt);
    if (at !== bt) return bt - at;
    return a.info.fileName.localeCompare(b.info.fileName);
  });
  return sorted[0].info.fileName;
};

/** 疑似重复检测：车辆型号或任一公告号相同的文件通过并查集聚簇 */
const buildDuplicateClusters = (infos: AssetFileInfo[]): DuplicateCluster[] => {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    if (a === b) return;
    parent.set(a, a);
    parent.set(b, b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const keyToFiles = new Map<string, Set<string>>();
  infos.forEach(info => {
    const keys = [info.vehicleModel, ...info.announceNos].filter((k): k is string => !!k);
    keys.forEach(key => {
      if (!keyToFiles.has(key)) keyToFiles.set(key, new Set());
      keyToFiles.get(key)!.add(info.fileName);
    });
  });
  keyToFiles.forEach(files => {
    const arr = Array.from(files);
    for (let i = 1; i < arr.length; i++) union(arr[0], arr[i]);
  });

  const clusterFiles = new Map<string, Set<string>>();
  infos.forEach(info => {
    const keys = [info.vehicleModel, ...info.announceNos].filter((k): k is string => !!k);
    if (keys.length === 0) return;
    const root = find(info.fileName);
    if (!clusterFiles.has(root)) clusterFiles.set(root, new Set());
    clusterFiles.get(root)!.add(info.fileName);
  });

  const clusters: DuplicateCluster[] = [];
  clusterFiles.forEach(files => {
    if (files.size < 2) return;
    const fileArr = Array.from(files).sort();
    const keys = new Set<string>();
    keyToFiles.forEach((members, key) => {
      if (members.size >= 2 && fileArr.every(f => members.has(f))) keys.add(key);
    });
    clusters.push({ keys: Array.from(keys), fileNames: fileArr });
  });
  clusters.sort((a, b) => b.fileNames.length - a.fileNames.length || a.fileNames[0].localeCompare(b.fileNames[0]));
  return clusters;
};

/** 治理体检报告：聚合分组、主文件缺口、多主文件、驳回件、疑似重复、命名不规范 */
export const buildGovernanceReport = (
  infos: AssetFileInfo[],
  metaMap: AssetMetaMap,
  brandNames: string[] = DEFAULT_BRAND_NAMES,
  /** 有效公告号解析（对齐 DataSourcePanel 的 effectiveAnnounceNos 口径）；缺省用 announceNos */
  announceNosResolver?: (info: AssetFileInfo) => string[],
): GovernanceReport => {
  const resolveNos = announceNosResolver ?? ((info: AssetFileInfo) => info.announceNos);
  const entries: GovernanceFileEntry[] = infos.map(info => ({
    info,
    meta: metaMap[info.fileName] || {},
    groupKey: deriveVehicleGroupKey(info.fileName, info.productName, brandNames),
  }));

  const groupMap = new Map<string, GovernanceFileEntry[]>();
  entries.forEach(entry => {
    if (!groupMap.has(entry.groupKey)) groupMap.set(entry.groupKey, []);
    groupMap.get(entry.groupKey)!.push(entry);
  });

  const groups: VehicleGroup[] = Array.from(groupMap.entries()).map(([groupKey, files]) => {
    const primaryFiles = files.filter(f => f.meta.isPrimary);
    return {
      groupKey,
      files,
      suggestedPrimary: suggestPrimary(files),
      currentPrimary: primaryFiles[0]?.info.fileName ?? null,
    };
  });
  groups.sort((a, b) => a.groupKey.localeCompare(b.groupKey));

  // 命名合规：与 DataSourcePanel 同口径（名称须包含有效公告号）
  const namingNonCompliant: { name: string; errors: string[] }[] = [];
  infos.forEach(info => {
    const v = validateAssetName(info.fileName, resolveNos(info));
    if (!v.valid) namingNonCompliant.push({ name: info.fileName, errors: v.errors });
  });

  return {
    totalFiles: infos.length,
    totalGroups: groups.length,
    groups,
    missingPrimaryGroups: groups.filter(g => !g.currentPrimary),
    multiPrimaryGroups: groups.filter(g => g.files.filter(f => f.meta.isPrimary).length > 1),
    rejectedFiles: infos.filter(i => i.approvalStatus === '驳回'),
    duplicateClusters: buildDuplicateClusters(infos),
    namingNonCompliant,
  };
};

/**
 * 采纳主文件建议：对给定组清除现有主文件的 isPrimary，并把建议文件标为主文件。
 * 返回完整的新 meta 映射（其余条目原样保留），由调用方一次性落盘。
 */
export const buildAdoptPrimaryMeta = (
  metaMap: AssetMetaMap,
  groups: VehicleGroup[],
): AssetMetaMap => {
  const next: AssetMetaMap = { ...metaMap };
  groups.forEach(group => {
    if (!group.suggestedPrimary) return;
    group.files.forEach(file => {
      if (!file.meta.isPrimary || file.info.fileName === group.suggestedPrimary) return;
      const rest = { ...(next[file.info.fileName] || {}) };
      delete rest.isPrimary;
      if (Object.keys(rest).length === 0) delete next[file.info.fileName];
      else next[file.info.fileName] = rest;
    });
    next[group.suggestedPrimary] = { ...(next[group.suggestedPrimary] || {}), isPrimary: true };
  });
  return next;
};
