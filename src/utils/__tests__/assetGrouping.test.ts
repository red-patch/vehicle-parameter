import { describe, it, expect } from 'vitest';
import {
    buildAssetGroups, GROUP_NONE_KEY, GROUP_NONE_LABEL,
    type AssetGroupDimContext,
} from '../assetGrouping';
import type { AssetSortRow } from '../assetSort';
import type { AssetFileInfo } from '../assetManager';
import type { ResolvedFacets } from '../assetFacets';

const row = (fileName: string, productName?: string): AssetSortRow => ({
    info: {
        fileName, productName: productName ?? fileName,
        updatedAt: null, totalParams: 0, filledParams: 0,
        announceNos: [], vehicleModel: null, hasAdmissionInfo: false, approvalStatus: null,
    } as AssetFileInfo,
    displayName: productName ?? fileName,
    groupKey: fileName,
});

/** 简易 ctx：三个资产，V6E 组两条、H8E 一条 */
const makeCtx = (overrides: Partial<AssetGroupDimContext> = {}): AssetGroupDimContext => {
    const facets = new Map<string, ResolvedFacets>();
    facets.set('v6e-a.json', { manufacturer: '吉利', vehicleFamily: '中面', batteryBrand: '宁德时代', capacityKwh: 50, admissionLevel: 'Ⅲ', announceNos: [] });
    facets.set('v6e-b.json', { manufacturer: '吉利', vehicleFamily: '中面', batteryBrand: '国轩', capacityKwh: 60, admissionLevel: 'Ⅱ', announceNos: [] });
    facets.set('h8e.json', { manufacturer: null, vehicleFamily: '大面', batteryBrand: null, capacityKwh: 70, admissionLevel: 'Ⅳ', announceNos: [] });
    return {
        vehicleGroupKey: fn => (fn.startsWith('v6e') ? 'V6E' : 'H8E'),
        vehicleGroupLabel: fn => (fn.startsWith('v6e') ? '远程V6E' : '远程H8E'),
        facets,
        metaStatus: () => undefined,
        isRejected: () => false,
        ...overrides,
    };
};

const rows = [row('v6e-a.json'), row('v6e-b.json'), row('h8e.json')];

describe('assetGrouping', () => {
    it('不分组：单组无标签，行序不变', () => {
        const groups = buildAssetGroups(rows, 'none', makeCtx());
        expect(groups).toHaveLength(1);
        expect(groups[0].label).toBe('');
        expect(groups[0].rows.map(r => r.info.fileName)).toEqual(['v6e-a.json', 'v6e-b.json', 'h8e.json']);
    });

    it('车型：同键聚合，组标签用别名，带 vehicleGroupKey', () => {
        const groups = buildAssetGroups(rows, 'vehicle', makeCtx());
        expect(groups.map(g => g.key)).toEqual(['V6E', 'H8E']); // V6E 组数量多在前
        expect(groups[0].label).toBe('远程V6E');
        expect(groups[0].rows).toHaveLength(2);
        expect(groups[0].vehicleGroupKey).toBe('V6E');
    });

    it('主机厂：缺值归（无）且垫底', () => {
        const groups = buildAssetGroups(rows, 'manufacturer', makeCtx());
        // 吉利(2条) 在前，（无）(1条) 垫底
        expect(groups[0].label).toBe('吉利');
        expect(groups[0].rows).toHaveLength(2);
        expect(groups[groups.length - 1].key).toBe(GROUP_NONE_KEY);
        expect(groups[groups.length - 1].label).toBe(GROUP_NONE_LABEL);
    });

    it('准入等级：按等级序 Ⅰ<Ⅱ<…，不是数量序', () => {
        const groups = buildAssetGroups(rows, 'admissionLevel', makeCtx());
        // Ⅲ(v6e-a) / Ⅱ(v6e-b) / Ⅳ(h8e) → 等级序应为 Ⅱ, Ⅲ, Ⅳ
        expect(groups.map(g => g.key)).toEqual(['Ⅱ', 'Ⅲ', 'Ⅳ']);
    });

    it('状态：优先级归组，废弃>历史>驳回>正常', () => {
        const ctx = makeCtx({
            metaStatus: fn => (fn === 'v6e-a.json' ? 'deprecated' : undefined),
            isRejected: info => info.fileName === 'h8e.json',
        });
        const groups = buildAssetGroups(rows, 'status', ctx);
        // 正常(v6e-b) rank0 → 驳回(h8e) rank1 → 废弃(v6e-a) rank3
        expect(groups.map(g => g.key)).toEqual(['status:active', 'status:rejected', 'status:deprecated']);
        expect(groups.map(g => g.label)).toEqual(['正常', '驳回', '已废弃']);
    });

    it('空输入返回空数组', () => {
        expect(buildAssetGroups([], 'vehicle', makeCtx())).toEqual([]);
        expect(buildAssetGroups([], 'none', makeCtx())).toEqual([]);
    });

    it('同数量组按名称 zh 升序（确定性）', () => {
        const ctx = makeCtx({
            facets: new Map([
                ['a.json', { manufacturer: '比亚迪', vehicleFamily: null, batteryBrand: null, capacityKwh: null, admissionLevel: null, announceNos: [] }],
                ['b.json', { manufacturer: '埃安', vehicleFamily: null, batteryBrand: null, capacityKwh: null, admissionLevel: null, announceNos: [] }],
            ]),
        });
        const groups = buildAssetGroups([row('a.json'), row('b.json')], 'manufacturer', ctx);
        // 数量相同（各1），按拼音：埃安 < 比亚迪
        expect(groups.map(g => g.label)).toEqual(['埃安', '比亚迪']);
    });
});
