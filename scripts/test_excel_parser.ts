/**
 * Excel Parser 兼容性测试脚本
 * 测试多种Excel格式的解析能力
 */
import XLSX from 'xlsx';

interface VehicleParameter {
    id: string;
    group: string;
    name: string;
    value: string;
    originSheet: string;
    productName?: string;
}

interface SheetData {
    fileName: string;
    data: VehicleParameter[];
    rawHeaders: string[];
}

// 核心解析逻辑
const NON_PRODUCT_KEYWORDS = [
    '序号', 'index', 'no.', 
    '类别', '分组', 'group', 'category', 
    '参数名', '参数项名称', 'name', 'parameter', '项目', '功能项', '名称', '清单',
    '说明', 'description', 'note', '备注', 'comment', 
    '技术要求', '功能要求', '配置要求', 'requirement', 'req', '要求',
    '填写说明', '属性'
];

const isParameterSheet = (headers: string[], sheetName: string): boolean => {
    const excludedKeywords = ['版本', '修改', '记录', 'history', 'revision', 'log'];
    const lowerName = sheetName.toLowerCase();
    if (excludedKeywords.some(kw => lowerName.includes(kw))) {
        return false;
    }

    const nameKeywords = ['参数项名称', '参数名', 'Parameter Name', '功能项', '项目', '名称', '清单'];
    return headers.some(h => {
        if (!h || typeof h !== 'string') return false;
        if (h.length > 50 || h.includes('附件') || h.includes('Sheet') || h.includes('Table')) return false;
        return nameKeywords.some(kw => h.includes(kw));
    });
};

const isKeyValueFormat = (jsonData: unknown[][]): boolean => {
    if (jsonData.length < 5) return false;
    
    let validRows = 0;
    const checkRows = Math.min(20, jsonData.length);
    
    for (let i = 0; i < checkRows; i++) {
        const row = jsonData[i] as (string | number | undefined)[];
        if (!row || row.length === 0) continue;
        
        const nonEmptyCols = row.filter(cell => cell !== undefined && cell !== null && String(cell).trim() !== '').length;
        if (nonEmptyCols >= 1 && nonEmptyCols <= 4) {
            const firstCell = row[0];
            if (firstCell && typeof firstCell === 'string' && firstCell.trim().length > 0) {
                if (/[\u4e00-\u9fa5]/.test(firstCell) || firstCell.includes('(') || firstCell.includes('（')) {
                    validRows++;
                }
            }
        }
    }
    
    return validRows >= checkRows * 0.6;
};

const extractProductNameFromFileName = (fileName: string): string => {
    const baseName = fileName.replace(/\.[^/.]+$/, '').split('/').pop() || fileName;
    const match = baseName.match(/^([A-Za-z0-9]+)/);
    return match ? match[1] : baseName.substring(0, 20);
};

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
        
        if ((!valueCell || valueCell === nameCell) && name.length < 15 && /[\u4e00-\u9fa5]/.test(name)) {
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

const parseWorkbook = (workbook: XLSX.WorkBook, fileName: string): SheetData => {
    const allParameters: VehicleParameter[] = [];
    let headers: string[] = [];

    workbook.SheetNames.forEach((sheetName: string) => {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

        if (jsonData.length === 0) return;

        if (isKeyValueFormat(jsonData)) {
            const kvParams = parseKeyValueSheet(jsonData, sheetName, fileName);
            allParameters.push(...kvParams);
            return;
        }

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
            return;
        }

        if (headers.length === 0) headers = currentHeaders;

        const nameKeywords = ['参数项名称', '参数名', 'Parameter Name', '功能项', '项目', '名称', '清单'];
        const nameIdx = currentHeaders.findIndex(h => {
            if (!h || typeof h !== 'string') return false;
            if (h.includes('附件')) return false;
            return nameKeywords.some(kw => h.includes(kw));
        });

        const groupIdx = currentHeaders.findIndex(h => h && (typeof h === 'string') && (h.includes('类别') || h.includes('分组') || h.includes('Group')));

        if (nameIdx === -1) return;

        const productIndices: number[] = [];
        const productNames: Map<number, string> = new Map();
        
        const nextRow = (headerRowIndex + 1 < jsonData.length) ? jsonData[headerRowIndex + 1] as string[] : [];
        let dataStartRow = headerRowIndex + 1;
        
        // 修复后的跨行表头检测逻辑
        const isMultiRowHeader = nextRow && nextRow.length > 0 && 
            nextRow.some((cell, idx) => idx > nameIdx && cell && String(cell).trim().length > 0);
        
        if (isMultiRowHeader) {
            dataStartRow = headerRowIndex + 2;
        }

        // 关键修复：需要检查的列数应该取headers和nextRow的最大值
        // 因为产品名可能在nextRow中超出headers的长度
        const maxColToCheck = isMultiRowHeader 
            ? Math.max(currentHeaders.length, nextRow.length) 
            : currentHeaders.length;

        for (let idx = 0; idx < maxColToCheck; idx++) {
            const h = currentHeaders[idx];
            
            if (idx === groupIdx || idx === nameIdx) continue;
            if (idx < nameIdx) continue;

            let headerStr = h ? String(h).toLowerCase() : '';
            let productName = h ? String(h).trim() : '';
            
            // 优先：如果当前列头是明确的非产品关键词（如"填写说明"），直接跳过
            if (h && NON_PRODUCT_KEYWORDS.some(kw => headerStr.includes(kw.toLowerCase()))) {
                continue;
            }
            
            // 如果当前列头为空或不存在，尝试从下一行获取产品名
            if (!h || productName === '') {
                if (isMultiRowHeader) {
                    const nextRowCell = nextRow[idx];
                    if (nextRowCell && String(nextRowCell).trim().length > 0) {
                        productName = String(nextRowCell).trim();
                        headerStr = productName.toLowerCase();
                    } else {
                        continue;
                    }
                } else {
                    continue;
                }
            }
            
            if (!productName) continue;
            if (NON_PRODUCT_KEYWORDS.some(kw => headerStr.includes(kw.toLowerCase()))) continue;
            
            productIndices.push(idx);
            productNames.set(idx, productName);
        }

        let lastGroup = '基础信息';

        for (let i = dataStartRow; i < jsonData.length; i++) {
            const row = jsonData[i] as (string | number | undefined)[];

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

            const nameCell = row[nameIdx];
            const name = nameCell !== undefined ? String(nameCell).trim() : '';

            if (!name) continue;

            productIndices.forEach(pIdx => {
                const pName = productNames.get(pIdx) || String(currentHeaders[pIdx]).trim();
                const valCell = row[pIdx];
                const value = (valCell !== undefined && valCell !== null) ? valCell : '';

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
        throw new Error("No valid parameters found in Excel file");
    }

    return {
        fileName: fileName,
        data: allParameters,
        rawHeaders: headers
    };
};

// 测试用例
interface TestCase {
    file: string;
    description: string;
    minParams: number;
    expectedProducts?: string[];
}

const testCases: TestCase[] = [
    {
        file: './docs/V8E客运版不支持.xlsx',
        description: '跨行表头格式 - V8E客运版',
        minParams: 100,
        expectedProducts: ['长轴明窗']
    },
    {
        file: './docs/demo.xlsx',
        description: '标准多产品格式',
        minParams: 50
    },
    {
        file: './docs/V6E 系统导出字段不支持.xlsx',
        description: '键值对格式',
        minParams: 10
    }
];

console.log('=== Excel Parser 兼容性测试 ===\n');

let passed = 0;
let failed = 0;

for (const tc of testCases) {
    console.log(`📄 测试: ${tc.description}`);
    console.log(`   文件: ${tc.file}`);
    
    try {
        const workbook = XLSX.readFile(tc.file);
        const result = parseWorkbook(workbook, tc.file);
        
        const products = new Set<string>();
        result.data.forEach(p => {
            if (p.productName) products.add(p.productName);
        });
        
        console.log(`   ✅ 解析成功!`);
        console.log(`      - 参数数量: ${result.data.length}`);
        console.log(`      - 产品列表: ${Array.from(products).join(', ')}`);
        
        if (result.data.length < tc.minParams) {
            console.log(`   ⚠️ 警告: 参数数量少于预期 (${tc.minParams})`);
        }
        
        if (tc.expectedProducts) {
            const found = tc.expectedProducts.some(exp => 
                Array.from(products).some(p => p.includes(exp))
            );
            if (!found) {
                console.log(`   ⚠️ 警告: 未找到预期产品名 ${tc.expectedProducts.join(', ')}`);
            }
        }
        
        passed++;
    } catch (error) {
        console.log(`   ❌ 解析失败: ${error instanceof Error ? error.message : String(error)}`);
        failed++;
    }
    
    console.log('');
}

console.log('=== 测试结果 ===');
console.log(`通过: ${passed}/${testCases.length}`);
console.log(`失败: ${failed}/${testCases.length}`);

if (failed > 0) {
    process.exit(1);
}
