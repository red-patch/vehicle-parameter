import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// 配置
const inputFile = path.join(rootDir, 'docs/字段数据/商品中心_产品中心_属性池.xlsx');
const outputFile = path.join(rootDir, 'docs/字段数据/属性值统计.csv');

// 读取Excel
const workbook = XLSX.readFile(inputFile);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// 找列索引
const headers = data[0];
const nameIdx = headers.indexOf('属性名称');
const valueIdx = headers.indexOf('属性值');

// 统计
const stats = new Map();
for (let i = 1; i < data.length; i++) {
    const name = data[i][nameIdx];
    const val = data[i][valueIdx];
    if (name) {
        const key = String(name).trim();
        if (!stats.has(key)) stats.set(key, new Set());
        if (val) stats.get(key).add(String(val).trim());
    }
}

// 输出CSV
const rows = [['属性名称', '属性值列表']];
for (const [name, values] of [...stats.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push([name, Array.from(values).sort().join('|')]);
}

const csvSheet = XLSX.utils.aoa_to_sheet(rows);
fs.writeFileSync(outputFile, XLSX.utils.sheet_to_csv(csvSheet));
console.log(`已生成: ${outputFile} (共${stats.size}个属性)`);
