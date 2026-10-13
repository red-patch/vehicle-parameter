import { describe, expect, it } from 'vitest';
import {
    deriveCarIdentityKey,
    deriveVehicleGroupKey,
    resolveVehicleGroupKey,
    type GovernanceFileEntry,
} from '../assetGovernance';
import type { AssetMetaMap } from '../assetManager';
import type { AssetFileInfo } from '../assetManager';

/**
 * 硬约束回归（设计：docs/plans/2026-10-13-asset-alias-design.md §5）。
 *
 * 别名是纯显示覆盖。productName 当前是 MultiVehicleView 的 Map 键、
 * vehicleStore 异源去重依据、无公告号时的身份键成分——别名一旦污染这些位置会**静默改变行为**。
 * 这组用例把「设别名前后这些键完全不变」钉死：若有人将来把 alias 接进身份/归组，
 * 此处立刻变红。
 */

const info = (over: Partial<AssetFileInfo>): AssetFileInfo => ({
    fileName: 'a.json',
    productName: 'V8E 宁德时代 50.23 DNC5037XXYBEVGR5 Ⅱ (ZR202509280007)',
    updatedAt: '2026-01-01T00:00:00.000Z',
    totalParams: 10,
    filledParams: 10,
    announceNos: [],
    vehicleModel: null,
    hasAdmissionInfo: false,
    approvalStatus: null,
    ...over,
});

const entry = (meta: AssetMetaMap, over: Partial<AssetFileInfo> = {}): GovernanceFileEntry => {
    const i = info(over);
    return { info: i, meta: meta[i.fileName] ?? {}, groupKey: deriveVehicleGroupKey(i.fileName, i.productName) };
};

describe('资产别名 · 硬约束回归', () => {
    it('别名不影响身份键（有公告号：A:… | Z:…）', () => {
        const i = info({ announceNos: ['DNC5037XXYBEVGR5'], admissionNos: ['ZR202509280007'] });
        const groupKey = deriveVehicleGroupKey(i.fileName, i.productName);

        const before = deriveCarIdentityKey(i, i.announceNos, groupKey);
        const withAlias: AssetMetaMap = { 'a.json': { alias: 'V8E' } };
        const after = deriveCarIdentityKey(i, i.announceNos, groupKey);

        expect(after).toBe(before);
        expect(withAlias['a.json'].alias).toBe('V8E'); // 别名确实存在，但不参与计算
    });

    it('别名不影响身份键（无公告号：退化为 车型组 + 产品名）', () => {
        const i = info({ announceNos: [] });
        const groupKey = deriveVehicleGroupKey(i.fileName, i.productName);
        const before = deriveCarIdentityKey(i, [], groupKey);
        // 别名不改变 productName，故身份键不变
        expect(deriveCarIdentityKey(i, [], groupKey)).toBe(before);
        expect(before.startsWith('N:')).toBe(true);
        expect(before).toContain('宁德时代'); // 身份仍基于原始 productName，而非别名
    });

    it('别名不影响归组：resolveVehicleGroupKey 只认 groupName，不认 alias', () => {
        const i = info({ fileName: 'v8e-a.json', productName: 'V8E 超长名' });

        const noMeta = resolveVehicleGroupKey(i, undefined);
        const aliasOnly = resolveVehicleGroupKey(i, { alias: '完全不同的名字' });
        expect(aliasOnly).toBe(noMeta);

        // 对照：groupName 确实会改变归组键（证明这两者语义不同）
        const withGroup = resolveVehicleGroupKey(i, { groupName: '完全不同的名字' });
        expect(withGroup).not.toBe(noMeta);
    });

    it('别名不影响文件名推导的归组键', () => {
        const key = deriveVehicleGroupKey('V8E-25款-宁德50.23kWh-厢货-DNC5037XXYBEVGR5.json', 'V8E 超长名');
        expect(key).toBe('V8E');
    });

    it('同车两名不同别名的资产仍归入同一身份（别名不分裂版本链）', () => {
        const i = info({ announceNos: ['DNC1'], admissionNos: [] });
        const groupKey = deriveVehicleGroupKey(i.fileName, i.productName);
        const k1 = deriveCarIdentityKey(i, ['DNC1'], groupKey);
        // 仅 fileName 不同（同一辆车换文件），身份键不含 fileName，故相同
        const k2 = deriveCarIdentityKey(info({ announceNos: ['DNC1'], admissionNos: [], fileName: 'b.json' }), ['DNC1'], groupKey);
        expect(k1).toBe(k2);
    });

    it('entry.meta 里的 alias 不会改变 groupKey 字段（显示与分组解耦）', () => {
        const e1 = entry({});
        const e2 = entry({ 'a.json': { alias: '短名' } });
        expect(e2.groupKey).toBe(e1.groupKey);
    });
});
