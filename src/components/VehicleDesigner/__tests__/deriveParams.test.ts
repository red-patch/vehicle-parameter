import { describe, it, expect } from 'vitest';
import { deriveParams, toRad, toDeg, INITIAL_PARAMS } from '../deriveParams';

describe('toRad/toDeg', () => {
  it('角度弧度互转', () => {
    expect(toRad(180)).toBeCloseTo(Math.PI);
    expect(toDeg(Math.PI)).toBeCloseTo(180);
  });
});

describe('deriveParams', () => {
  it('货厢内空体积 = (长-2壁厚)×(宽-2壁厚)×(高-2壁厚)/1e9', () => {
    const p = deriveParams({
      ...INITIAL_PARAMS,
      cargoLength: 4050,
      cargoWidth: 1600,
      overallHeight: 2200,
      platformHeight: 700,
      cargoWallThickness: 30,
    });
    // 内空高 = (2200-700) - 2*30 = 1440
    expect(p.cargoHeight).toBe(1500);
    expect(p.innerCargoHeight).toBe(1440);
    expect(p.innerCargoLength).toBe(4050 - 60);
    expect(p.innerCargoWidth).toBe(1600 - 60);
    // 体积 (3990 * 1540 * 1440) / 1e9 ≈ 8.848224，四舍五入两位 → 8.85（字面量钉死，不循环推导）
    expect(p.innerCargoVolume).toBe(8.85);
  });

  it('整车长 = max(底盘端, 货厢端)', () => {
    const p = deriveParams({
      ...INITIAL_PARAMS,
      chassisLength: 3700,
      frontModuleLength: 250,
      cargoGap: 10,
      cargoLength: 4050,
    });
    // 货厢端 = 250 + 10 + 4050 = 4310 > 底盘 3700
    expect(p.actualOverallLength).toBe(4310);
    expect(p.cargoRearOverhang).toBe(4310 - 3700);
  });

  it('后悬 = 底盘长 - 前悬 - 轴距', () => {
    const p = deriveParams({
      ...INITIAL_PARAMS,
      chassisLength: 3700,
      chassisOverhangFront: 800,
      wheelbase: 2200,
    });
    expect(p.chassisOverhangRear).toBe(700);
  });
});