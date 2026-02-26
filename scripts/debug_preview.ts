import * as XLSX from 'xlsx';
import * as fs from 'fs';

const file2 = '/Users/ethan/code/vehicle-parameter/docs/test_data/V1.3/02-某客户需求参数反馈（02月03日版本）.xlsx';

const buffer = fs.readFileSync(file2);
const workbook = XLSX.read(buffer, { type: 'buffer' });

// 检查 附件一《车辆配置清单》
const sheetName = '附件一《车辆配置清单》';
const sheet = workbook.Sheets[sheetName];
const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

console.log('=== 检查空值 ===\n');
console.log('Headers:', jsonData[0]);

// 产品列索引 (3 和 4)
const product1Idx = 3; // 大拿V1 长轴高顶 货运版
const product2Idx = 4; // 大拿V1 长轴高顶 多功能版

console.log('\n=== 检查车身配置分组的参数 ===');
// 找到车身配置的行
for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i] as unknown[];
    const group = row[1];
    const paramName = row[2];
    
    if (group === '车身配置' || (i > 1 && !group && jsonData[i-1]?.[1] === '车身配置')) {
        const val1 = row[product1Idx];
        const val2 = row[product2Idx];
        console.log(`Row ${i}: [${paramName}]`);
        console.log(`  货运版: "${val1}" (type: ${typeof val1})`);
        console.log(`  多功能版: "${val2}" (type: ${typeof val2})`);
        
        if (i > 10) break; // 只看前几行
    }
}

// 检查"快充"这个参数
console.log('\n=== 搜索"快充"参数 ===');
for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i] as unknown[];
    const paramName = row[2];
    if (paramName && String(paramName).includes('快充')) {
        console.log(`Found at row ${i}:`, row.slice(0, 6));
    }
}

// 统计有多少行有值 vs 空值
console.log('\n=== 统计空值 ===');
let totalRows = 0;
let rowsWithProduct2Value = 0;
for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i] as unknown[];
    const paramName = row[2];
    if (paramName && String(paramName).trim()) {
        totalRows++;
        const val2 = row[product2Idx];
        if (val2 !== undefined && val2 !== null && String(val2).trim() !== '') {
            rowsWithProduct2Value++;
        }
    }
}
console.log(`Total param rows: ${totalRows}`);
console.log(`Rows with value for 多功能版: ${rowsWithProduct2Value} (${(rowsWithProduct2Value/totalRows*100).toFixed(1)}%)`);
