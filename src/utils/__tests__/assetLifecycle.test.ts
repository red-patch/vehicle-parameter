import { describe, it, expect } from 'vitest';
import type { AssetMetaMap } from '../assetManager';
import { buildSupersedeMeta, buildDeprecateMeta, buildRestoreMeta } from '../assetGovernance';

describe('buildSupersedeMeta', () => {
    it('旧版标 superseded，历史遗留 isPrimary 字段顺手清理', () => {
        const meta: AssetMetaMap = {
            'old.json': { isPrimary: true, groupName: 'V6E' } as AssetMetaMap[string],
        };
        const next = buildSupersedeMeta(meta, [{ oldFileName: 'old.json', newFileName: 'new.json' }]);
        expect(next['old.json']).toEqual({ status: 'superseded', groupName: 'V6E' });
    });

    it('原 meta 不被修改', () => {
        const meta: AssetMetaMap = { 'old.json': { status: 'superseded' } };
        const next = buildSupersedeMeta(meta, [{ oldFileName: 'old.json', newFileName: 'new.json' }]);
        expect(next['new.json']).toBeUndefined();
        expect(meta['old.json']).toEqual({ status: 'superseded' });
    });

    it('支持一次多对', () => {
        const next = buildSupersedeMeta({}, [
            { oldFileName: 'a.json', newFileName: 'n1.json' },
            { oldFileName: 'b.json', newFileName: 'n2.json' },
        ]);
        expect(next['a.json']?.status).toBe('superseded');
        expect(next['b.json']?.status).toBe('superseded');
    });
});

describe('buildDeprecateMeta', () => {
    it('标 deprecated，历史遗留 isPrimary 字段顺手清理', () => {
        const meta: AssetMetaMap = { 'x.json': { isPrimary: true, note: '保留备注' } as AssetMetaMap[string] };
        const next = buildDeprecateMeta(meta, ['x.json']);
        expect(next['x.json']).toEqual({ status: 'deprecated', note: '保留备注' });
    });
});

describe('buildRestoreMeta', () => {
    it('清除 status，保留其余标注', () => {
        const meta: AssetMetaMap = { 'x.json': { status: 'deprecated', groupName: 'V6E' } };
        const next = buildRestoreMeta(meta, ['x.json']);
        expect(next['x.json']).toEqual({ groupName: 'V6E' });
    });

    it('清空后移除条目', () => {
        const meta: AssetMetaMap = { 'x.json': { status: 'superseded' } };
        const next = buildRestoreMeta(meta, ['x.json']);
        expect(next['x.json']).toBeUndefined();
    });
});
