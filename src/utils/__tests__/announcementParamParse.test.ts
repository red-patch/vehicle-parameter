import { describe, expect, it } from 'vitest';
import {
    OTHER_PARAM_GROUP,
    normalizeOtherParams,
    splitOtherParamValue,
} from '../announcementParamParse';
import type { VehicleParameter } from '../../types';

/** 真实公告「其它」格原文（DNC5037XXYBEVP1 型纯电动厢式运输车，第407批） */
const SAMPLE =
    '1.储能装置种类/生产企业(单体/总成):磷酸铁锂蓄电池/宁德时代新能源科技股份有限公司,成都市新津时代新能源科技有限公司;' +
    '2.驱动电机额定功率/峰值功率:35kW/70kW;' +
    '3.ABS型号/生产企业:RL-108/温州瑞立科密汽车电子有限公司,YF8/武汉元丰汽车电控系统股份有限公司;' +
    '4.该车配备汽车事件数据记录系统(EDR);' +
    '5.可选装ETC装置;' +
    '6.选装车轮装饰罩,选装轮辋及轴头盖样式,选装前围装饰亮条,选装高位制动灯样式,选装不同样式门铰链,选装标识样式,选装或取消门吸,可取消倒车雷达,选装或取消监控装置,可取消或选装玻璃黑边,选装前脸外观,选装前部灯具,选装或取消天线,选装车身牌照区域样式,选装玻璃样式,选装或取消车身字标,选装倒车雷达位置及数量,选装前围造型,选装侧面车窗样式,选装后部摄像头;' +
    '7.第二、三排座椅采用可折叠结构,不可翻转,车内行李区纵向长度1160mm;车顶外覆盖件最大离地高度1985mm.';

describe('splitOtherParamValue', () => {
    it('splits the real announcement sample', () => {
        const subs = splitOtherParamValue(SAMPLE);
        expect(subs).toHaveLength(8);

        // 键:值 明细取键为参数名，尾括号剥掉（与规范字段名/资产侧对齐）
        expect(subs[0]).toEqual({
            name: '储能装置种类/生产企业',
            value: '磷酸铁锂蓄电池/宁德时代新能源科技股份有限公司,成都市新津时代新能源科技有限公司',
        });
        expect(subs[1]).toEqual({ name: '驱动电机额定功率/峰值功率', value: '35kW/70kW' });
        expect(subs[2]).toEqual({
            name: 'ABS型号/生产企业',
            value: 'RL-108/温州瑞立科密汽车电子有限公司,YF8/武汉元丰汽车电控系统股份有限公司',
        });

        // 叙述式明细保留全文，名用原文序号
        expect(subs[3]).toEqual({ name: '其它-4', value: '该车配备汽车事件数据记录系统(EDR)' });
        expect(subs[4]).toEqual({ name: '其它-5', value: '可选装ETC装置' });
        expect(subs[5].name).toBe('其它-6');
        expect(subs[5].value).toContain('选装车轮装饰罩');
        expect(subs[5].value).toContain('选装后部摄像头');
        expect(subs[6]).toEqual({
            name: '其它-7',
            value: '第二、三排座椅采用可折叠结构,不可翻转,车内行李区纵向长度1160mm',
        });
        // 无序号的分号片段（7 的续写）按出现位置续号，不被当成第 7 条吞掉
        expect(subs[7]).toEqual({ name: '其它-8', value: '车顶外覆盖件最大离地高度1985mm' });
    });

    it('splits dot-separated lists without leak of item numbers', () => {
        const subs = splitOtherParamValue(
            '1.储能装置种类/生产企业:磷酸铁锂蓄电池.2.驱动电机额定功率/峰值功率:35kW/70kW.3.ABS型号/生产企业:RL-108',
        );
        expect(subs.map(s => s.name)).toEqual([
            '储能装置种类/生产企业',
            '驱动电机额定功率/峰值功率',
            'ABS型号/生产企业',
        ]);
        expect(subs[0].value).toBe('磷酸铁锂蓄电池');
        expect(subs[2].value).toBe('RL-108');
    });

    it('does not eat decimal points', () => {
        const subs = splitOtherParamValue('1.排量:1.5L;2.整备质量:3.5t;3.轴距:3360');
        expect(subs).toHaveLength(3);
        expect(subs[0].value).toBe('1.5L');
        expect(subs[1].value).toBe('3.5t');
        expect(subs[2].value).toBe('3360');
    });

    it('handles full-width colon and semicolon', () => {
        const subs = splitOtherParamValue('1.储能装置种类/生产企业：宁德时代；2.驱动电机额定功率/峰值功率：35kW');
        expect(subs).toEqual([
            { name: '储能装置种类/生产企业', value: '宁德时代' },
            { name: '驱动电机额定功率/峰值功率', value: '35kW' },
        ]);
    });

    it('glues line-wrapped text (PDF/表格复制噪声)', () => {
        const subs = splitOtherParamValue(
            '1.储能装置种类/生产企业(单体/总成):磷酸铁锂蓄电池/宁德时代新能源科技股份\n有限公司;2.ABS型号/生产企业:RL-108',
        );
        expect(subs[0].value).toBe('磷酸铁锂蓄电池/宁德时代新能源科技股份有限公司');
        expect(subs[1]).toEqual({ name: 'ABS型号/生产企业', value: 'RL-108' });
    });

    it('strips trailing bracket variants but keeps names that would become empty', () => {
        expect(splitOtherParamValue('1.储能装置种类/生产企业（单体/总成）:宁德时代')[0].name)
            .toBe('储能装置种类/生产企业');
        expect(splitOtherParamValue('1.备注(仅用于测试):见附件')[0].name).toBe('备注');
    });

    it('returns nothing for a single narrative or empty value', () => {
        expect(splitOtherParamValue('该车配备汽车事件数据记录系统(EDR)')).toEqual([]);
        expect(splitOtherParamValue('')).toEqual([]);
        expect(splitOtherParamValue(null)).toEqual([]);
        expect(splitOtherParamValue('5.可选装ETC装置')).toEqual([]);
    });

    it('keeps a single key:value item', () => {
        expect(splitOtherParamValue('储能装置种类/生产企业:宁德时代新能源科技股份有限公司')).toEqual([
            { name: '储能装置种类/生产企业', value: '宁德时代新能源科技股份有限公司' },
        ]);
    });
});

const param = (name: string, value: string, group = '工信部数据'): VehicleParameter => ({
    id: `p-${name}`,
    group,
    name,
    value,
});

describe('normalizeOtherParams', () => {
    it('keeps the original blob and appends split sub params', () => {
        const params = [param('产品名称', '纯电动厢式运输车'), param('其它', SAMPLE)];
        const out = normalizeOtherParams(params);
        expect(out).toHaveLength(2 + 8);
        expect(out[1]).toBe(params[1]); // 原文整格仍在原位
        expect(out[2].group).toBe(OTHER_PARAM_GROUP);
        expect(out[2].name).toBe('储能装置种类/生产企业');
        expect(out[2].id).toBe('p-其它-sub-1');
    });

    it('handles the 其他 variant and copies provenance fields', () => {
        const params = [{
            ...param('其他', '1.储能装置种类/生产企业:宁德时代;2.驱动电机额定功率/峰值功率:35kW'),
            productName: '远程V8E',
            originSheet: '工信部官网',
        }];
        const out = normalizeOtherParams(params);
        expect(out.map(p => p.name)).toEqual([
            '其他',
            '储能装置种类/生产企业',
            '驱动电机额定功率/峰值功率',
        ]);
        expect(out[1].productName).toBe('远程V8E');
        expect(out[1].originSheet).toBe('工信部官网');
    });

    it('is idempotent — already split records are returned untouched', () => {
        const once = normalizeOtherParams([param('其它', SAMPLE)]);
        const twice = normalizeOtherParams(once);
        expect(twice).toBe(once);
        expect(twice.filter(p => p.name === '储能装置种类/生产企业')).toHaveLength(1);
    });

    it('returns the same reference when there is nothing to split', () => {
        const params = [param('产品名称', '纯电动厢式运输车')];
        expect(normalizeOtherParams(params)).toBe(params);
        expect(normalizeOtherParams([])).toEqual([]);
    });
});
