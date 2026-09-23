import type { VehicleParameter } from '../types';

/**
 * 横向格式解析器（如公司"产品准入导出"系统）
 *
 * 布局特征：第 1 行为表头（车型标识列 + 元数据列 + 参数名列），
 * 之后每行是一个车型、每列是一个参数——与纵向格式（参数名一列、产品多列）互为转置。
 *
 * 本模块只做检测与行→参数的转换；百分比还原等通用转换由 excelParser.ts
 * 通过 convertValue 注入，避免模块间循环依赖。
 */

// ===================== 常量（公司导出格式微调时改这里） =====================

/** 判定横向所需的最小列数；低于该宽度一律走纵向/键值对路径 */
const HORIZONTAL_MIN_COLS = 10;

/** 表头候选行只检查前 N 列的填充率与标识列 */
const HEADER_CHECK_WINDOW = 20;

/** 车型标识表头（精确匹配，出现在表头前 HEADER_CHECK_WINDOW 列内即视为横向信号） */
const IDENTITY_HEADERS = ['型号', '车型型号', '产品型号', '车辆型号', '整车公告号', '公告号', '公告型号', '准入编号', 'VIN'];

/** 纵向表强关键词：候选表头行含这些列时绝不判横向（防止纵向表头被误吞） */
const VERTICAL_KEYWORD_BLOCKERS = ['参数项名称', '参数名', 'parameter name', '功能项', '清单', '类别', '分组'];

/** 准入记录元数据表头（精确匹配）；这些列的参数归入「准入信息」分组 */
export const HORIZONTAL_METADATA_HEADERS = new Set([
    '项目代号', '产品等级标准', '需求描述', '车辆类型', '审批状态', '准入编号',
    '状态', '整车公告号', '公告号id', '品牌', '型号', '公告批次',
]);

/** 元数据分组名 */
export const HORIZONTAL_METADATA_GROUP = '准入信息';

/** 参数列默认分组名 */
export const HORIZONTAL_DEFAULT_GROUP = '基础信息';

/** 车型重名时的去重列（精确匹配） */
const DEDUPE_HEADER = '准入编号';

export interface ProductNamePart {
    /** 表头精确匹配（trim 后全等） */
    exact: string[];
    /** 精确未命中时的正则兜底（锚定整列，避免"电机型号"误配"型号"） */
    loose?: RegExp;
}

/**
 * 车型命名模板：按顺序取列值、非空部分用空格拼接。
 * 例：`V6E客运版 宁德时代新能源科技股份有限公司 41.86 JL6481BEV100 Ⅱ`
 */
export const HORIZONTAL_PRODUCT_NAME_PARTS: ProductNamePart[] = [
    { exact: ['型号'], loose: /^(车辆|车型|产品)型号$/ },
    { exact: ['动力电池包厂商'], loose: /^动力电池.{0,6}厂商$/ },
    { exact: ['动力电池包电量（kWh）', '动力电池包电量(kWh)', '动力电池包电量'], loose: /^动力电池.{0,6}电量/ },
    { exact: ['整车公告号'], loose: /^整车?公告号$/ },
    { exact: ['产品等级标准'], loose: /等级/ },
];

// ===================== 检测 =====================

export interface HorizontalSheetInfo {
    headerRowIndex: number;
    totalCols: number;
}

const isFilled = (cell: unknown): boolean =>
    cell !== undefined && cell !== null && String(cell).trim() !== '';

/**
 * 检测 sheet 是否为横向格式（参数为列、车型为行）。
 *
 * 只检查前 10 行内第一个达到最小宽度的非空行（其上的窄行视为标题行），
 * 且该行必须同时满足：宽度达标、前 20 列填充率 ≥ 80%、含车型标识表头、
 * 不含纵向强关键词列，并且标识列下方确有数据。
 * 纵向表（表头行含"参数项名称"等、或无车型标识表头）不会被误判。
 */
export const detectHorizontalSheet = (rows: unknown[][]): HorizontalSheetInfo | null => {
    // 找表头候选行：第一个宽度达标的非空行
    let candidateIdx = -1;
    let totalCols = 0;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i] || [];
        if (!row.some(isFilled)) continue;
        if (row.length >= HORIZONTAL_MIN_COLS) {
            candidateIdx = i;
            totalCols = row.length;
            break;
        }
    }
    if (candidateIdx === -1) return null;

    const headerRow = (rows[candidateIdx] || []).map(c =>
        (c === undefined || c === null) ? '' : String(c).trim()
    );
    const checkWidth = Math.min(headerRow.length, HEADER_CHECK_WINDOW);
    if (checkWidth < HORIZONTAL_MIN_COLS) return null;

    // 表头填充率（前 20 列 ≥ 80%）
    const filled = headerRow.slice(0, checkWidth).filter(h => h !== '').length;
    if (filled / checkWidth < 0.8) return null;

    // 纵向强关键词列 → 交给纵向解析
    const blocked = headerRow.slice(0, checkWidth).some(h =>
        h !== '' && VERTICAL_KEYWORD_BLOCKERS.some(kw => h.toLowerCase().includes(kw))
    );
    if (blocked) return null;

    // 车型标识表头（精确匹配）
    const identityIdx = headerRow.slice(0, checkWidth).findIndex(h => IDENTITY_HEADERS.includes(h));
    if (identityIdx === -1) return null;

    // 标识列下方必须有数据（排除恰好很宽的普通文本行）
    const hasData = (rows.slice(candidateIdx + 1, candidateIdx + 11) || [])
        .some(row => isFilled((row || [])[identityIdx]));
    if (!hasData) return null;

    return { headerRowIndex: candidateIdx, totalCols };
};

// ===================== 解析 =====================

export interface HorizontalParseOptions {
    sheetName: string;
    /** 值转换（百分比还原等），由调用方注入；缺省原样转字符串 */
    convertValue?: (value: unknown, name: string) => string | number;
}

const findPartColumn = (headers: string[], part: ProductNamePart, used: Set<number>): number => {
    for (const exact of part.exact) {
        const idx = headers.indexOf(exact);
        if (idx !== -1 && !used.has(idx)) return idx;
    }
    if (part.loose) {
        const idx = headers.findIndex((h, i) => !used.has(i) && h !== '' && part.loose!.test(h));
        if (idx !== -1) return idx;
    }
    return -1;
};

/**
 * 解析横向 sheet：每个数据行 → 一个车型，每个非空表头列 → 一条参数。
 * 元数据列（HORIZONTAL_METADATA_HEADERS）归「准入信息」，其余归「基础信息」。
 */
export const parseHorizontalSheet = (
    rows: unknown[][],
    info: HorizontalSheetInfo,
    opts: HorizontalParseOptions
): VehicleParameter[] => {
    const { sheetName, convertValue } = opts;
    const headers = (rows[info.headerRowIndex] || []).map(c =>
        (c === undefined || c === null) ? '' : String(c).trim()
    );

    // 车型命名各部分对应的列
    const usedCols = new Set<number>();
    const partCols = HORIZONTAL_PRODUCT_NAME_PARTS.map(part => {
        const idx = findPartColumn(headers, part, usedCols);
        if (idx !== -1) usedCols.add(idx);
        return idx;
    });
    const dedupeCol = headers.indexOf(DEDUPE_HEADER);

    // 逐行生成车型名（重名时用准入编号去重，仍重名追加序号）
    const usedNames = new Set<string>();
    const dataRows: { rowIndex: number; productName: string }[] = [];
    for (let i = info.headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        if (!row.some(isFilled)) continue;

        const parts = partCols
            .map(col => (col >= 0 ? String(row[col] ?? '').trim() : ''))
            .filter(Boolean);
        let base = parts.join(' ');
        if (!base) base = `第${i + 1}行`;

        let name = base;
        if (usedNames.has(name)) {
            const admission = dedupeCol >= 0 ? String(row[dedupeCol] ?? '').trim() : '';
            const withAdmission = admission ? `${base} (${admission})` : '';
            if (withAdmission && !usedNames.has(withAdmission)) {
                name = withAdmission;
            } else {
                const stem = withAdmission || base;
                let seq = 2;
                while (usedNames.has(`${stem}-${seq}`)) seq++;
                name = `${stem}-${seq}`;
            }
        }
        usedNames.add(name);
        dataRows.push({ rowIndex: i, productName: name });
    }

    const parameters: VehicleParameter[] = [];
    for (const { rowIndex, productName } of dataRows) {
        const row = rows[rowIndex] || [];
        for (let c = 0; c < headers.length; c++) {
            const name = headers[c];
            if (!name) continue;
            const group = HORIZONTAL_METADATA_HEADERS.has(name)
                ? HORIZONTAL_METADATA_GROUP
                : HORIZONTAL_DEFAULT_GROUP;
            const raw = (row[c] !== undefined && row[c] !== null) ? row[c] : '';
            const converted = convertValue ? convertValue(raw, name) : raw;
            parameters.push({
                id: `${sheetName}::${productName}::${group}::${name}`,
                group, name,
                value: (converted === undefined || converted === null) ? '' : String(converted),
                originSheet: sheetName,
                productName
            });
        }
    }
    return parameters;
};

/** 工作簿方向汇总（FileManager 快捷路径用；empty = 所有 sheet 均无内容） */
export type WorkbookOrientation = 'horizontal' | 'vertical' | 'mixed' | 'empty';
