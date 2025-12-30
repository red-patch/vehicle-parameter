
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { parseWorkbook } from '../src/utils/excelParser';

const runTest = () => {
    const files = ['docs/demo1.xlsx'];
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
            
            // Validate ID Uniqueness and Structure
            const ids = new Set(result.data.map(p => p.id));
            if (ids.size !== result.data.length) {
                console.error('FAILED: Duplicate IDs found!');
                passed = false;
            } else {
                console.log('PASSED: All IDs are unique.');
            }

            // Check ID structure (should contain sheet name)
            const sampleId = result.data[0].id;
            console.log('Sample ID:', sampleId);
            if (!sampleId.includes('::')) {
                console.error('FAILED: ID does not contain separator');
                passed = false;
            }
            // Check if Sheet Name is part of ID
            const sheetName = result.data[0].originSheet!;
            if (!sampleId.startsWith(sheetName)) {
                 console.error(`FAILED: ID does not start with Sheet Name (${sheetName})`);
                 passed = false;
            } else {
                 console.log('PASSED: ID contains Sheet Name.');
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
