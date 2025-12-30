
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const files = ['docs/demo.xlsx', 'docs/demo1.xlsx'];

files.forEach(file => {
    const filePath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }

    console.log(`\n=== Analyzing ${file} ===`);
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    workbook.SheetNames.forEach(sheetName => {
        console.log(`\nSheet: ${sheetName}`);
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        // Print first 10 rows to see structure
        json.slice(0, 10).forEach((row, index) => {
            console.log(`Row ${index}:`, JSON.stringify(row));
        });
    });
});
