import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchItem } from '../../types';

let useVehicleStore: typeof import('../vehicleStore').useVehicleStore;

const makeItem = (manualValue?: string): MatchItem => ({
  id: 'm1',
  requirementName: '增强器冷却方式',
  matchedParam: {
    id: 'p1',
    name: '增强器冷却方式',
    value: 'N/A',
    group: '测试',
  } as unknown as MatchItem['matchedParam'],
  confidence: 1,
  isManual: false,
  manualValue,
});

/**
 * bugfix 回归测试（2026-09-16）：
 * 智能填报切到手动模式后不填任何内容，导出值应为空值，
 * 而不是回退到自动匹配值（如 N/A）。
 */
describe('updateManualValue 显式空值', () => {
  beforeAll(async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });

    ({ useVehicleStore } = await import('../vehicleStore'));
  });

  beforeEach(() => {
    useVehicleStore.setState({ matchResults: [makeItem()] });
  });

  it('手动模式传 explicitEmpty=true 时，空值固化为显式空值，不回退 N/A', () => {
    useVehicleStore.getState().updateManualValue('m1', '', { explicitEmpty: true });
    const m = useVehicleStore.getState().matchResults[0];
    expect(m.manualValue).toBe('');
    expect(m.isManual).toBe(true);
  });

  it('非手动模式下空值仍恢复自动匹配（回退 N/A）', () => {
    useVehicleStore.getState().updateManualValue('m1', '   ');
    const m = useVehicleStore.getState().matchResults[0];
    expect(m.manualValue).toBeUndefined();
    expect(m.isManual).toBe(false);
  });

  it('显式空值撤销：传空且不带 explicitEmpty → 清除手动值', () => {
    useVehicleStore.getState().updateManualValue('m1', '', { explicitEmpty: true });
    useVehicleStore.getState().updateManualValue('m1', '');
    const m = useVehicleStore.getState().matchResults[0];
    expect(m.manualValue).toBeUndefined();
  });

  it('explicitEmpty 不影响正常非空填报', () => {
    useVehicleStore.getState().updateManualValue('m1', '水冷', { explicitEmpty: true });
    const m = useVehicleStore.getState().matchResults[0];
    expect(m.manualValue).toBe('水冷');
    expect(m.isManual).toBe(true);
  });
});
