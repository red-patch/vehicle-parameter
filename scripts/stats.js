
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Config
const files = {
    // Corrected path based on find output
    sourceExcel: path.join(rootDir, 'docs/字段数据/商品中心_产品中心_属性池.xlsx'),
    filterList: path.join(rootDir, 'docs/字段数据/质量检验数据'),
    outputCsv: path.join(rootDir, 'docs/质量检验数据_属性统计.csv')
};

async function run() {
    console.log('Start processing...');

    // 1. Read Filter List
    if (!fs.existsSync(files.filterList)) {
        console.error(`Filter file not found: ${files.filterList}`);
        process.exit(1);
    }

    const filterContent = fs.readFileSync(files.filterList, 'utf-8');
    // Debug content
    const lines = filterContent.split(/\r?\n/);
    console.log(`Filter file has ${lines.length} lines.`);
    if (lines.length > 0) console.log(`First line: ${JSON.stringify(lines[0])}`);

    const targetAttributes = new Set(
        lines.map(line => line.trim())
             .filter(line => line.length > 0)
    );
    console.log(`Loaded ${targetAttributes.size} unique target attributes.`);

    // 2. Read Excel
    if (!fs.existsSync(files.sourceExcel)) {
        console.error(`Excel file not found: ${files.sourceExcel}`);
        // Fallback: check docs/ root just in case
        const altExcel = path.join(rootDir, 'docs/商品中心_产品中心_属性池.xlsx');
        if (fs.existsSync(altExcel)) {
            console.log(`Found Excel at alternative path: ${altExcel}`);
            files.sourceExcel = altExcel;
        } else {
             process.exit(1);
        }
    }
    
    console.log(`Reading Excel: ${files.sourceExcel}`);
    const workbook = XLSX.readFile(files.sourceExcel);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // Use header:1 to get array of arrays
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (data.length === 0) {
        console.error("Excel sheet is empty.");
        process.exit(1);
    }

    // 3. Find indices
    const headers = data[0];
    const nameIdx = headers.indexOf('属性名称');
    const valueIdx = headers.indexOf('属性值');

    // Debug headers if not found
    if (nameIdx === -1 || valueIdx === -1) {
        console.error(`Missing columns: '属性名称' or '属性值'. Found headers: ${JSON.stringify(headers)}`);
        // Try fuzzy match?
        process.exit(1);
    }

    // 4. Aggregate Data
    const stats = new Map(); // Name -> Set<values>

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const name = row[nameIdx];
        const val = row[valueIdx]; // Can be undefined

        if (name) {
             const cleanName = String(name).trim();
             if (targetAttributes.has(cleanName)) {
                 if (!stats.has(cleanName)) {
                     stats.set(cleanName, new Set());
                 }
                 if (val !== undefined && val !== null && val !== '') {
                     stats.get(cleanName).add(String(val).trim());
                 }
             }
        }
    }

    // 5. Write Output
    const rows = [['属性名称', '属性值']];
    const filterListOrdered = lines.map(l => l.trim()).filter(l => l);
    const processed = new Set();

    for (const attr of filterListOrdered) {
        if (processed.has(attr)) continue;
        processed.add(attr);

        if (stats.has(attr)) {
            // Join values with |
            const values = Array.from(stats.get(attr)).sort().join('|');
            rows.push([attr, values]);
        } else {
            rows.push([attr, '']); // Empty if not found in excel
        }
    }

    const outputSheet = XLSX.utils.aoa_to_sheet(rows);
    const csvContent = XLSX.utils.sheet_to_csv(outputSheet);
    fs.writeFileSync(files.outputCsv, csvContent);
    console.log(`Done! Saved to: ${files.outputCsv}`);
}

run().catch(err => console.error(err));
