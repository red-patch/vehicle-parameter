import * as XLSX from 'xlsx';
import type { VehicleParameter, SheetData } from '../types';

/**
 * Parses an Excel file and extracts vehicle parameters.
 * V1.1: Supports multiple sheets and multiple products per sheet.
 */

// 解析诊断信息
export interface ParseDiagnostics {
    totalSheets: number;
    sheetsProcessed: string[];
    sheetsSkipped: { name: string; reason: string }[];
    headerFound: boolean;
    productColumnsFound: number;
    suggestion: string;
}

// 自定义解析错误
export class ParseError extends Error {
    diagnostics: ParseDiagnostics;
    
    constructor(message: string, diagnostics: ParseDiagnostics) {
        super(message);
        this.name = 'ParseError';
        this.diagnostics = diagnostics;
    }
}

// Helper to determine if a sheet is a parameter sheet
const isParameterSheet = (headers: string[], sheetName: string): boolean => {
    // 1. Explicitly exclude known non-parameter sheets
    const excludedKeywords = ['版本', '修改', '记录', 'history', 'revision', 'log'];
    const lowerName = sheetName.toLowerCase();
    if (excludedKeywords.some(kw => lowerName.includes(kw))) {
        return false;
    }

    // 2. Head-based detection: expanded keywords
    const nameKeywords = ['参数项名称', '参数名', 'Parameter Name', '功能项', '项目', '名称', '清单'];
    return headers.some(h => {
        if (!h || typeof h !== 'string') return false;
        // Reject title-like cells or long descriptions
        if (h.length > 50 || h.includes('附件') || h.includes('Sheet') || h.includes('Table')) return false;
        return nameKeywords.some(kw => h.includes(kw));
    });
};

const NON_PRODUCT_KEYWORDS = [
    '序号', 'index', 'no.', 
    '类别', '分组', 'group', 'category', 
    '参数名', '参数项名称', 'name', 'parameter', '项目', '功能项', '名称', '清单',
    '说明', 'description', 'note', '备注', 'comment', 
    '技术要求', '功能要求', '配置要求', 'requirement', 'req', '要求',
    '填写说明', '属性'
];

// 检测是否为键值对格式（两列：参数名 + 值）
const isKeyValueFormat = (jsonData: unknown[][]): boolean => {
    if (jsonData.length < 5) return false;
    
    // 检查前20行的结构
    let validRows = 0;
    const checkRows = Math.min(20, jsonData.length);
    
    for (let i = 0; i < checkRows; i++) {
        const row = jsonData[i] as (string | number | undefined)[];
        if (!row || row.length === 0) continue;
        
        // 键值对格式特征：2-4列，第一列是字符串（参数名）
        const nonEmptyCols = row.filter(cell => cell !== undefined && cell !== null && String(cell).trim() !== '').length;
        if (nonEmptyCols >= 1 && nonEmptyCols <= 4) {
            const firstCell = row[0];
            if (firstCell && typeof firstCell === 'string' && firstCell.trim().length > 0) {
                // 检查是否像参数名（包含中文或常见参数标识）
                if (/[\u4e00-\u9fa5]/.test(firstCell) || firstCell.includes('(') || firstCell.includes('（')) {
                    validRows++;
                }
            }
        }
    }
    
    // 如果大多数行符合键值对格式，则认为是该格式
    return validRows >= checkRows * 0.6;
};

// 从文件名提取产品名
const extractProductNameFromFileName = (fileName: string): string => {
    // 移除扩展名和路径
    const baseName = fileName.replace(/\.[^/.]+$/, '').split('/').pop() || fileName;
    // 提取第一个有意义的部分（通常是产品型号）
    const match = baseName.match(/^([A-Za-z0-9]+)/);
    return match ? match[1] : baseName.substring(0, 20);
};

// 解析键值对格式的Sheet
const parseKeyValueSheet = (jsonData: unknown[][], sheetName: string, fileName: string): VehicleParameter[] => {
    const parameters: VehicleParameter[] = [];
    const productName = extractProductNameFromFileName(fileName);
    let currentGroup = '基础信息';
    
    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i] as (string | number | undefined)[];
        if (!row || row.length === 0) continue;
        
        const nameCell = row[0];
        const valueCell = row[1];
        
        if (nameCell === undefined || nameCell === null) continue;
        
        const name = String(nameCell).trim();
        if (!name) continue;
        
        // 检测是否为分组标题（通常值为空或与名称相同）
        if ((!valueCell || valueCell === nameCell) && name.length < 15 && /[\u4e00-\u9fa5]/.test(name)) {
            // 可能是分组标题，但也可能是真正的参数，需要看下一行
            // 简单处理：如果名称像分组（如"车型信息"、"动力系统"），更新分组
            if (name.includes('信息') || name.includes('系统') || name.includes('配置') || name.includes('参数')) {
                currentGroup = name;
                continue;
            }
        }
        
        const value = (valueCell !== undefined && valueCell !== null) ? String(valueCell).trim() : '';
        const id = `${sheetName}::${productName}::${currentGroup}::${name}`;
        
        parameters.push({
            id,
            group: currentGroup,
            name,
            value,
            originSheet: sheetName,
            productName
        });
    }
    
    return parameters;
};

// Extracted logic for parsing Workbook (Universal)
export const parseWorkbook = (workbook: XLSX.WorkBook, fileName: string): SheetData => {
    const allParameters: VehicleParameter[] = [];
    let headers: string[] = [];
    
    // 诊断信息收集
    const diagnostics: ParseDiagnostics = {
        totalSheets: workbook.SheetNames.length,
        sheetsProcessed: [],
        sheetsSkipped: [],
        headerFound: false,
        productColumnsFound: 0,
        suggestion: ''
    };

    // Iterate over all sheets
    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

        if (jsonData.length === 0) {
            diagnostics.sheetsSkipped.push({ name: sheetName, reason: 'Sheet为空' });
            return;
        }

        // 优先检测键值对格式（如V6E系统导出）
        if (isKeyValueFormat(jsonData)) {
            const kvParams = parseKeyValueSheet(jsonData, sheetName, fileName);
            allParameters.push(...kvParams);
            diagnostics.sheetsProcessed.push(sheetName);
            return; // 已处理完这个sheet
        }

        // 1. Identify Header Row
        // We look for a row that contains "参数项名称" or "参数名"
        let headerRowIndex = -1;
        let currentHeaders: string[] = [];

        // Optimize: Search top 20 rows for header
        for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
            const row = jsonData[i] as string[];
            if (row && isParameterSheet(row, sheetName)) {
                headerRowIndex = i;
                currentHeaders = row;
                break;
            }
        }

        // If no valid header found, skip this sheet (e.g. Version History)
        if (headerRowIndex === -1) {
            diagnostics.sheetsSkipped.push({ name: sheetName, reason: '未找到包含"参数项名称"或"名称"的表头行' });
            return; // Skip sheet
        }
        
        diagnostics.headerFound = true;

        // Keep the first found valid header as the file's primary header (for reference)
        if (headers.length === 0) headers = currentHeaders;

        // 2. Identify Metadata Columns vs Product Columns
        // Flexible Name Column Detection
        const nameKeywords = ['参数项名称', '参数名', 'Parameter Name', '功能项', '项目', '名称', '清单'];
        const nameIdx = currentHeaders.findIndex(h => {
            if (!h || typeof h !== 'string') return false;
            // Additional check to avoid misidentifying non-name columns
            if (h.includes('附件')) return false;
            return nameKeywords.some(kw => h.includes(kw));
        });

        const groupIdx = currentHeaders.findIndex(h => h && (typeof h === 'string') && (h.includes('类别') || h.includes('分组') || h.includes('Group')));

        if (nameIdx === -1) return;

        // Product Columns: Any column that is NOT Group, Name, Index, or "Notes"/ "Fill Instructions"
        // 增强：支持跨行表头（产品名可能在下一行）
        const productIndices: number[] = [];
        const productNames: Map<number, string> = new Map();
        
        // 检查下一行是否有产品名（跨行表头支持）
        const nextRow = (headerRowIndex + 1 < jsonData.length) ? jsonData[headerRowIndex + 1] as string[] : [];
        let dataStartRow = headerRowIndex + 1;
        
        // 检测是否为跨行表头：下一行在参数名列右侧有有意义的内容
        const isMultiRowHeader = nextRow && nextRow.length > 0 && 
            nextRow.some((cell, idx) => idx > nameIdx && cell && String(cell).trim().length > 0);
        
        if (isMultiRowHeader) {
            dataStartRow = headerRowIndex + 2; // 数据从第3行开始
        }

        // 关键修复：需要检查的列数应该取headers和nextRow的最大值
        // 因为产品名可能在nextRow中超出headers的长度
        const maxColToCheck = isMultiRowHeader 
            ? Math.max(currentHeaders.length, nextRow.length) 
            : currentHeaders.length;

        for (let idx = 0; idx < maxColToCheck; idx++) {
            const h = currentHeaders[idx];
            
            if (idx === groupIdx || idx === nameIdx) continue;
            
            // Heuristic: Products are usually to the right of the Name column
            if (idx < nameIdx) continue;

            // 检查当前列头或下一行是否有有效的产品名
            let headerStr = h ? String(h).toLowerCase() : '';
            let productName = h ? String(h).trim() : '';
            
            // 优先：如果当前列头是明确的非产品关键词（如"填写说明"），直接跳过
            if (h && NON_PRODUCT_KEYWORDS.some(kw => headerStr.includes(kw.toLowerCase()))) {
                continue; // 明确跳过非产品列
            }
            
            // 如果当前列头为空或不存在，尝试从下一行获取产品名
            if (!h || productName === '') {
                if (isMultiRowHeader) {
                    const nextRowCell = nextRow[idx];
                    if (nextRowCell && String(nextRowCell).trim().length > 0) {
                        productName = String(nextRowCell).trim();
                        headerStr = productName.toLowerCase();
                    } else {
                        continue; // 两行都为空，跳过此列
                    }
                } else {
                    continue; // 非跨行表头且当前列为空，跳过
                }
            }
            
            // 再次检查从下一行获取的产品名是否为非产品关键词
            if (!productName) continue;
            if (NON_PRODUCT_KEYWORDS.some(kw => headerStr.includes(kw.toLowerCase()))) continue;
            
            // It is a product column!
            productIndices.push(idx);
            productNames.set(idx, productName);
        }
        
        // 更新诊断信息
        diagnostics.productColumnsFound += productIndices.length;
        if (productIndices.length > 0) {
            diagnostics.sheetsProcessed.push(sheetName);
        } else {
            diagnostics.sheetsSkipped.push({ name: sheetName, reason: '未找到产品列（表头右侧应有产品名称列）' });
        }

        // 3. Extract Data with Fill-Down Logic
        let lastGroup = '基础信息'; // Default group

        for (let i = dataStartRow; i < jsonData.length; i++) {
            const row = jsonData[i] as (string | number | undefined)[];

            // Handle Group (Fill Down)
            let group = '';
            if (groupIdx !== -1) {
                const cell = row[groupIdx];
                if (cell) {
                    group = String(cell).trim();
                    lastGroup = group;
                } else {
                    group = lastGroup;
                }
            } else {
                group = 'Default';
            }

            // Handle Name
            const nameCell = row[nameIdx];
            const name = nameCell !== undefined ? String(nameCell).trim() : '';

            if (!name) continue; // Skip rows without name

            // Extract value for EACH product found in headers
            productIndices.forEach(pIdx => {
                // 使用 productNames Map 获取产品名（支持跨行表头）
                const pName = productNames.get(pIdx) || String(currentHeaders[pIdx]).trim();
                const valCell = row[pIdx];
                // Careful: valCell might be 0, so check undefined/null.
                const value = (valCell !== undefined && valCell !== null) ? valCell : '';

                // Generate Unique ID: combine Sheet + Product + Group + Name
                // Use '::' as separator to minimize conflict with normal text
                const id = `${sheetName}::${pName}::${group}::${name}`;

                allParameters.push({
                    id,
                    group,
                    name,
                    value: String(value),
                    originSheet: sheetName,
                    productName: pName
                });
            });
        }
    });

    if (allParameters.length === 0) {
        // 生成建议信息
        if (!diagnostics.headerFound) {
            diagnostics.suggestion = '请确保文件中包含"参数项名称"或"名称"列作为表头';
        } else if (diagnostics.productColumnsFound === 0) {
            diagnostics.suggestion = '请确保表头行右侧有产品名称列，或在下一行填写产品名称';
        } else {
            diagnostics.suggestion = '请检查文件格式是否符合车辆参数表格式';
        }
        
        throw new ParseError(
            `无法解析文件，未找到有效的参数数据`,
            diagnostics
        );
    }

    return {
        fileName: fileName,
        data: allParameters,
        rawHeaders: headers
    };
};

export const parseExcel = async (file: File): Promise<SheetData> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const result = parseWorkbook(workbook, file.name);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = (error) => reject(error);
        reader.readAsBinaryString(file);
    });
};

/**
 * Parsers specifically for Requirement Files (Simple List or Key-Value)
 * Less strict than the full parameter parser.
 */
// Extracted logic for Requirement Workbook
export const parseRequirementWorkbook = (workbook: XLSX.WorkBook, fileName: string): SheetData => {
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    if (jsonData.length === 0) {
        throw new Error("File is empty");
    }

    const allParameters: VehicleParameter[] = [];
    const headers = jsonData[0] as string[];

    // Heuristic: If we find "参数项名称" use strict logic, else assume Col 0 is Name
    const nameIdx = headers.findIndex(h => h && typeof h === 'string' && (h.includes('参数名') || h.includes('名称') || h.includes('Name') || h.includes('公告')));
    const effectiveNameIdx = nameIdx !== -1 ? nameIdx : 0;

    // Simple assumption: Row 0 is header, data starts from Row 1
    const startRow = 1;

    for (let i = startRow; i < jsonData.length; i++) {
        const row = jsonData[i] as string[];
        if (!row) continue;

        const nameCell = row[effectiveNameIdx];
        const name = nameCell ? String(nameCell).trim() : '';

        if (!name) continue;

        allParameters.push({
            id: `REQ_${i}`,
            group: 'Requirement',
            name: name,
            value: '', // No value for requirement usually
            originSheet: sheetName
        });
    }

    return {
        fileName: fileName,
        data: allParameters,
        rawHeaders: headers
    };
};

/**
 * Parsers specifically for Requirement Files (Simple List or Key-Value)
 * Less strict than the full parameter parser.
 */
export const parseRequirementExcel = async (file: File): Promise<SheetData> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const result = parseRequirementWorkbook(workbook, file.name);
                resolve(result);

            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsBinaryString(file);
    });
};
