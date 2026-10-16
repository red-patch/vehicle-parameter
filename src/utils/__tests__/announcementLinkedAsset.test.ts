import { describe, expect, it } from 'vitest';
import { describeLinkedAsset, type JoinedAsset } from '../announcementGrouping';

const asset = (over: Partial<JoinedAsset> = {}): JoinedAsset => ({
    fileName: 'V6E 宁德时代新能源科技股份有限公司 41.86 DNC5037XXYBEVP1 Ⅲ2.json',
    productName: 'V6E 宁德时代新能源科技股份有限公司 41.86 DNC5037XXYBEVP1 Ⅲ2',
    ...over,
});

describe('describeLinkedAsset', () => {
    it('绝不把内部文件名（.json）泄露给用户', () => {
        const out = describeLinkedAsset(asset());
        expect(out).not.toContain('.json');
        expect(out).toBe('V6E 宁德时代新能源科技股份有限公司 41.86 DNC5037XXYBEVP1 Ⅲ2');
    });

    it('车型名与文件名同源时不重复展示（真实数据两者只差扩展名）', () => {
        const out = describeLinkedAsset(asset());
        expect(out.match(/DNC5037XXYBEVP1/g)).toHaveLength(1);
    });

    it('补齐参数量与完成率', () => {
        const out = describeLinkedAsset(asset({ totalParams: 62, filledParams: 62 }));
        expect(out).toContain('62 参数');
        expect(out).toContain('100%');
    });

    it('完成率四舍五入取整；无参数量时不显示段', () => {
        expect(describeLinkedAsset(asset({ totalParams: 3, filledParams: 2 }))).toContain('67%');
        expect(describeLinkedAsset(asset())).not.toContain('参数');
    });

    it('totalParams 为 0 时不产生 NaN', () => {
        const out = describeLinkedAsset(asset({ totalParams: 0, filledParams: 0 }));
        expect(out).not.toContain('NaN');
        expect(out).not.toContain('参数');
    });

    it('带更新时间则展示，缺省则省略该段', () => {
        expect(describeLinkedAsset(asset({ updatedAt: '2026-10-02T13:25:00Z' }))).toMatch(/\d{2}:\d{2}|\d{4}/);
        expect(describeLinkedAsset(asset({ updatedAt: null })).split(' · ')).toHaveLength(1);
    });

    it('productName 为空时回落到去扩展名的文件名，而不是留空', () => {
        const out = describeLinkedAsset(asset({ productName: '' }));
        expect(out).toBe('V6E 宁德时代新能源科技股份有限公司 41.86 DNC5037XXYBEVP1 Ⅲ2');
    });
});
