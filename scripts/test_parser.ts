
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { parseWorkbook } from '../src/utils/excelParser';

const runTest = () => {
    const files = ['docs/demo.xlsx', 'docs/demo1.xlsx'];
    let passed = true;

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
            
            console.log(`Successfully parsed ${result.data.length} parameters.`);
            
            // Basic Validation
            const productNames = new Set(result.data.map(p => p.productName));
            console.log('Products found:', Array.from(productNames));

            // Check for known "bad" columns in demo1.xlsx
            if (file.includes('demo1')) {
                const badColumns = ['技术要求', '说明', '填写说明'];
                const hasBad = Array.from(productNames).some(p => badColumns.includes(p));
                if (hasBad) {
                    console.error('FAILED: Found non-product columns as products:', Array.from(productNames).filter(p => badColumns.includes(p)));
                    passed = false;
                } else {
                    console.log('PASSED: No metadata columns mistaken for products.');
                }
                
                // Expect specific products
                if (!productNames.has('X3状态确认')) {
                    console.error('FAILED: Missing expected product "X3状态确认"');
                    passed = false;
                }
            }

        } catch (error) {
            console.error(`FAILED to parse ${file}:`, error);
            passed = false;
        }
    });

    if (passed) {
        console.log('\n✅ All Tests Passed');
    } else {
        console.log('\n❌ Tests Failed');
        process.exit(1);
    }
};

runTest();
