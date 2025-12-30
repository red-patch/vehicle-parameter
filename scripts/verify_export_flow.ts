
import XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { parseWorkbook, parseRequirementWorkbook } from '../src/utils/excelParser';
import { findMatches } from '../src/utils/matcher';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const demoPath = path.resolve(__dirname, '../docs/demo.xlsx');
    const requirementPath = path.resolve(__dirname, '../docs/need_param.xlsx');
    const outputPath = path.resolve(__dirname, '../verify_export.csv');

    console.log(`Checking files: \nBase: ${demoPath}\nReq: ${requirementPath}`);

    if (!fs.existsSync(demoPath) || !fs.existsSync(requirementPath)) {
        console.error("Test files not found!");
        process.exit(1);
    }

    try {
        // 1. Parse Base File
        console.log("Reading Base File...");
        const demoWb = XLSX.readFile(demoPath);
        const baseData = parseWorkbook(demoWb, 'demo.xlsx');
        console.log(`Base Data: ${baseData.data.length} parameters loaded.`);

        // 2. Parse Requirement File
        console.log("Reading Requirement File...");
        const reqWb = XLSX.readFile(requirementPath);
        const reqData = parseRequirementWorkbook(reqWb, 'need_param.xlsx');
        console.log(`Requirement Data: ${reqData.data.length} items loaded.`);

        // 3. Match
        console.log("Matching...");
        const requirements = reqData.data.map(p => p.name).filter(n => n);
        // Filter to specific product if needed, observing user original request. 
        // User said "docs/demo.xlsx" as base. demo.xlsx has multiple products.
        // Let's simluate selecting one product "BJ4259SMF6N-02" if it exists, or just use all.
        // For verify, we use all.
        const matchResults = findMatches(requirements, baseData.data);
        console.log(`Matched: ${matchResults.length} items.`);

        // 4. Export to CSV (Simulate MatchResultTable.tsx logic)
        console.log("Generating CSV...");

        const headers = ['需求参数名', '匹配库参数名', '填报值', '置信度', '状态'];
        const rows = matchResults.map(m => {
            const val = m.matchedParam?.value;
            // Explicitly convert to string to preserve '0'
            const displayValue = (val !== undefined && val !== null) ? String(val) : '';

            return [
                m.requirementName,
                m.matchedParam?.name || '(未匹配)',
                displayValue,
                (m.confidence * 100).toFixed(0) + '%',
                m.matchedParam ? '已匹配' : '未匹配'
            ];
        });

        const data = [headers, ...rows];

        // Create workbook and worksheet
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

        // Write File
        XLSX.writeFile(wb, outputPath, { bookType: 'csv' });
        console.log(`CSV written to: ${outputPath}`);

        // 5. Verify Output
        if (fs.existsSync(outputPath)) {
            const content = fs.readFileSync(outputPath, 'utf-8');
            console.log("--- CSV CONTENT PREVIEW (First 5 lines) ---");
            console.log(content.split('\n').slice(0, 5).join('\n'));
            console.log("--- END PREVIEW ---");

            // Check for potential issues
            if (content.includes(',0,')) {
                console.log("Verified: Contains 0 values correctly.");
            } else {
                console.log("Notice: No '0' values found in sample match, possibly expected.");
            }
        } else {
            console.error("Failed to write CSV file.");
        }

    } catch (e) {
        console.error("Error during verification:", e);
    }
}

main();
