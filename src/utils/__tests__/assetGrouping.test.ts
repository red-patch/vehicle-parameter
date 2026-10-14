import { describe, it, expect } from 'vitest';
import {
    buildAssetGroups, buildAssetGroupsMulti, GROUP_NONE_KEY, GROUP_NONE_LABEL,
    MAX_GROUP_LEVELS,
    type AssetGroupDimContext, type AssetGroupNode,
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

    describe('buildAssetGroupsMulti 多层分组', () => {
        /** 叶子节点汇总（展平所有行，验证不丢不重） */
        const collectLeafRows = (nodes: AssetGroupNode[]): string[] => nodes.flatMap(n =>
            n.children ? collectLeafRows(n.children) : (n.rows ?? []).map(r => r.info.fileName));

        it('dims 为空：单层全部节点，rows 挂根', () => {
            const nodes = buildAssetGroupsMulti(rows, [], makeCtx());
            expect(nodes).toHaveLength(1);
            expect(nodes[0].dim).toBe('none');
            expect(nodes[0].rows).toHaveLength(3);
        });

        it('dims=[none]：同"为空"（平铺）', () => {
            const nodes = buildAssetGroupsMulti(rows, ['none'], makeCtx());
            expect(nodes).toHaveLength(1);
            expect(nodes[0].rows).toHaveLength(3);
        });

        it('单层（主机厂）：等价迭代 4 单维分组', () => {
            const nodes = buildAssetGroupsMulti(rows, ['manufacturer'], makeCtx());
            expect(nodes.map(n => n.label)).toEqual(['吉利', GROUP_NONE_LABEL]);
            expect(nodes[0].rows).toHaveLength(2);
        });

        it('两层（主机厂 › 族群）：嵌套，叶子挂行', () => {
            const ctx = makeCtx();
            // v6e-a/b 都是"吉利/中面"，h8e 是"（无）/大面"
            const nodes = buildAssetGroupsMulti(rows, ['manufacturer', 'vehicleFamily'], ctx);
            const jili = nodes.find(n => n.label === '吉利')!;
            expect(jili.children).toBeDefined();
            expect(jili.children!.map(c => c.label)).toEqual(['中面']);
            expect(jili.children![0].rows).toHaveLength(2);
            // 无 manufacturer 的那个归（无），其下族群"大面"
            const none = nodes.find(n => n.key === GROUP_NONE_KEY)!;
            expect(none.children![0].label).toBe('大面');
        });

        it('三层（主机厂 › 族群 › 准入等级）：路径键逐级拼接、行不丢不重', () => {
            const nodes = buildAssetGroupsMulti(rows, ['manufacturer', 'vehicleFamily', 'admissionLevel'], makeCtx());
            // 三层后叶子行数 = 总行数
            expect(collectLeafRows(nodes).sort()).toEqual(['h8e.json', 'v6e-a.json', 'v6e-b.json']);
            // 路径键含 \u0000 分隔、层级递增
            const jili = nodes.find(n => n.label === '吉利')!;
            const mid = jili.children![0];
            const leaf = mid.children![0];
            expect(jili.pathKey).toBe('吉利');
            expect(mid.pathKey).toBe(`吉利\u0000中面`);
            expect(leaf.pathKey).toBe(`吉利\u0000中面\u0000${leaf.key}`);
        });

        it('dims 超过上限被截断到 MAX_GROUP_LEVELS', () => {
            const nodes = buildAssetGroupsMulti(
                rows,
                ['manufacturer', 'vehicleFamily', 'admissionLevel', 'batteryBrand'],
                makeCtx());
            // 截断到 3 层：最深叶子在第 3 层（无 children）
            const depth = (n: AssetGroupNode): number => 1 + (n.children ? Math.max(...n.children.map(depth)) : 0);
            expect(Math.max(...nodes.map(depth))).toBe(MAX_GROUP_LEVELS);
        });

        it('两层组序：每层各自按数量降序', () => {
            const ctx = makeCtx({
                facets: new Map([
                    // 吉利 3 条（中面2+大面1），比亚迪 1 条
                    ['g1', { manufacturer: '吉利', vehicleFamily: '中面', batteryBrand: null, capacityKwh: null, admissionLevel: null, announceNos: [] }],
                    ['g2', { manufacturer: '吉利', vehicleFamily: '中面', batteryBrand: null, capacityKwh: null, admissionLevel: null, announceNos: [] }],
                    ['g3', { manufacturer: '吉利', vehicleFamily: '大面', batteryBrand: null, capacityKwh: null, admissionLevel: null, announceNos: [] }],
                    ['b1', { manufacturer: '比亚迪', vehicleFamily: '中面', batteryBrand: null, capacityKwh: null, admissionLevel: null, announceNos: [] }],
                ]),
            });
            const nodes = buildAssetGroupsMulti(
                [row('g1'), row('g2'), row('g3'), row('b1')], ['manufacturer', 'vehicleFamily'], ctx);
            // 一层：吉利(3) 在 比亚迪(1) 前
            expect(nodes.map(n => n.label)).toEqual(['吉利', '比亚迪']);
            // 二层（吉利下）：中面(2) 在 大面(1) 前
            expect(nodes[0].children!.map(c => c.label)).toEqual(['中面', '大面']);
        });
    });
});
