import type { VehicleParameter } from '../types';

export const getAssetBaseName = (name: string) => name.trim().replace(/\.json$/iu, '');

export const getAssetDisplayName = (fileName: string, productName: string) => {
    const trimmedProductName = productName.trim();
    return trimmedProductName || getAssetBaseName(fileName);
};

export const toAssetFileName = (baseName: string) => `${getAssetBaseName(baseName)}.json`;

// ============================================================
// 资产文件命名规范
// Pattern: {车型}-{年款}-{电池厂商}{电量}-{类型}-{公告号}
// 示例: F3E-25款-宁德55kWh-厢货-ZB5037XXYBEVGS1
// ============================================================

export const ASSET_NAME_REGEX =
  /^([A-Za-z0-9]+)-(\d{2}款)-([一-龥A-Za-z]+\d+(?:\.\d+)?kWh)-([一-龥]+)-([A-Z0-9]+)$/;

export const VALID_VEHICLE_TYPES = [
  '厢货', '栏板', '底盘', '客车', '冷藏', '仓栅', '自卸', '牵引', '平板', '罐式',
];

export const VALID_BATTERY_VENDORS = [
  '宁德', '国轩', '比亚迪', '中航', '亿纬', '蜂巢', '瑞浦', '力神', '孚能', '欣旺达',
];

export interface ParsedAssetName {
  series: string;
  year: string;
  battery: string;
  vehicleType: string;
  announceNo: string;
}

export interface NameValidation {
  valid: boolean;
  errors: string[];
  /** 格式建议（不影响 valid 判定） */
  suggestions: string[];
  parsed: ParsedAssetName | null;
}

export const parseAssetName = (name: string): ParsedAssetName | null => {
  const clean = getAssetBaseName(name);
  const match = clean.match(ASSET_NAME_REGEX);
  if (!match) return null;
  return {
    series: match[1],
    year: match[2],
    battery: match[3],
    vehicleType: match[4],
    announceNo: match[5],
  };
};

export const validateAssetName = (name: string, announceNos?: string[]): NameValidation => {
  const clean = getAssetBaseName(name);
  const errors: string[] = [];
  const suggestions: string[] = [];

  // 核心检查：名称是否包含公告号（决定 valid）
  if (announceNos && announceNos.length > 0) {
    const hasAnnounceNo = announceNos.some(no => clean.includes(no));
    if (!hasAnnounceNo) {
      errors.push(`名称中未包含公告号，建议追加「-${announceNos[0]}」`);
    }
  }

  // 格式建议（不影响 valid）：是否接近5段式规范
  const parsed = parseAssetName(clean);
  if (!parsed && clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length !== 5) {
      suggestions.push(`推荐格式：{车型}-{年款}-{电池}-{类型}-{公告号}（当前${parts.length}段）`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    suggestions,
    parsed,
  };
};

/** 一键修复：在当前名称末尾追加 -公告号 */
export const fixAssetName = (currentName: string, announceNo: string): string => {
  const clean = getAssetBaseName(currentName);
  if (clean.includes(announceNo)) return currentName; // 已包含，无需修复
  return `${clean}-${announceNo}.json`;
};

export const suggestAssetName = (
  params: VehicleParameter[],
  announceNo: string,
): string | null => {
  if (!announceNo) return null;

  const paramMap = new Map<string, string>();
  params.forEach(p => { paramMap.set(p.name, String(p.value ?? '')); });

  const modelCode = paramMap.get('车辆型号') || paramMap.get('车型') || '';
  const series = modelCode.replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'Unknown';

  const batch = paramMap.get('批次') || paramMap.get('发布日期') || '';
  const yearMatch = batch.match(/(\d{2})(?=年|$)/);
  const year = yearMatch ? `${yearMatch[1]}款` : '??款';

  const batteryRaw =
    paramMap.get('储能装置种类/生产企业') ||
    paramMap.get('动力电池包电量') ||
    paramMap.get('动力电池电量') || '';
  const batteryKwh = batteryRaw.match(/(\d+(?:\.\d+)?)\s*(?:kWh|kwh|度)/)?.[1]
    || paramMap.get('动力电池包电量')?.match(/(\d+(?:\.\d+)?)/)?.[1]
    || paramMap.get('动力电池电量')?.match(/(\d+(?:\.\d+)?)/)?.[1]
    || '';
  let vendorName = '';
  for (const vendor of VALID_BATTERY_VENDORS) {
    if (batteryRaw.includes(vendor)) { vendorName = vendor; break; }
  }
  const battery = vendorName && batteryKwh
    ? `${vendorName}${batteryKwh}kWh`
    : (batteryKwh ? `${batteryKwh}kWh` : '??kWh');

  const vehicleName = paramMap.get('车辆名称') || '';
  let vehicleType = '';
  for (const vt of VALID_VEHICLE_TYPES) {
    if (vehicleName.includes(vt)) { vehicleType = vt; break; }
  }
  if (!vehicleType) vehicleType = '未知';

  return `${series}-${year}-${battery}-${vehicleType}-${announceNo}`;
};

export const checkAssetLibrary = (
  infos: { fileName: string }[],
): { compliant: string[]; nonCompliant: { name: string; errors: string[] }[] } => {
  const compliant: string[] = [];
  const nonCompliant: { name: string; errors: string[] }[] = [];
  infos.forEach(info => {
    const v = validateAssetName(info.fileName);
    if (v.valid) compliant.push(info.fileName);
    else nonCompliant.push({ name: info.fileName, errors: v.errors });
  });
  return { compliant, nonCompliant };
};

/**
 * 从参数列表中提取公告号
 * - 公告数据来源 → 取「车辆型号」字段
 * - 其他来源 → 取「整车公告号」或参数名包含「公告」的字段
 */
const ANNOUNCE_NAME_KEYS = ['整车公告号', '公告号', '产品号', '产品ID', '公告产品号', '产品编号'];

export const extractAnnounceNo = (params: VehicleParameter[], isAnnouncementSource: boolean): string | null => {
  if (params.length === 0) return null;

  if (isAnnouncementSource) {
    // 公告数据来源：优先取「车辆型号」
    const modelParam = params.find(p => p.name === '车辆型号');
    if (modelParam?.value) return String(modelParam.value).trim();
  }

  // 否则按公告相关字段查找（仅保留纯车架号格式，过滤复合ID）
  for (const key of ANNOUNCE_NAME_KEYS) {
    const param = params.find(p => p.name === key || p.name?.includes(key));
    const raw = param?.value ? String(param.value).trim() : '';
    if (raw && /^[A-Za-z0-9]+$/.test(raw)) return raw;
  }

  // 兜底：扫描所有参数名包含「公告」的字段
  const fallback = params.find(p => p.name?.includes('公告') && p.value);
  if (fallback?.value) {
    const raw = String(fallback.value).trim();
    if (/^[A-Z0-9]+$/i.test(raw)) return raw;
  }

  return null;
};
