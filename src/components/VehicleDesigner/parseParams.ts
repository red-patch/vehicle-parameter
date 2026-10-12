import type { VehicleParams } from './types';

export const parseTireSpec = (spec: string): number | null => {
  try {
    const match = spec.match(/(\d{3})\/(\d{2})[R|r](\d{2})/);
    if (match) {
      const width = parseInt(match[1]);
      const ratio = parseInt(match[2]);
      const rim = parseInt(match[3]);
      const diameter = rim * 25.4 + 2 * width * (ratio / 100);
      return Math.round(diameter / 2);
    }
  } catch { /* ignore */ }
  return null;
};

const PATTERNS = [
  { regex: /整车[=:：]\s*\d{3,5}\s*\*\s*\d{3,5}\s*\*\s*\d{3,5}/ },
  { regex: /底盘[=:：]\s*\d{3,5}\s*\*\s*\d{3,5}/ },
  { regex: /货箱[=:：]\s*\d{3,5}\s*\*\s*\d{3,5}\s*\*\s*\d{3,5}/ },
  { regex: /智驾[=:：]\s*\d{2,5}\s*\*\s*\d{3,5}/ },
  { regex: /轴距[=:：]\s*\d{3,5}/i },
  { regex: /轮距[=:：]\s*\d{3,5}/i },
  { regex: /前悬[=:：]\s*\d{2,5}/i },
  { regex: /后悬[=:：]\s*\d{2,5}/i },
  { regex: /货台高[=:：]\s*\d{2,5}/i },
  { regex: /离地[=:：]\s*\d{2,5}/i },
  { regex: /接近角[=:：]\s*\d{1,2}(?:\.\d)?/i },
  { regex: /离去角[=:：]\s*\d{1,2}(?:\.\d)?/i },
  { regex: /壁厚[=:：]\s*\d{1,3}/i },
  { regex: /间隙[=:：]\s*\d{1,3}/i },
  { regex: /轮胎[=:：]\s*[0-9]{3}\/[0-9]{2}[R|r][0-9]{2}[A-Za-z]*/i },
];

export const validateImportLines = (text: string): { validLines: Set<number>; errorLines: Set<number> } => {
  if (!text.trim()) return { validLines: new Set(), errorLines: new Set() };
  const validLines = new Set<number>();
  const errorLines = new Set<number>();
  text.split('\n').forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (PATTERNS.some(({ regex }) => regex.test(trimmed))) validLines.add(idx);
    else errorLines.add(idx);
  });
  return { validLines, errorLines };
};

export const parseConfigText = (text: string): { updates: Partial<VehicleParams>; errorLines: Set<number> } => {
  if (!text.trim()) return { updates: {}, errorLines: new Set() };
  const { errorLines } = validateImportLines(text);
  const updates: Partial<VehicleParams> = {};

  const vehicleMatch = text.match(/整车[=:：]\s*(\d{3,5})\s*\*\s*(\d{3,5})\s*\*\s*(\d{3,5})/);
  if (vehicleMatch) {
    updates.chassisLength = parseFloat(vehicleMatch[1]);
    updates.overallHeight = parseFloat(vehicleMatch[3]);
  }
  const chassisMatch = text.match(/底盘[=:：]\s*(\d{3,5})\s*\*\s*(\d{3,5})/);
  if (chassisMatch) {
    updates.chassisLength = parseFloat(chassisMatch[1]);
    updates.chassisWidth = parseFloat(chassisMatch[2]);
  }
  const cargoMatch = text.match(/货箱[=:：]\s*(\d{3,5})\s*\*\s*(\d{3,5})\s*\*\s*(\d{3,5})/);
  if (cargoMatch) {
    updates.cargoLength = parseFloat(cargoMatch[1]);
    updates.cargoWidth = parseFloat(cargoMatch[2]);
  }
  const sensorMatch = text.match(/智驾[=:：]\s*(\d{2,5})\s*\*\s*(\d{3,5})/);
  if (sensorMatch) {
    updates.frontModuleLength = parseFloat(sensorMatch[1]);
    updates.sensorTopHeight = parseFloat(sensorMatch[2]);
  }

  const kvPatterns: Array<{ key: keyof VehicleParams; regex: RegExp }> = [
    { key: 'wheelbase', regex: /轴距[=:：]\s*(\d{3,5})/i },
    { key: 'trackWidth', regex: /轮距[=:：]\s*(\d{3,5})/i },
    { key: 'chassisOverhangFront', regex: /前悬[=:：]\s*(\d{2,5})/i },
    { key: 'chassisOverhangRear', regex: /后悬[=:：]\s*(\d{2,5})/i },
    { key: 'platformHeight', regex: /货台高[=:：]\s*(\d{2,5})/i },
    { key: 'chassisGroundClearance', regex: /离地[=:：]\s*(\d{2,5})/i },
    { key: 'approachAngle', regex: /接近角[=:：]\s*(\d{1,2}(?:\.\d)?)/i },
    { key: 'departureAngle', regex: /离去角[=:：]\s*(\d{1,2}(?:\.\d)?)/i },
    { key: 'cargoWallThickness', regex: /壁厚[=:：]\s*(\d{1,3})/i },
    { key: 'cargoGap', regex: /间隙[=:：]\s*(\d{1,3})/i },
  ];
  kvPatterns.forEach(({ key, regex }) => {
    const match = text.match(regex);
    if (match) {
      const val = parseFloat(match[1]);
      if (!isNaN(val)) (updates as Record<string, unknown>)[key] = val;
    }
  });

  const tireMatch = text.match(/轮胎[=:：]\s*([0-9]{3}\/[0-9]{2}[R|r][0-9]{2}[A-Za-z]*)/i);
  if (tireMatch) {
    updates.tireSpec = tireMatch[1];
    const r = parseTireSpec(tireMatch[1]);
    if (r) updates.wheelRadius = r;
  }

  if (Object.keys(updates).length === 0) {
    const dimsMatch = text.match(/(\d{3,5})\s*[*xX]\s*(\d{3,5})\s*[*xX]\s*(\d{3,5})/);
    if (dimsMatch) {
      updates.chassisLength = parseFloat(dimsMatch[1]);
      updates.cargoWidth = parseFloat(dimsMatch[2]);
      updates.overallHeight = parseFloat(dimsMatch[3]);
    }
  }

  return { updates, errorLines };
};