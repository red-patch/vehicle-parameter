import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { SheetParseConfig } from '../../types';
import { parseWorkbook, parseWorkbookWithConfig, detectWorkbookOrientation } from '../excelParser';
import {
    detectHorizontalSheet,
    parseHorizontalSheet,
    HORIZONTAL_METADATA_GROUP,
    HORIZONTAL_DEFAULT_GROUP
} from '../excelParserHorizontal';

// ===================== 测试数据 =====================

/** 仿「产品准入导出」结构：12 个元数据列 + 参数列（含命名模板用列） */
const HORIZONTAL_HEADERS = [
    '项目代号', '产品等级标准', '需求描述', '车辆类型', '审批状态', '准入编号',
    '状态', '整车公告号', '公告号id', '品牌', '型号', '公告批次',
    '电瓶类型', '动力电池包厂商', '动力电池包电量（kWh）', '电机型号', '电机效率', '冷厢长度（mm）'
];

const HORIZONTAL_ROWS: unknown[][] = [
    HORIZONTAL_HEADERS,
    ['PJZM1', 'Ⅱ', '', '全新车型', '已审核', 'ZR001', '启用', 'JL6481BEV100', 'GGH1', '远程牌', 'V6E客运版', '404', '铅酸电池', '宁德时代新能源科技股份有限公司', 41.86, 'TZ180XSZX05', 0.95, 3000],
    ['PJZM2', 'Ⅱ', '', '全新车型', '已审核', 'ZR002', '启用', 'JHC6480BEV22', 'GGH2', '远程牌', 'V6E客运版', '406', '铅酸电池', '宁德时代新能源科技股份有限公司', 41.86, 'TZ180XSZX05', 0.95, 3200],
    ['PJZM3', 'Ⅲ', '', '改进车型', '已审核', 'ZR003', '启用', 'DNC5037XXYBEVP1', 'GGH3', '远程牌', 'V6E', '398', null, '宁德时代新能源股份有限公司', 41.86, 'TZ180XSZX05', '/', '/'],
];

const wbFromSheets = (sheets: Record<string, unknown[][]>): XLSX.WorkBook => {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    }
    return wb;
};

const productNamesOf = (data: { productName?: string }[]): string[] =>
    Array.from(new Set(data.map(p => p.productName || '')));

// ===================== 检测 =====================

describe('detectHorizontalSheet', () => {
    it('识别产品准入导出式横向表（表头在第 1 行）', () => {
        const info = detectHorizontalSheet(HORIZONTAL_ROWS);
        expect(info).not.toBeNull();
        expect(info!.headerRowIndex).toBe(0);
        expect(info!.totalCols).toBe(HORIZONTAL_HEADERS.length);
    });

    it('跳过窄标题行，识别第 2 行的表头', () => {
        const rows: unknown[][] = [['产品准入导出'], ...HORIZONTAL_ROWS];
        const info = detectHorizontalSheet(rows);
        expect(info).not.toBeNull();
        expect(info!.headerRowIndex).toBe(1);
    });

    it('表头无车型标识列时不判横向', () => {
        const rows = HORIZONTAL_ROWS.map(row => {
            const copy = [...row];
            copy[5] = '准入号码';   // 准入编号 → 非标识表头
            copy[7] = '公告标识码'; // 整车公告号 → 非标识表头
            copy[10] = '车辆名称';  // 型号 → 非标识表头
            return copy;
        });
        expect(detectHorizontalSheet(rows)).toBeNull();
    });

    it('纵向表头行（含"参数项名称"）不会被误判', () => {
        const wideHeader = ['参数项名称', ...Array.from({ length: 12 }, (_, i) => `产品${i + 1}`)];
        const rows: unknown[][] = [wideHeader, ['型号', ...Array.from({ length: 12 }, (_, i) => `X${i}`)]];
        expect(detectHorizontalSheet(rows)).toBeNull();
    });

    it('弱表头（仅"名称"）的宽纵向表不会被误判', () => {
        const wideHeader = ['名称', ...Array.from({ length: 12 }, (_, i) => `产品${i + 1}`)];
        const rows: unknown[][] = [wideHeader, ['型号', ...Array.from({ length: 12 }, (_, i) => `X${i}`)]];
        expect(detectHorizontalSheet(rows)).toBeNull();
    });

    it('列数不足时不判横向（键值对等窄表）', () => {
        const rows: unknown[][] = [
            ['参数', '值'],
            ['型号', 'X1'],
            ['轴距（mm）', 3000],
            ['电机类型', '永磁'],
            ['电池品牌', 'A'],
        ];
        expect(detectHorizontalSheet(rows)).toBeNull();
    });
});

// ===================== 解析 =====================

describe('parseHorizontalSheet', () => {
    const parse = (rows: unknown[][] = HORIZONTAL_ROWS) => {
        const info = detectHorizontalSheet(rows)!;
        return parseHorizontalSheet(rows, info, { sheetName: 'part0' });
    };

    it('车型名按模板拼接：型号 + 电池厂商 + 电量 + 整车公告号 + 产品等级标准', () => {
        const params = parse();
        expect(productNamesOf(params)).toEqual([
            'V6E客运版 宁德时代新能源科技股份有限公司 41.86 JL6481BEV100 Ⅱ',
            'V6E客运版 宁德时代新能源科技股份有限公司 41.86 JHC6480BEV22 Ⅱ',
            'V6E 宁德时代新能源股份有限公司 41.86 DNC5037XXYBEVP1 Ⅲ',
        ]);
    });

    it('元数据列归「准入信息」，参数列归「基础信息」', () => {
        const params = parse();
        const first = params.filter(p => p.productName?.includes('JL6481BEV100'));
        expect(first).toHaveLength(HORIZONTAL_HEADERS.length);
        const groups = new Map<string, number>();
        first.forEach(p => groups.set(p.group, (groups.get(p.group) || 0) + 1));
        expect(groups.get(HORIZONTAL_METADATA_GROUP)).toBe(12);
        expect(groups.get(HORIZONTAL_DEFAULT_GROUP)).toBe(6);
        expect(first.find(p => p.name === '型号')?.group).toBe(HORIZONTAL_METADATA_GROUP);
        expect(first.find(p => p.name === '电瓶类型')?.group).toBe(HORIZONTAL_DEFAULT_GROUP);
    });

    it('数值转字符串、空值与"/"原样保留', () => {
        const params = parse();
        const first = params.filter(p => p.productName?.includes('JL6481BEV100'));
        expect(first.find(p => p.name === '动力电池包电量（kWh）')?.value).toBe('41.86');
        expect(first.find(p => p.name === '冷厢长度（mm）')?.value).toBe('3000');
        expect(first.find(p => p.name === '公告批次')?.value).toBe('404');

        const third = params.filter(p => p.productName?.includes('DNC5037'));
        expect(third.find(p => p.name === '电瓶类型')?.value).toBe('');
        expect(third.find(p => p.name === '冷厢长度（mm）')?.value).toBe('/');
    });

    it('命名部分重复时用准入编号去重', () => {
        const rows: unknown[][] = [
            HORIZONTAL_HEADERS,
            ['PJZM1', 'Ⅱ', '', '全新车型', '已审核', 'ZR001', '启用', 'JL6480BEV22', 'GGH1', '远程牌', 'V6E', '404', '铅酸电池', '宁德时代', 41.86, 'TZ', 0.95, 3000],
            ['PJZM2', 'Ⅱ', '', '全新车型', '已审核', 'ZR002', '启用', 'JL6480BEV22', 'GGH2', '远程牌', 'V6E', '406', '铅酸电池', '宁德时代', 41.86, 'TZ', 0.95, 3000],
        ];
        const names = productNamesOf(parse(rows));
        expect(names[0]).toBe('V6E 宁德时代 41.86 JL6480BEV22 Ⅱ');
        expect(names[1]).toBe('V6E 宁德时代 41.86 JL6480BEV22 Ⅱ (ZR002)');
    });

    it('命名部分全空时回退为行号', () => {
        // 标识列（准入编号/整车公告号）在首行有值以满足检测，第二行命名部分全空
        const rows: unknown[][] = [
            HORIZONTAL_HEADERS,
            ['', '', '', '', '', 'ZR001', '', 'JL6480BEV22', '', '', '', '', '铅酸电池', '', '', '', '', ''],
            ['', '', '', '', '', '', '', '', '', '', '', '', '铅酸电池', '', '', '', '', ''],
        ];
        const params = parse(rows);
        expect(productNamesOf(params)).toEqual(['JL6480BEV22', '第3行']);
    });

    it('完全空行不生成车型', () => {
        const rows: unknown[][] = [
            HORIZONTAL_HEADERS,
            HORIZONTAL_ROWS[1],
            [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
            HORIZONTAL_ROWS[2],
        ];
        expect(productNamesOf(parse(rows))).toHaveLength(2);
    });

    it('参数带 originSheet/productName 且 id 沿用 sheet::产品::分组::参数 惯例', () => {
        const params = parse();
        const p = params[0];
        expect(p.originSheet).toBe('part0');
        expect(p.id).toBe(`part0::${p.productName}::${p.group}::${p.name}`);
    });
});

// ===================== parseWorkbook 集成（自动模式） =====================

describe('parseWorkbook 横向集成', () => {
    it('自动识别横向工作簿并解析出多车型', () => {
        const result = parseWorkbook(wbFromSheets({ '产品准入导出_part0': HORIZONTAL_ROWS }), '产品准入导出.xlsx');
        expect(productNamesOf(result.data)).toHaveLength(3);
        expect(result.data).toHaveLength(3 * HORIZONTAL_HEADERS.length);
        // 百分比还原经 parseWorkbook 注入生效
        expect(result.data.find(p => p.name === '电机效率' && p.productName?.includes('JL6481BEV100'))?.value).toBe('95%');
    });

    it('纵向表保持原有解析行为（回归）', () => {
        const rows: unknown[][] = [
            ['参数项名称', '产品A', '产品B'],
            ['型号', 'X1', 'X2'],
            ['轴距（mm）', 3000, 3100],
        ];
        const result = parseWorkbook(wbFromSheets({ Sheet1: rows }), 'vertical.xlsx');
        expect(productNamesOf(result.data).sort()).toEqual(['产品A', '产品B']);
        expect(result.data.find(p => p.name === '轴距（mm）' && p.productName === '产品B')?.value).toBe('3100');
    });

    it('宽纵向表（12 个产品列）不被横向误判', () => {
        const wideHeader = ['参数项名称', ...Array.from({ length: 12 }, (_, i) => `产品${i + 1}`)];
        const rows: unknown[][] = [
            wideHeader,
            ['型号', ...Array.from({ length: 12 }, (_, i) => `X${i + 1}`)],
            ['轴距（mm）', ...Array.from({ length: 12 }, (_, i) => 3000 + i)],
        ];
        const result = parseWorkbook(wbFromSheets({ Sheet1: rows }), 'wide.xlsx');
        expect(productNamesOf(result.data)).toHaveLength(12);
        expect(result.data.find(p => p.name === '型号' && p.productName === '产品1')?.value).toBe('X1');
    });

    it('键值对表保持原有解析行为（回归）', () => {
        const rows: unknown[][] = [
            ['基本信息'],
            ['车型', 'X1'],
            ['轴距（mm）', '3000'],
            ['电机类型', '永磁'],
            ['电池品牌', 'A'],
            ['整备质量（kg）', '1800'],
        ];
        const result = parseWorkbook(wbFromSheets({ Sheet1: rows }), 'kv.xlsx');
        expect(productNamesOf(result.data)).toHaveLength(1);
        expect(result.data.find(p => p.name === '轴距（mm）')?.value).toBe('3000');
    });

    it('横向分片（每片单车型）不会被跨 sheet 合并成一个产品', () => {
        const part0: unknown[][] = [HORIZONTAL_HEADERS, HORIZONTAL_ROWS[1]];
        const part1: unknown[][] = [HORIZONTAL_HEADERS, HORIZONTAL_ROWS[3]];
        const result = parseWorkbook(
            wbFromSheets({ '导出_part0': part0, '导出_part1': part1 }),
            '产品准入导出.xlsx'
        );
        const names = productNamesOf(result.data);
        expect(names).toHaveLength(2);
    });
});

// ===================== parseWorkbookWithConfig（横向覆盖列配置） =====================

describe('parseWorkbookWithConfig 横向覆盖', () => {
    it('横向 sheet 忽略列角色配置，按横向解析', () => {
        const wb = wbFromSheets({ Sheet1: HORIZONTAL_ROWS });
        const bogus: SheetParseConfig[] = [{
            sheetName: 'Sheet1',
            headerRows: [0],
            dataStartRow: 1,
            nameColIndex: 0,
            groupColIndex: -1,
            productColumns: [{ index: 1, name: '错误产品名' }]
        }];
        const result = parseWorkbookWithConfig(wb, 'test.xlsx', bogus);
        const names = productNamesOf(result.data);
        expect(names).toHaveLength(3);
        expect(names).not.toContain('错误产品名');
        expect(result.data.some(p => p.group === HORIZONTAL_METADATA_GROUP)).toBe(true);
    });
});

// ===================== detectWorkbookOrientation =====================

describe('detectWorkbookOrientation', () => {
    it('全横向 → horizontal', () => {
        expect(detectWorkbookOrientation(wbFromSheets({ part0: HORIZONTAL_ROWS }))).toBe('horizontal');
    });

    it('全纵向 → vertical', () => {
        const rows: unknown[][] = [['参数项名称', '产品A'], ['型号', 'X1']];
        expect(detectWorkbookOrientation(wbFromSheets({ Sheet1: rows }))).toBe('vertical');
    });

    it('纵向 + 横向混合 → mixed', () => {
        const wb = wbFromSheets({
            Sheet1: [['参数项名称', '产品A'], ['型号', 'X1']],
            Sheet2: HORIZONTAL_ROWS,
        });
        expect(detectWorkbookOrientation(wb)).toBe('mixed');
    });

    it('无内容 → empty', () => {
        expect(detectWorkbookOrientation(wbFromSheets({ Sheet1: [] }))).toBe('empty');
    });
});

// ===================== 大表回归 =====================

describe('parseWorkbook 横向大表', () => {
    it('参数量超过函数实参上限时不爆栈（push 展开回归：478×504 的产品准入导出实测爆栈）', () => {
        const extraParamCols = 482;   // 18 个标准列 + 482 = 500 列
        const dataRowCount = 480;     // 480 × 500 = 240,000 条参数，超 V8 实参数量上限
        const headers = [...HORIZONTAL_HEADERS, ...Array.from({ length: extraParamCols }, (_, i) => `参数${i + 1}`)];
        const rows: unknown[][] = [headers];
        for (let r = 0; r < dataRowCount; r++) {
            const row: unknown[] = [
                'PJZM', 'Ⅱ', '', '全新车型', '已审核', `ZR${r + 1}`, '启用',
                `JL6481BEV${r}`, 'GGH', '远程牌', 'V6E客运版', '404',
            ];
            row.length = headers.length;
            row.fill('v', 12);
            rows.push(row);
        }

        const result = parseWorkbook(wbFromSheets({ 产品准入导出_part0: rows }), '产品准入导出大表.xlsx');
        expect(result.data.length).toBe(dataRowCount * headers.length);
        expect(productNamesOf(result.data)).toHaveLength(dataRowCount);
    });
});
