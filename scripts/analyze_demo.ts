import XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const filePath = path.resolve('/Users/ethan/code/vehicle-parameter/docs/need_param.xlsx');

try {
    const workbook = XLSX.readFile(filePath);
    console.log("Sheet Names:", workbook.SheetNames);

    workbook.SheetNames.forEach(name => {
        console.log(`\n--- Sheet: ${name} ---`);
        const sheet = workbook.Sheets[name];
        // Get dimensions
        const range = XLSX.utils.decode_range(sheet['!ref'] || "A1");
        console.log(`Dimensions: Rows ${range.e.r + 1}, Cols ${range.e.c + 1}`);

        // Preview first 20 rows
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, raw: false });
        json.slice(0, 20).forEach((row, idx) => {
            console.log(`Row ${idx}:`, JSON.stringify(row));
        });
    });

} catch (e) {
    console.error("Error reading file:", e);
}
