
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const file = 'docs/demo.xlsx';
const filePath = path.resolve(process.cwd(), file);
if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    process.exit(1);
}

const buffer = fs.readFileSync(filePath);
const workbook = XLSX.read(buffer, { type: 'buffer' });
console.log(`Analyzing ${file} - All Sheets`);

workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

    console.log(`\n\n=== Sheet: ${sheetName} ===`);

const nameKeywords = ['参数项名称', '参数名', 'Parameter Name', '功能项', '项目', '名称'];
const isParameterSheet = (headers: string[], sheetName: string): boolean => {
    // 1. Explicitly exclude known non-parameter sheets
    const excludedKeywords = ['版本', '修改', '记录', 'history', 'revision', 'log', '附件', 'attachment'];
    const lowerName = sheetName.toLowerCase();
    if (excludedKeywords.some(kw => lowerName.includes(kw))) {
        // console.log(`Rejected sheet ${sheetName} by name`);
        return false;
    }

    // 2. Head-based detection: expanded keywords
    return headers.some(h => {
        if (!h || typeof h !== 'string') return false;
        // Reject title-like cells even if they contain keywords
        if (h.includes('附件') || h.includes('Sheet') || h.includes('Table')) {
             // console.log(`Rejected header cell: ${h}`);
             return false;
        }
        const match = nameKeywords.some(kw => h.includes(kw));
        if (match) console.log(`Matched row via cell: "${h}"`);
        return match;
    });
};

for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
    const row = jsonData[i] as string[];
    console.log(`Row ${i}:`, JSON.stringify(row));
    if (row && isParameterSheet(row, sheetName)) {
        console.log(`\n✅ Row ${i} identified as HEADER`);
        
        // Simulate finding columns
        const currentHeaders = row;
        const nameIdx = currentHeaders.findIndex(h => {
            if (!h || typeof h !== 'string') return false;
            if (h.includes('附件')) return false;
            return nameKeywords.some(kw => h.includes(kw));
        });
        console.log(`Name Index: ${nameIdx} (${currentHeaders[nameIdx]})`);
        
        const NON_PRODUCT_KEYWORDS = [
            '序号', 'index', 'no.', 
            '类别', '分组', 'group', 'category', 
            '参数名', '参数项名称', 'name', 'parameter', '项目', '功能项', '名称',
            '说明', 'description', 'note', '备注', 'comment', 
            '技术要求', '功能要求', '配置要求', 'requirement', 'req',
            '填写说明', '属性'
        ];
        
        currentHeaders.forEach((h, idx) => {
             if (idx < nameIdx) return; // Heuristic
             if (!h) return;
             const headerStr = String(h).toLowerCase();
             if (NON_PRODUCT_KEYWORDS.some(kw => headerStr.includes(kw.toLowerCase()))) {
                 console.log(`Idx ${idx}: "${h}" - Excluded (Keyword)`);
                 return;
             }
             console.log(`Idx ${idx}: "${h}" - PRODUCT`);
        });


        break;
    }
}
});
