import XLSX from 'xlsx';
import * as path from 'path';

// --- Types ---
interface VehicleParameter {
    id: string;
    group: string;
    name: string;
    value: string | number;
    originSheet?: string;
    productName?: string;
}

interface SheetData {
    fileName: string;
    data: VehicleParameter[];
    rawHeaders: string[];
}

interface DiffResult {
    added: VehicleParameter[];
    removed: VehicleParameter[];
    modified: { id: string; oldParam: VehicleParameter; newParam: VehicleParameter }[];
    unchanged: VehicleParameter[];
}

// --- Logic from excelParser.ts ---
const isParameterSheet = (headers: string[]): boolean => {
    return headers.some(h => h && typeof h === 'string' && (h.includes('参数项名称') || h.includes('参数名') || h.includes('Parameter Name')));
};

const parseWorkbook = (workbook: XLSX.WorkBook, fileName: string): SheetData => {
    const allParameters: VehicleParameter[] = [];
    let headers: string[] = [];

    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

        if (jsonData.length === 0) return;

        let headerRowIndex = -1;
        let currentHeaders: string[] = [];

        for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
            const row = jsonData[i] as string[];
            if (row && isParameterSheet(row)) {
                headerRowIndex = i;
                currentHeaders = row;
                break;
            }
        }

        if (headerRowIndex === -1) return;

        if (headers.length === 0) headers = currentHeaders;

        const groupIdx = currentHeaders.findIndex(h => h && (typeof h === 'string') && (h.includes('类别') || h.includes('分组') || h.includes('Group')));
        const nameIdx = currentHeaders.findIndex(h => h && (typeof h === 'string') && (h.includes('参数项名称') || h.includes('参数名') || h.includes('Name')));

        if (nameIdx === -1) return;

        const productIndices: number[] = [];
        currentHeaders.forEach((h, idx) => {
            if (idx === groupIdx || idx === nameIdx) return;
            if (!h) return;
            const headerStr = String(h);
            if (headerStr.includes('序号') || headerStr.includes('说明') || headerStr.includes('Note') || headerStr.includes('Index')) return;
            productIndices.push(idx);
        });

        let lastGroup = '基础信息';

        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
            const row = jsonData[i] as (string | number | undefined)[];
            let group = '';
            if (groupIdx !== -1) {
                const cell = row[groupIdx];
                if (cell) {
                    group = String(cell).trim();
                    lastGroup = group;
                } else {
                    group = lastGroup;
                }
            } else {
                group = 'Default';
            }

            const nameCell = row[nameIdx];
            const name = nameCell !== undefined ? String(nameCell).trim() : '';

            if (!name) continue;

            productIndices.forEach(pIdx => {
                const productName = String(currentHeaders[pIdx]).trim();
                const valCell = row[pIdx];
                const value = (valCell !== undefined && valCell !== null) ? valCell : '';
                const id = `${productName}::${group}::${name}`;

                allParameters.push({
                    id,
                    group,
                    name,
                    value: String(value),
                    originSheet: sheetName,
                    productName
                });
            });
        }
    });

    return { fileName, data: allParameters, rawHeaders: headers };
};

// --- Logic from comparator.ts ---
const compareSheets = (base: SheetData, target: SheetData): DiffResult => {
    const baseMap = new Map(base.data.map(p => [p.id, p]));
    const targetMap = new Map(target.data.map(p => [p.id, p]));

    const added: VehicleParameter[] = [];
    const removed: VehicleParameter[] = [];
    const modified: { id: string; oldParam: VehicleParameter; newParam: VehicleParameter }[] = [];
    const unchanged: VehicleParameter[] = [];

    baseMap.forEach((baseParam, id) => {
        const targetParam = targetMap.get(id);
        if (!targetParam) {
            removed.push(baseParam);
        } else {
            if (baseParam.value.toString() !== targetParam.value.toString()) {
                modified.push({ id, oldParam: baseParam, newParam: targetParam });
            } else {
                unchanged.push(baseParam);
            }
        }
    });

    targetMap.forEach((targetParam, id) => {
        if (!baseMap.has(id)) {
            added.push(targetParam);
        }
    });

    return { added, removed, modified, unchanged };
};

// --- Execution ---
try {
    const baseFile = path.resolve('/Users/ethan/code/vehicle-parameter/docs/demo.xlsx');
    const targetFile = path.resolve('/Users/ethan/code/vehicle-parameter/docs/demo_new.xlsx');

    const wbBase = XLSX.readFile(baseFile);
    const wbTarget = XLSX.readFile(targetFile);

    const sheetBase = parseWorkbook(wbBase, 'demo.xlsx');
    const sheetTarget = parseWorkbook(wbTarget, 'demo_new.xlsx');

    console.log(`Base Params: ${sheetBase.data.length}`);
    console.log(`Target Params: ${sheetTarget.data.length}`);

    const result = compareSheets(sheetBase, sheetTarget);
    console.log(`Diff Result: Added=${result.added.length}, Removed=${result.removed.length}, Modified=${result.modified.length}, Unchanged=${result.unchanged.length}`);

} catch (e) {
    console.error("Crash detected:", e);
}
