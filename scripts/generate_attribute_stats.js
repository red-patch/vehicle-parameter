
import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputFilePath = path.resolve(__dirname, '../docs/商品中心_产品中心_属性池.xlsx');
const outputFilePath = path.resolve(__dirname, '../docs/属性值统计.csv');

if (!fs.existsSync(inputFilePath)) {
    console.error(`File not found: ${inputFilePath}`);
    process.exit(1);
}

console.log(`Reading file: ${inputFilePath}`);
const workbook = XLSX.readFile(inputFilePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Get raw data (array of arrays)
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

if (data.length < 2) {
    console.error("Not enough data in file.");
    process.exit(1);
}

// Find column indices
const headers = data[0];
const nameIndex = headers.indexOf('属性名称');
const valueIndex = headers.indexOf('属性值');

if (nameIndex === -1 || valueIndex === -1) {
    console.error(`Could not find required columns. Found headers: ${headers.join(', ')}`);
    process.exit(1);
}

console.log(`Found columns: '属性名称' at index ${nameIndex}, '属性值' at index ${valueIndex}`);

const attributeMap = {}; // Record<string, Set<string>>

for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = row[nameIndex];
    const value = row[valueIndex];

    if (name) { // Ensure name exists
        const nameStr = String(name).trim();
        if (nameStr) {
            if (!attributeMap[nameStr]) {
                attributeMap[nameStr] = new Set();
            }
            if (value !== undefined && value !== null && value !== '') {
                 attributeMap[nameStr].add(String(value).trim());
            }
        }
    }
}

// Convert to CSV rows
const csvRows = [];
csvRows.push(['属性名称', '属性值列表']); // Header

for (const name of Object.keys(attributeMap).sort()) {
    const values = Array.from(attributeMap[name]).sort().join('|'); // Use | as separator within the value cell
    csvRows.push([name, values]);
}

// Create a new workbook for output or just write string
// Using XLSX.utils to generate CSV ensures quoting is handled correctly
const outputSheet = XLSX.utils.aoa_to_sheet(csvRows);
const csvContent = XLSX.utils.sheet_to_csv(outputSheet);

fs.writeFileSync(outputFilePath, csvContent);

console.log(`Successfully wrote stats to: ${outputFilePath}`);
console.log(`Processed ${Object.keys(attributeMap).length} unique attributes.`);
