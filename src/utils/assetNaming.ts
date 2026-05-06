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

import type { VehicleParameter } from '../types';

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

export const validateAssetName = (name: string): NameValidation => {
  const clean = getAssetBaseName(name);
  const errors: string[] = [];

  if (!clean.includes('-')) {
    return { valid: false, errors: ['缺少 - 分隔符，规范格式：{车型}-{年款}-{电池}-{类型}-{公告号}'], parsed: null };
  }

  const parsed = parseAssetName(clean);
  if (parsed) {
    if (parsed.battery.length > 30) errors.push(`电池厂商名过长："${parsed.battery}"`);
    if (parsed.vehicleType.length > 6) errors.push(`车辆类型过长："${parsed.vehicleType}"`);
    return { valid: errors.length === 0, errors, parsed };
  }

  // 逐段诊断
  const parts = clean.split('-');
  if (parts.length < 5) {
    errors.push(`段数不足（${parts.length}/5）：缺少 ${5 - parts.length} 段`);
  } else if (parts.length > 5) {
    errors.push(`段数过多（${parts.length}/5），检查多余分隔符`);
  } else {
    if (!/^[A-Za-z0-9]+$/.test(parts[0])) errors.push(`第1段「车型」应为英文+数字，当前："${parts[0]}"`);
    if (!/^\d{2}款$/.test(parts[1])) errors.push(`第2段「年款」应为 25款/24款 等，当前："${parts[1]}"`);
    if (!/^[一-龥A-Za-z]+\d+(\.\d+)?kWh$/.test(parts[2])) errors.push(`第3段「电池」应为厂商+电量，如宁德55kWh，当前："${parts[2]}"`);
    if (!/^[一-龥]+$/.test(parts[3])) errors.push(`第4段「车辆类型」应为纯中文，当前："${parts[3]}"`);
    if (!/^[A-Z0-9]+$/.test(parts[4])) errors.push(`第5段「公告号」应为大写字母+数字，当前："${parts[4]}"`);
  }
  return { valid: false, errors, parsed: null };
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

  // 否则按公告相关字段查找
  for (const key of ANNOUNCE_NAME_KEYS) {
    const param = params.find(p => p.name === key || p.name?.includes(key));
    if (param?.value) return String(param.value).trim();
  }

  // 兜底：扫描所有参数名包含「公告」的字段
  const fallback = params.find(p => p.name?.includes('公告') && p.value);
  if (fallback?.value) return String(fallback.value).trim();

  return null;
};
