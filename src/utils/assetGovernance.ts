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

/** 关键车型标签名（ADR-0003：业务主推/对比偏好的人工标记，替代已退役的主文件） */
export const KEY_VEHICLE_TAG = '关键车型';

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

/**
 * 归组键规范化（人工显示名 → 键）：去掉全部空白 + 拉丁大写。
 * 推导键同样无空白、恒大写，同口径保证「同名必同键」。
 */
export const normalizeGroupKey = (name: string): string => name.replace(/\s+/g, '').toUpperCase();

/**
 * 归组键解析：人工显示名（meta.groupName）优先，缺省回落文件名推导。
 * 显示名参与归组——把车型组重命名为与既有组同名即自动合并，改不同名即拆出；
 * 文件名始终不动（与显示名解耦）。
 */
export const resolveVehicleGroupKey = (
  info: { fileName: string; productName?: string | null },
  meta: AssetGovernanceMeta | undefined,
  brandNames: string[] = DEFAULT_BRAND_NAMES,
): string => {
  const named = meta?.groupName ? normalizeGroupKey(meta.groupName) : '';
  return named || deriveVehicleGroupKey(info.fileName, info.productName, brandNames);
};

export interface GovernanceFileEntry {
  info: AssetFileInfo;
  meta: AssetGovernanceMeta;
  groupKey: string;
}

export interface VehicleGroup {
  groupKey: string;
  files: GovernanceFileEntry[];
}

export interface DuplicateCluster {
  /** 命中的公告号/车辆型号（可能多个） */
  keys: string[];
  fileNames: string[];
}

/**
 * 车辆版本组（ADR-0003）：同一辆车（身份键）的全部资产。
 * 身份键 = 公告号 + 准入编号（有公告号时；ZR 不同即不同车），否则车型组 + 产品名。
 */
export interface CarVersionGroup {
  identityKey: string;
  files: GovernanceFileEntry[];
  /** 活跃版本（未 superseded/deprecated） */
  activeFiles: GovernanceFileEntry[];
  /** 版本链头：活跃版本中 updatedAt 最新（并列比参数数、文件名字典序） */
  latest: GovernanceFileEntry | null;
}

/** 版本链未收敛：同一辆车存在多份活跃版本，体检提示把旧的标 superseded */
export interface UnconvergedCar {
  identityKey: string;
  files: GovernanceFileEntry[];
  latestFileName: string | null;
}

export interface GovernanceReport {
  totalFiles: number;
  totalGroups: number;
  groups: VehicleGroup[];
  /** 每辆车的链头文件名（⚡激活/对比默认入口） */
  latestFileNames: string[];
  /** 版本链未收敛的车（同车多份活跃版本） */
  unconvergedCars: UnconvergedCar[];
  /** 审批状态为「驳回」的文件（自动派生，无需标注） */
  rejectedFiles: AssetFileInfo[];
  /** 疑似重复：同车辆型号/公告号的文件簇（含 ZR 重报对） */
  duplicateClusters: DuplicateCluster[];
  namingNonCompliant: { name: string; errors: string[] }[];
}

const normalizeIdentityToken = (s: string): string => s.replace(/\s+/g, '').toUpperCase();

/**
 * 车辆身份键（与导入查重同源，ADR-0002/0003）：
 * 有公告号 → `公告号|准入编号`（准入编号不同即不同车）；无公告号 → 车型组 + 产品名。
 */
export const deriveCarIdentityKey = (
  info: Pick<AssetFileInfo, 'announceNos' | 'admissionNos' | 'productName'>,
  effectiveAnnounceNos: string[],
  groupKey: string,
): string => {
  const announcePart = normalizeIdentityToken(effectiveAnnounceNos.filter(Boolean).sort().join(','));
  if (announcePart) {
    const zrPart = normalizeIdentityToken((info.admissionNos ?? []).filter(Boolean).sort().join(','));
    return `A:${announcePart}|Z:${zrPart}`;
  }
  return `N:${groupKey}::${normalizeIdentityToken(info.productName)}`;
};

/** 链头判定（确定性）：updatedAt 最新 → 参数最多 → 文件名字典序 */
const latestOf = (files: GovernanceFileEntry[]): GovernanceFileEntry | null => {
  if (files.length === 0) return null;
  const timeOf = (v: string | null) => {
    const t = v ? Date.parse(v) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  return [...files].sort((a, b) => {
    const d = timeOf(b.info.updatedAt) - timeOf(a.info.updatedAt);
    if (d !== 0) return d;
    if (a.info.filledParams !== b.info.filledParams) return b.info.filledParams - a.info.filledParams;
    return a.info.fileName.localeCompare(b.info.fileName);
  })[0];
};

/** 按身份键聚合车辆版本组（跨车型组聚合——同车理论上只属一组，聚合放全量口径防漏） */
export const computeCarVersionGroups = (
  entries: GovernanceFileEntry[],
  effectiveAnnounceNosResolver: (info: AssetFileInfo) => string[],
): Map<string, CarVersionGroup> => {
  const map = new Map<string, CarVersionGroup>();
  entries.forEach(entry => {
    const key = deriveCarIdentityKey(entry.info, effectiveAnnounceNosResolver(entry.info), entry.groupKey);
    if (!map.has(key)) map.set(key, { identityKey: key, files: [], activeFiles: [], latest: null });
    const car = map.get(key)!;
    car.files.push(entry);
    if (entry.meta.status !== 'superseded' && entry.meta.status !== 'deprecated') {
      car.activeFiles.push(entry);
    }
  });
  map.forEach(car => { car.latest = latestOf(car.activeFiles); });
  return map;
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

/** 治理体检报告：聚合分组、版本链收敛、驳回件、疑似重复、命名不规范（ADR-0003，主文件概念已退役） */
export const buildGovernanceReport = (
  infos: AssetFileInfo[],
  metaMap: AssetMetaMap,
  brandNames: string[] = DEFAULT_BRAND_NAMES,
  /** 有效公告号解析（对齐 DataSourcePanel 的 effectiveAnnounceNos 口径）；缺省用 announceNos */
  announceNosResolver?: (info: AssetFileInfo) => string[],
): GovernanceReport => {
  const resolveNos = announceNosResolver ?? ((info: AssetFileInfo) => info.announceNos);
  const entries: GovernanceFileEntry[] = infos.map(info => {
    const meta = metaMap[info.fileName] || {};
    return { info, meta, groupKey: resolveVehicleGroupKey(info, meta, brandNames) };
  });

  const groupMap = new Map<string, GovernanceFileEntry[]>();
  entries.forEach(entry => {
    if (!groupMap.has(entry.groupKey)) groupMap.set(entry.groupKey, []);
    groupMap.get(entry.groupKey)!.push(entry);
  });

  const groups: VehicleGroup[] = Array.from(groupMap.entries()).map(([groupKey, files]) => ({
    groupKey,
    files,
  }));
  groups.sort((a, b) => a.groupKey.localeCompare(b.groupKey));

  // 车辆版本组：链头集合 + 未收敛车
  const carGroups = computeCarVersionGroups(entries, resolveNos);
  const latestFileNames: string[] = [];
  const unconvergedCars: UnconvergedCar[] = [];
  carGroups.forEach(car => {
    if (car.latest) latestFileNames.push(car.latest.info.fileName);
    if (car.activeFiles.length > 1) {
      unconvergedCars.push({
        identityKey: car.identityKey,
        files: [...car.files].sort((a, b) => a.info.fileName.localeCompare(b.info.fileName)),
        latestFileName: car.latest?.info.fileName ?? null,
      });
    }
  });
  unconvergedCars.sort((a, b) => b.files.length - a.files.length || a.identityKey.localeCompare(b.identityKey));

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
    latestFileNames,
    unconvergedCars,
    rejectedFiles: infos.filter(i => i.approvalStatus === '驳回'),
    duplicateClusters: buildDuplicateClusters(infos),
    namingNonCompliant,
  };
};

/**
 * 组内展示排序：🆕每车链头 → 其它活跃 → 历史 → 废弃（ADR-0003）。
 * 同级按 updatedAt 新→旧，再按文件名字典序，保证确定性。
 */
export const sortGroupFiles = (
  entries: GovernanceFileEntry[],
  latestFileNames?: Set<string>,
): GovernanceFileEntry[] => {
  const rank = (e: GovernanceFileEntry): number => {
    if (latestFileNames?.has(e.info.fileName)) return 0;
    if (e.meta.status === 'deprecated') return 3;
    if (e.meta.status === 'superseded') return 2;
    return 1;
  };
  const timeOf = (v: string | null) => {
    const t = v ? Date.parse(v) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  return [...entries].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const d = timeOf(b.info.updatedAt) - timeOf(a.info.updatedAt);
    if (d !== 0) return d;
    return a.info.fileName.localeCompare(b.info.fileName);
  });
};

/**
 * 规范化分组显示名：仅收尾空白与压缩连续空格。
 * 显示名与文件名、归组推导完全解耦，允许任意字符（含空格/括号）。
 */
export const sanitizeGroupName = (input: string): string => input.trim().replace(/\s+/g, ' ');

/**
 * 分组显示名：取任一文件的 groupName 覆盖（组重命名会写入组内全部文件），无覆盖时回落归组键。
 */
export const pickGroupAlias = (entries: GovernanceFileEntry[], fallback: string): string => {
    for (const e of entries) {
        if (e.meta.groupName) return e.meta.groupName;
    }
    return fallback;
};

/**
 * 主文件迁移（ADR-0003）：收集 meta 中的 isPrimary 标记并从 meta 清除。
 * 调用方把 primaryFileNames 转写为「关键车型」标签后落盘。
 */
export const collectPrimaryMeta = (
  metaMap: AssetMetaMap,
): { primaryFileNames: string[]; cleaned: AssetMetaMap } => {
  const primaryFileNames: string[] = [];
  const cleaned: AssetMetaMap = {};
  Object.entries(metaMap).forEach(([fileName, m]) => {
    if (m.isPrimary) {
      primaryFileNames.push(fileName);
      const rest = { ...m } as Record<string, unknown>;
      delete rest.isPrimary;
      if (Object.keys(rest).length > 0) cleaned[fileName] = rest as AssetGovernanceMeta;
    } else {
      cleaned[fileName] = m;
    }
  });
  return { primaryFileNames, cleaned };
};

// ============================================================
// 生命周期状态流转（ADR-0002：永不静默覆盖，更新=版本演进，删除=软删除）
// 均为纯计算：返回完整新 meta 映射，由调用方一次性落盘。
// ============================================================

/**
 * 版本流转：旧文件标 superseded（历史版本）。一次导入产生多对新旧版本时传入多个 pair。
 */
export const buildSupersedeMeta = (
  metaMap: AssetMetaMap,
  pairs: { oldFileName: string; newFileName: string }[],
): AssetMetaMap => {
  const next: AssetMetaMap = { ...metaMap };
  pairs.forEach(({ oldFileName }) => {
    const oldMeta = { ...(next[oldFileName] || {}) } as Record<string, unknown>;
    delete oldMeta.isPrimary; // 历史遗留字段顺手清理（主文件已退役）
    oldMeta.status = 'superseded';
    next[oldFileName] = oldMeta as AssetGovernanceMeta;
  });
  return next;
};

/** 软删除：标 deprecated（文件保留，可恢复） */
export const buildDeprecateMeta = (
  metaMap: AssetMetaMap,
  fileNames: string[],
): AssetMetaMap => {
  const next: AssetMetaMap = { ...metaMap };
  fileNames.forEach(fileName => {
    const rest = { ...(next[fileName] || {}) } as Record<string, unknown>;
    delete rest.isPrimary; // 历史遗留字段顺手清理
    rest.status = 'deprecated';
    next[fileName] = rest as AssetGovernanceMeta;
  });
  return next;
};

/** 恢复：清除 status（历史/废弃标记），其余标注保留；空条目移除 */
export const buildRestoreMeta = (
  metaMap: AssetMetaMap,
  fileNames: string[],
): AssetMetaMap => {
  const next: AssetMetaMap = { ...metaMap };
  fileNames.forEach(fileName => {
    const rest = { ...(next[fileName] || {}) };
    delete rest.status;
    if (Object.keys(rest).length === 0) delete next[fileName];
    else next[fileName] = rest;
  });
  return next;
};
