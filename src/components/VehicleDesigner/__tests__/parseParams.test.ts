import { describe, it, expect } from 'vitest';
import { parseTireSpec, validateImportLines, parseConfigText } from '../parseParams';

describe('parseTireSpec', () => {
  it('解析 215/75R16LT → 半径', () => {
    // 轮径 = 16*25.4 + 2*215*0.75 = 406.4 + 322.5 = 728.9 → 半径 364
    expect(parseTireSpec('215/75R16LT')).toBe(364);
  });
  it('非法规格返回 null', () => {
    expect(parseTireSpec('invalid')).toBeNull();
    expect(parseTireSpec('')).toBeNull();
  });
});

describe('validateImportLines', () => {
  it('识别有效行，标记无效行', () => {
    const { validLines, errorLines } = validateImportLines('整车=4600*1500*2200\n轴距:2200\n这不是参数\n');
    expect(validLines.has(0)).toBe(true);
    expect(validLines.has(1)).toBe(true);
    expect(errorLines.has(2)).toBe(true);
  });
});

describe('parseConfigText', () => {
  it('整车尺寸 → chassisLength + overallHeight', () => {
    const { updates } = parseConfigText('整车=4600*1500*2200');
    expect(updates.chassisLength).toBe(4600);
    expect(updates.overallHeight).toBe(2200);
  });
  it('轮胎规格联动轮径', () => {
    const { updates } = parseConfigText('轮胎=215/75R16LT');
    expect(updates.tireSpec).toBe('215/75R16LT');
    expect(updates.wheelRadius).toBe(364);
  });
  it('无有效内容返回空 updates', () => {
    const { updates } = parseConfigText('hello world');
    expect(Object.keys(updates).length).toBe(0);
  });
});