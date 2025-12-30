
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { parseWorkbook } from '../src/utils/excelParser';

const getUniqueCount = (data: { originSheet?: string; group: string; name: string }[]) => {
    const uniqueKeys = new Set<string>();
    data.forEach(item => {
        uniqueKeys.add(`${item.originSheet || ''}::${item.group}::${item.name}`);
    });
    return uniqueKeys.size;
};

const runTest = () => {
    const files = ['docs/demo.xlsx', 'docs/demo1.xlsx'];
    
    files.forEach(file => {
        const filePath = path.resolve(process.cwd(), file);
        if (!fs.existsSync(filePath)) {
            console.log(`Skipping ${file}: not found`);
            return;
        }

        console.log(`\nTesting ${file}...`);
        try {
            const buffer = fs.readFileSync(filePath);
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const result = parseWorkbook(workbook, file);
            
            console.log(`Total Parameters (Parser Output): ${result.data.length}`);
            console.log(`Unique Parameters (Expected UI Count): ${getUniqueCount(result.data)}`);

        } catch (error) {
            console.error(`FAILED to parse ${file}:`, error);
        }
    });
};

runTest();
