import * as XLSX from 'xlsx';
import type { VehicleParameter, SheetData } from '../types';

/**
 * Parses an Excel file and extracts vehicle parameters.
 * V1.1: Supports multiple sheets and multiple products per sheet.
 */

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

// Extracted logic for parsing Workbook (Universal)
export const parseWorkbook = (workbook: XLSX.WorkBook, fileName: string): SheetData => {
    const allParameters: VehicleParameter[] = [];
    let headers: string[] = [];

    // Iterate over all sheets
    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

        if (jsonData.length === 0) return;

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
            return; // Skip sheet
        }

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
        const productIndices: number[] = [];
        currentHeaders.forEach((h, idx) => {
            if (idx === groupIdx || idx === nameIdx) return;
            
            // Heuristic: Products are usually to the right of the Name column
            if (idx < nameIdx) return;

            if (!h) return;
            const headerStr = String(h).toLowerCase();
            
            // Check against exclude list
            if (NON_PRODUCT_KEYWORDS.some(kw => headerStr.includes(kw.toLowerCase()))) return;
            
            // It is a product column!
            productIndices.push(idx);
        });

        // 3. Extract Data with Fill-Down Logic
        let lastGroup = '基础信息'; // Default group

        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
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
                const productName = String(currentHeaders[pIdx]).trim();
                const valCell = row[pIdx];
                // Careful: valCell might be 0, so check undefined/null.
                const value = (valCell !== undefined && valCell !== null) ? valCell : '';

                // Generate Unique ID: combine Sheet + Product + Group + Name
                // Use '::' as separator to minimize conflict with normal text
                const id = `${sheetName}::${productName}::${group}::${name}`;

                allParameters.push({
                    id,
                    group,
                    name,
                    value: String(value),
                    originSheet: sheetName,
                    productName
                });
            });
        }
    });

    if (allParameters.length === 0) {
        throw new Error("No valid parameters found in Excel file");
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
