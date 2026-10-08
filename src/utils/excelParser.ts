import * as XLSX from 'xlsx';
import type { VehicleParameter, SheetData, SheetPreview, SheetParseConfig } from '../types';
import {
    detectHorizontalSheet,
    parseHorizontalSheet,
    type WorkbookOrientation
} from './excelParserHorizontal';
import type { WorkbookHandleInfo, WorkbookHandleStore } from './workbookHandles';

/**
 * Excel 参数解析器
 * 支持自动解析（parseWorkbook）和配置化解析（parseWorkbookWithConfig）
 */

// ===================== 类型定义 =====================

export interface ParseDiagnostics {
    totalSheets: number;
    sheetsProcessed: string[];
    sheetsSkipped: { name: string; reason: string }[];
    headerFound: boolean;
    productColumnsFound: number;
    suggestion: string;
}

export class ParseError extends Error {
    diagnostics: ParseDiagnostics;
    constructor(message: string, diagnostics: ParseDiagnostics) {
        super(message);
        this.name = 'ParseError';
        this.diagnostics = diagnostics;
    }
}

// ===================== 常量 =====================

/** 表头行中用于识别"参数名"列的关键词 */
const NAME_KEYWORDS = ['参数项名称', '参数名', 'Parameter Name', '功能项', '项目', '名称', '清单'];

/** 需要排除的 Sheet 名称关键词 */
const EXCLUDED_SHEET_KEYWORDS = ['版本', '修改', '记录', 'history', 'revision', 'log'];

/** 分组列关键词 */
const GROUP_KEYWORDS = ['类别', '分组', 'Group'];

/** 应被跳过的列头（完整匹配） */
const SKIP_HEADERS = new Set([
    '序号', 'index', 'no.', '类别', '分组', 'group', 'category',
    '说明', 'description', 'note', '备注', 'comment',
    '填写说明', '单位', 'unit', '属性',
    '参数值', '数值', 'value'
]);

/** 包含这些关键词的短列头应被跳过（参数名类） */
const NAME_LIKE_KEYWORDS = [
    '参数名', '参数项名称', 'name', 'parameter', '项目', '功能项', '名称', '清单',
    '技术要求', '功能要求', '配置要求', 'requirement', 'req', '要求'
];

// ===================== 公共工具函数 =====================

/**
 * 追加大数组：横向大表（如产品准入导出）单 sheet 可产出 20w+ 条参数，
 * push(...items) 展开实参超过引擎上限直接 RangeError（Maximum call stack size exceeded）
 */
const appendAll = (target: VehicleParameter[], items: VehicleParameter[]): void => {
    for (const item of items) target.push(item);
};

/**
 * 智能百分比转换：Excel 存储 25% 为 0.25，需还原为 "25%"
 */
const convertPercentValue = (value: unknown, name: string): string | number => {
    if (typeof value === 'number' && name) {
        const isPctField = name.includes('%') || name.includes('坡度') || name.includes('率') || name.includes('效率');
        if (isPctField && value <= 1 && value >= -1 && value !== 0) {
            return parseFloat((value * 100).toFixed(2)) + '%';
        }
    }
    return value as string | number;
};

/** 从文件名提取产品名（支持中文文件名） */
const extractProductNameFromFileName = (fileName: string): string => {
    const baseName = fileName.replace(/\.[^/.]+$/, '').split('/').pop() || fileName;
    // 提取有意义的前缀：字母数字+中文（去掉"整车配置清单"等通用后缀）
    const cleaned = baseName
        .replace(/[_-]?(整车|配置|清单|参数表|面类|V\d+).*$/u, '')
        .trim();
    if (cleaned.length > 2) return cleaned.substring(0, 30);
    // 兜底：取开头的字母数字+中文
    const match = baseName.match(/^[\w\u4e00-\u9fa5]+/);
    return match ? match[0].substring(0, 30) : baseName.substring(0, 20);
};

/**
 * 从数据中智能推断产品名
 * 优先级：型号字段值 + 公告号 → 型号 → 文件名
 */
export const inferProductNameFromData = (
    jsonData: unknown[][],
    nameColIndex: number,
    productColIndex: number,
    dataStartRow: number,
    fileName: string
): string => {
    // 在数据行中查找特定参数名对应的值（精确匹配参数名，避免"轮胎型号"匹配"型号"）
    const findValue = (keywords: string[]): string => {
        for (let i = dataStartRow; i < Math.min(jsonData.length, dataStartRow + 50); i++) {
            const row = jsonData[i] as (string | number | undefined)[];
            if (!row) continue;
            const name = row[nameColIndex] ? String(row[nameColIndex]).trim() : '';
            if (keywords.some(kw => name === kw)) {
                const val = row[productColIndex];
                if (val !== undefined && val !== null && String(val).trim()) {
                    return String(val).trim();
                }
            }
        }
        return '';
    };

    const model = findValue(['型号', '车型型号']);
    const bulletin = findValue(['整车公告号', '公告号', '公告型号']);

    if (model && bulletin) return `${model} ${bulletin}`;
    if (model) return model;
    if (bulletin) return bulletin;

    // 兜底：从文件名提取
    return extractProductNameFromFileName(fileName);
};

/** 判断列头是否是占位符（如单独的"参数值"），需要下一行补充产品名 */
const isPlaceholderHeader = (header: string): boolean => {
    if (!header) return false;
    return SKIP_HEADERS.has(header.trim().toLowerCase()) &&
        ['参数值', '数值', 'value'].includes(header.trim().toLowerCase());
};

/** 判断列头是否应被跳过（非产品列） */
const shouldSkipColumn = (header: string): boolean => {
    if (!header) return true;
    const lower = header.trim().toLowerCase();
    // 完整匹配跳过列表
    if (SKIP_HEADERS.has(lower)) return true;
    // 短列头 + 包含参数名类关键词 → 跳过
    if (header.trim().length < 20 && NAME_LIKE_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))) return true;
    return false;
};

/**
 * 从列头提取产品名称
 * 支持：
 *   "参数值（栏板）（金旅ET850）" → "金旅ET850 栏板"
 *   "参数值（产品名）" → "产品名"
 *   "大拿V1 长轴高顶" → "大拿V1 长轴高顶"
 */
const extractProductName = (header: string): string | null => {
    if (!header?.trim()) return null;
    const trimmed = header.trim();

    // 双括号：参数值（配置类型）（产品名）
    const compound = trimmed.match(/^(?:参数值|数值)[（(]([^）)]+)[）)][（(]([^）)]+)[）)]$/);
    if (compound) return `${compound[2]} ${compound[1]}`;

    // 单括号：参数值（产品名）
    const single = trimmed.match(/^(?:参数值|数值)[（(]([^）)]+)[）)]$/);
    if (single) return single[1];

    // 应跳过的列头 → 无产品名
    if (shouldSkipColumn(trimmed)) return null;

    // 其他列头直接作为产品名
    return trimmed;
};

/**
 * 严格检测是否为跨行表头
 * 核心规则：单个"参数值"列 + 下一行有值 ≠ 跨行表头
 */
const detectMultiRowHeader = (
    headers: string[], nextRow: string[],
    nameIdx: number, groupIdx: number
): boolean => {
    if (!nextRow?.length) return false;

    // 统计占位符列数
    const placeholders = headers.filter((h, idx) =>
        idx > nameIdx && idx !== groupIdx && h && isPlaceholderHeader(String(h).trim())
    );

    if (placeholders.length > 1) {
        // 多个占位符 → 检查下一行是否有区分性内容
        const nextValues = headers
            .map((h, idx) => (idx > nameIdx && idx !== groupIdx && h && isPlaceholderHeader(String(h).trim()))
                ? (nextRow[idx] ? String(nextRow[idx]).trim() : '') : null)
            .filter((v): v is string => v !== null && v.length > 0);
        return new Set(nextValues).size > 1;
    }

    if (placeholders.length === 1) {
        // 单占位符 → 检查下一行是否有产品名内容（非纯数值，说明是产品名而非参数值）
        for (let idx = nameIdx + 1; idx < headers.length; idx++) {
            if (idx === groupIdx) continue;
            if (isPlaceholderHeader(String(headers[idx] || '').trim())) {
                const nextCell = nextRow[idx] ? String(nextRow[idx]).trim() : '';
                // 如果下一行内容较长且不是纯数值，认为是产品名
                if (nextCell.length > 2 && !/^\d+(\.\d+)?$/.test(nextCell)) {
                    return true;
                }
            }
        }
    }

    if (placeholders.length === 0) {
        // 没有占位符，但有空列头且下一行有内容 → 跨行
        for (let idx = nameIdx + 1; idx < headers.length; idx++) {
            if (idx === groupIdx) continue;
            if ((!headers[idx] || !String(headers[idx]).trim()) && nextRow[idx] && String(nextRow[idx]).trim()) {
                return true;
            }
        }
    }

    return false;
};

/** 判断 Sheet 名称是否属于应排除的辅助页（版本记录等） */
const isExcludedSheet = (sheetName: string): boolean => {
    const lower = sheetName.toLowerCase();
    return EXCLUDED_SHEET_KEYWORDS.some(kw => lower.includes(kw));
};

/** 判断 Sheet 是否为参数表（通过表头关键词） */
const isParameterSheet = (headers: string[], sheetName: string): boolean => {
    if (isExcludedSheet(sheetName)) return false;

    return headers.some(h => {
        if (!h || typeof h !== 'string') return false;
        if (h.length > 50 || h.includes('附件') || h.includes('Sheet') || h.includes('Table')) return false;
        return NAME_KEYWORDS.some(kw => h.includes(kw));
    });
};

/** 检测键值对格式（两列：参数名 + 值） */
const isKeyValueFormat = (jsonData: unknown[][]): boolean => {
    if (jsonData.length < 5) return false;
    const checkRows = Math.min(20, jsonData.length);
    let validRows = 0;

    for (let i = 0; i < checkRows; i++) {
        const row = jsonData[i] as (string | number | undefined)[];
        if (!row?.length) continue;
        const nonEmpty = row.filter(c => c !== undefined && c !== null && String(c).trim() !== '').length;
        if (nonEmpty >= 1 && nonEmpty <= 4) {
            const first = row[0];
            if (first && typeof first === 'string' && /[\u4e00-\u9fa5(（]/.test(first.trim())) {
                validRows++;
            }
        }
    }
    return validRows >= checkRows * 0.6;
};

/** 合并多行表头为列名 */
const buildHeaderName = (jsonData: unknown[][], headerRows: number[], colIndex: number): string => {
    const parts: string[] = [];
    for (const rowIdx of headerRows) {
        if (rowIdx < jsonData.length) {
            const cell = (jsonData[rowIdx] as (string | number | undefined)[])[colIndex];
            if (cell !== undefined && cell !== null) {
                const s = String(cell).trim();
                if (s && !parts.includes(s)) parts.push(s);
            }
        }
    }
    return parts.join(' ') || `列${colIndex + 1}`;
};

/**
 * 部分文件会把 `!ref` 膨胀到 `XFD`，导致 sheet_to_json 扫描大量空列。
 * 当列跨度异常大时，按真实单元格边界收敛 range，避免无效遍历。
 */
const getEffectiveSheetRange = (sheet: XLSX.WorkSheet, maxSafeColumns = 512): string | undefined => {
    const ref = sheet['!ref'];
    if (!ref) return undefined;

    try {
        const decoded = XLSX.utils.decode_range(ref);
        const colSpan = decoded.e.c - decoded.s.c + 1;
        if (colSpan <= maxSafeColumns) return undefined;

        const cellKeys = Object.keys(sheet).filter(k => !k.startsWith('!'));
        if (cellKeys.length === 0) return undefined;

        let minR = Number.POSITIVE_INFINITY;
        let maxR = -1;
        let minC = Number.POSITIVE_INFINITY;
        let maxC = -1;

        for (const key of cellKeys) {
            const cell = XLSX.utils.decode_cell(key);
            if (cell.r < minR) minR = cell.r;
            if (cell.r > maxR) maxR = cell.r;
            if (cell.c < minC) minC = cell.c;
            if (cell.c > maxC) maxC = cell.c;
        }

        if (maxR < minR || maxC < minC) return undefined;
        return XLSX.utils.encode_range({
            s: { r: minR, c: minC },
            e: { r: maxR, c: maxC }
        });
    } catch {
        return undefined;
    }
};

const sheetToRows = (
    sheet: XLSX.WorkSheet,
    opts: XLSX.Sheet2JSONOpts = {}
): unknown[][] => {
    const effectiveRange = getEffectiveSheetRange(sheet);
    return XLSX.utils.sheet_to_json(sheet, {
        ...opts,
        ...(effectiveRange ? { range: effectiveRange } : {})
    }) as unknown[][];
};

// ===================== 解析键值对格式 =====================

const parseKeyValueSheet = (jsonData: unknown[][], sheetName: string, fileName: string): VehicleParameter[] => {
    const parameters: VehicleParameter[] = [];
    const productName = extractProductNameFromFileName(fileName);
    let currentGroup = '基础信息';

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i] as (string | number | undefined)[];
        if (!row?.length) continue;

        const nameCell = row[0];
        if (nameCell === undefined || nameCell === null) continue;
        const name = String(nameCell).trim();
        if (!name) continue;

        const valueCell = row[1];
        // 分组标题检测
        if ((!valueCell || valueCell === nameCell) && name.length < 15 && /[\u4e00-\u9fa5]/.test(name)) {
            if (name.includes('信息') || name.includes('系统') || name.includes('配置') || name.includes('参数')) {
                currentGroup = name;
                continue;
            }
        }

        parameters.push({
            id: `${sheetName}::${productName}::${currentGroup}::${name}`,
            group: currentGroup,
            name,
            value: (valueCell !== undefined && valueCell !== null) ? String(valueCell).trim() : '',
            originSheet: sheetName,
            productName
        });
    }
    return parameters;
};

// ===================== 核心自动解析 =====================

export const parseWorkbook = (workbook: XLSX.WorkBook, fileName: string): SheetData => {
    const allParameters: VehicleParameter[] = [];
    let headers: string[] = [];
    const horizontalSheetNames = new Set<string>();

    const diagnostics: ParseDiagnostics = {
        totalSheets: workbook.SheetNames.length,
        sheetsProcessed: [], sheetsSkipped: [],
        headerFound: false, productColumnsFound: 0, suggestion: ''
    };

    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = sheetToRows(sheet, { header: 1 });

        if (jsonData.length === 0) {
            diagnostics.sheetsSkipped.push({ name: sheetName, reason: 'Sheet为空' });
            return;
        }

        // 优先检测横向格式（参数为列、车型为行，如"产品准入导出"）
        if (!isExcludedSheet(sheetName)) {
            const horizontalInfo = detectHorizontalSheet(jsonData);
            if (horizontalInfo) {
                const params = parseHorizontalSheet(jsonData, horizontalInfo, {
                    sheetName, convertValue: convertPercentValue
                });
                if (params.length > 0) {
                    appendAll(allParameters, params);
                    horizontalSheetNames.add(sheetName);
                    diagnostics.headerFound = true;
                    diagnostics.productColumnsFound += new Set(params.map(p => p.productName)).size;
                    diagnostics.sheetsProcessed.push(sheetName);
                    return;
                }
            }
        }

        // 检测键值对格式
        if (isKeyValueFormat(jsonData)) {
            appendAll(allParameters, parseKeyValueSheet(jsonData, sheetName, fileName));
            diagnostics.sheetsProcessed.push(sheetName);
            return;
        }

        // 1. 查找表头行
        let headerRowIndex = -1;
        let currentHeaders: string[] = [];
        for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
            const row = jsonData[i] as string[];
            if (row && isParameterSheet(row, sheetName)) {
                headerRowIndex = i;
                currentHeaders = row;
                break;
            }
        }

        if (headerRowIndex === -1) {
            diagnostics.sheetsSkipped.push({ name: sheetName, reason: '未找到包含"参数项名称"或"名称"的表头行' });
            return;
        }
        diagnostics.headerFound = true;
        if (headers.length === 0) headers = currentHeaders;

        // 2. 识别参数名列和分组列
        const nameIdx = currentHeaders.findIndex(h =>
            h && typeof h === 'string' && !h.includes('附件') && NAME_KEYWORDS.some(kw => h.includes(kw))
        );
        const groupIdx = currentHeaders.findIndex(h =>
            h && typeof h === 'string' && GROUP_KEYWORDS.some(kw => h.includes(kw))
        );
        if (nameIdx === -1) return;

        // 3. 跨行表头检测
        const nextRow = (headerRowIndex + 1 < jsonData.length) ? jsonData[headerRowIndex + 1] as string[] : [];
        const isMultiRow = detectMultiRowHeader(currentHeaders, nextRow, nameIdx, groupIdx);
        const dataStartRow = isMultiRow ? headerRowIndex + 2 : headerRowIndex + 1;

        // 统计占位符列
        const placeholderCount = currentHeaders.filter((h, idx) =>
            idx > nameIdx && idx !== groupIdx && h && isPlaceholderHeader(String(h).trim())
        ).length;

        // 4. 识别产品列
        const productIndices: number[] = [];
        const productNames: Map<number, string> = new Map();
        const maxCol = isMultiRow ? Math.max(currentHeaders.length, nextRow.length) : currentHeaders.length;

        for (let idx = 0; idx < maxCol; idx++) {
            if (idx === groupIdx || idx === nameIdx || idx < nameIdx) continue;

            const h = currentHeaders[idx];
            const headerStr = h ? String(h).trim() : '';
            let productName: string | null = null;

            // 尝试从当前行提取
            if (h) productName = extractProductName(String(h));

            // 跨行表头：尝试从下一行提取
            if ((!productName || isPlaceholderHeader(headerStr)) && isMultiRow) {
                const nextCell = nextRow[idx];
                if (nextCell && String(nextCell).trim()) {
                    productName = extractProductName(String(nextCell)) || productName;
                }
            }

            // 单占位符列：从数据中智能推断产品名
            if (!productName && isPlaceholderHeader(headerStr) && placeholderCount === 1) {
                productName = inferProductNameFromData(jsonData, nameIdx, idx, dataStartRow, fileName);
            }

            if (!productName) continue;
            productIndices.push(idx);
            productNames.set(idx, productName);
        }

        diagnostics.productColumnsFound += productIndices.length;
        if (productIndices.length > 0) {
            diagnostics.sheetsProcessed.push(sheetName);
        } else {
            diagnostics.sheetsSkipped.push({ name: sheetName, reason: '未找到产品列（表头右侧应有产品名称列）' });
        }

        // 5. 提取数据（Fill-Down 分组）
        let lastGroup = '基础信息';
        for (let i = dataStartRow; i < jsonData.length; i++) {
            const row = jsonData[i] as (string | number | undefined)[];

            let group = lastGroup;
            if (groupIdx !== -1) {
                const cell = row[groupIdx];
                if (cell) { group = String(cell).trim(); lastGroup = group; }
            } else {
                group = 'Default';
            }

            const nameCell = row[nameIdx];
            const name = nameCell !== undefined ? String(nameCell).trim() : '';
            if (!name) continue;

            productIndices.forEach(pIdx => {
                const pName = productNames.get(pIdx) || String(currentHeaders[pIdx]).trim();
                const raw = (row[pIdx] !== undefined && row[pIdx] !== null) ? row[pIdx] : '';
                const value = convertPercentValue(raw, name);

                allParameters.push({
                    id: `${sheetName}::${pName}::${group}::${name}`,
                    group, name,
                    value: String(value),
                    originSheet: sheetName,
                    productName: pName
                });
            });
        }
    });

    if (allParameters.length === 0) {
        if (!diagnostics.headerFound) {
            diagnostics.suggestion = '请确保文件中包含"参数项名称"或"名称"列作为表头，或表头为"参数作列、车型作行"的横向格式（如产品准入导出）';
        } else if (diagnostics.productColumnsFound === 0) {
            diagnostics.suggestion = '请确保表头行右侧有产品名称列，或在下一行填写产品名称';
        } else {
            diagnostics.suggestion = '请检查文件格式是否符合车辆参数表格式';
        }
        throw new ParseError('无法解析文件，未找到有效的参数数据', diagnostics);
    }

    // 跨 sheet 合并：同一文件多个 sheet 各产出单产品时，统一产品名。
    // 横向 sheet（如 _part0/_part1 分片导出）每行即一个车型，不参与此合并，
    // 否则各分片只有一个车型时会被错误并成一个产品。
    const productsBySheet = new Map<string, Set<string>>();
    for (const p of allParameters) {
        const sheet = p.originSheet || '';
        if (horizontalSheetNames.has(sheet)) continue;
        if (!productsBySheet.has(sheet)) productsBySheet.set(sheet, new Set());
        productsBySheet.get(sheet)!.add(p.productName || '');
    }
    // 如果每个 sheet 都只有 1 个产品，且产品名不同，则合并为同一产品
    const allSingleProduct = [...productsBySheet.values()].every(s => s.size === 1);
    if (allSingleProduct && productsBySheet.size > 1) {
        const allNames = [...productsBySheet.values()].map(s => [...s][0]);
        const uniqueNames = new Set(allNames);
        if (uniqueNames.size > 1) {
            // 选择最佳名称：最长的非文件名推断（通常含型号+公告号的最详细）
            const bestName = allNames.reduce((a, b) => a.length >= b.length ? a : b);
            for (const p of allParameters) {
                p.productName = bestName;
            }
        }
    }

    return { fileName, data: allParameters, rawHeaders: headers };
};

// ===================== 入口函数 =====================

export const parseExcel = async (file: File): Promise<SheetData> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                resolve(parseWorkbook(workbook, file.name));
            } catch (error) { reject(error); }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

export const readFileAsWorkbook = (file: File): Promise<XLSX.WorkBook> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                resolve(XLSX.read(data, { type: 'array' }));
            } catch (error) { reject(error); }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

// ===================== 预览 + 配置化解析 =====================

/** 预览最多保留的行数 */
const PREVIEW_MAX_ROWS = 100;

export const previewWorkbook = (workbook: XLSX.WorkBook): SheetPreview[] => {
    return workbook.SheetNames.map(sheetName => {
        const sheet = workbook.Sheets[sheetName];

        // 与 sheetToRows 同一套 !ref 收敛：部分文件把 !ref 膨胀到 XFD，
        // 此时降级到真实单元格边界，避免 totalCols 被算成大得离谱的值。
        const ref = getEffectiveSheetRange(sheet) || sheet['!ref'];
        const decoded = ref ? XLSX.utils.decode_range(ref) : null;

        // 行列总数直接来自收敛后的 ref，不再扫全表物化（内存治理 P1-1）：
        // 此前先 sheet_to_json 整表再 slice(0,100)，宽表会白白分配整表数组。
        // 畸形（倒序）ref 会产生负值，钳到 0。
        const totalRows = decoded ? Math.max(0, decoded.e.r - decoded.s.r + 1) : 0;
        const totalCols = decoded ? Math.max(0, decoded.e.c - decoded.s.c + 1) : 0;

        let rows: string[][] = [];
        if (decoded && totalRows > 0) {
            // 行范围按 s.r 相对取前 PREVIEW_MAX_ROWS 行（非 0 起始的表也对），
            // 列仍取全宽——sheet_to_json 的 range 无法只约束行而不管列。
            const jsonData = XLSX.utils.sheet_to_json(sheet, {
                header: 1,
                defval: '',
                range: {
                    s: { r: decoded.s.r, c: decoded.s.c },
                    e: { r: Math.min(decoded.s.r + PREVIEW_MAX_ROWS - 1, decoded.e.r), c: decoded.e.c },
                },
            }) as unknown[][];

            // defval:'' 会把行补满到 range 宽度，故输出与旧的整表实现逐字节一致；
            // 收益来自行数（整表 → 100 行），列宽行为不变。
            rows = jsonData.slice(0, PREVIEW_MAX_ROWS).map(row =>
                (row as unknown[]).map(c => (c !== null && c !== undefined) ? String(c) : '')
            );
        }

        const merges = (sheet['!merges'] || []).map(m => ({
            s: { r: m.s.r, c: m.s.c }, e: { r: m.e.r, c: m.e.c }
        }));

        return { sheetName, rows, totalRows, totalCols, merges };
    });
};

/**
 * 判定工作簿方向：所有非空 sheet 均为横向 → 'horizontal'；部分横向 → 'mixed'；
 * 均非横向 → 'vertical'；无有效内容 → 'empty'。
 */
export const detectWorkbookOrientation = (workbook: XLSX.WorkBook): WorkbookOrientation => {
    let sawHorizontal = false;
    let sawOther = false;

    for (const sheetName of workbook.SheetNames) {
        if (isExcludedSheet(sheetName)) continue;
        const sheet = workbook.Sheets[sheetName];
        const jsonData = sheetToRows(sheet, { header: 1 });
        const hasContent = jsonData.some(row => (row || []).some(c =>
            c !== undefined && c !== null && String(c).trim() !== ''
        ));
        if (!hasContent) continue;

        if (detectHorizontalSheet(jsonData)) {
            sawHorizontal = true;
        } else {
            sawOther = true;
        }
    }

    if (!sawHorizontal && !sawOther) return 'empty';
    if (sawHorizontal && sawOther) return 'mixed';
    return sawHorizontal ? 'horizontal' : 'vertical';
};

/** 构造 handle 信息的唯一实现：主线程 fallback 与 worker 共用，避免两份拷贝漂移 */
export const buildWorkbookHandleInfo = (
    workbook: XLSX.WorkBook,
    handleId: number,
    fileName: string
): WorkbookHandleInfo => ({
    handleId,
    fileName,
    sheetNames: workbook.SheetNames,
    orientation: detectWorkbookOrientation(workbook),
    previews: previewWorkbook(workbook),
});

/**
 * 按 handle 解析的唯一实现：主线程 fallback 与 worker 共用。
 *
 * worker 与 fallback 是两个 realm，但 store 只是普通参数，故可共用纯函数。
 * 关键是错误文案（对用户可见，设计 §4 要求「释放后解析必须明确报错」）只此一份。
 */
export const parseByHandle = (
    store: WorkbookHandleStore,
    handleId: number,
    configs?: SheetParseConfig[]
): SheetData => {
    const entry = store.get(handleId);
    if (!entry) throw new Error(`workbook handle 不存在或已释放：${handleId}`);
    return configs
        ? parseWorkbookWithConfig(entry.workbook, entry.fileName, configs)
        : parseWorkbook(entry.workbook, entry.fileName);
};

export const parseWorkbookWithConfig = (
    workbook: XLSX.WorkBook, fileName: string, configs: SheetParseConfig[]
): SheetData => {
    const allParameters: VehicleParameter[] = [];
    let headers: string[] = [];

    for (const config of configs) {
        const sheet = workbook.Sheets[config.sheetName];
        if (!sheet) continue;
        const jsonData = sheetToRows(sheet, { header: 1, defval: '' });
        if (jsonData.length === 0) continue;

        // 横向格式由解析端自动识别，列角色配置不适用（列配置无法表达"行=车型"）
        const horizontalInfo = detectHorizontalSheet(jsonData);
        if (horizontalInfo) {
            appendAll(allParameters, parseHorizontalSheet(jsonData, horizontalInfo, {
                sheetName: config.sheetName, convertValue: convertPercentValue
            }));
            if (headers.length === 0) {
                headers = (jsonData[horizontalInfo.headerRowIndex] as string[]).map(h => String(h || ''));
            }
            continue;
        }

        const productColumns = config.productColumns.map(pc => {
            let name = pc.name || buildHeaderName(jsonData, config.headerRows, pc.index);
            // 如果产品名是兜底值"列N"，尝试从数据中智能推断
            if (/^列\d+$/.test(name)) {
                name = inferProductNameFromData(
                    jsonData, config.nameColIndex, pc.index, config.dataStartRow, fileName
                );
            }
            return { index: pc.index, name };
        });

        if (headers.length === 0 && config.headerRows.length > 0) {
            headers = (jsonData[config.headerRows[0]] as string[]).map(h => String(h || ''));
        }

        let lastGroup = '基础信息';
        for (let i = config.dataStartRow; i < jsonData.length; i++) {
            const row = jsonData[i] as (string | number | undefined)[];

            let group = lastGroup;
            if (config.groupColIndex >= 0) {
                const cell = row[config.groupColIndex];
                if (cell && String(cell).trim()) { group = String(cell).trim(); lastGroup = group; }
            }

            const nameCell = row[config.nameColIndex];
            const name = (nameCell !== undefined && nameCell !== null) ? String(nameCell).trim() : '';
            if (!name) continue;

            for (const pc of productColumns) {
                const raw = (row[pc.index] !== undefined && row[pc.index] !== null) ? row[pc.index] : '';
                const value = convertPercentValue(raw, name);
                allParameters.push({
                    id: `${config.sheetName}::${pc.name}::${group}::${name}`,
                    group, name, value: String(value),
                    originSheet: config.sheetName, productName: pc.name
                });
            }
        }
    }

    if (allParameters.length === 0) {
        throw new Error('按当前配置未提取到任何参数数据，请检查配置是否正确');
    }
    return { fileName, data: allParameters, rawHeaders: headers };
};
