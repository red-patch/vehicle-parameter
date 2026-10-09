/**
 * 枚举导入：AOA 行 → 表头 + 行对象。
 *
 * 从 `EnumImportModal` 抽出（P2-4），使这段映射可单测。抽出的同时**逐字保留了
 * 原行为**，包括一处既有缺陷：表头若含空列，`headers` 会变短，随后按
 * `c < headers.length` 截断会使后续列错位（见 __tests__/enumImportRowMapping.test.ts
 * 的「空表头跳过 → 后续列错位」用例）。迁移只求等价，不在此处修缺陷。
 */
export interface EnumRowsResult {
    /** 非空表头（跳过空列——既有行为） */
    headers: string[];
    /** 只含至少一个非空单元格的行 */
    rows: Record<string, string>[];
}

export const buildEnumRows = (
    aoRows: (unknown[] | undefined)[],
    numCols: number,
    numRows: number
): EnumRowsResult => {
    const headerRow = aoRows[0] ?? [];
    const headers: string[] = [];
    for (let c = 0; c < numCols; c++) {
        const v = headerRow[c];
        const val = (v == null ? '' : String(v)).trim();
        if (val) headers.push(val);
    }

    const rows: Record<string, string>[] = [];
    for (let r = 1; r < numRows; r++) {
        const rowArr = aoRows[r] ?? [];
        const rowObj: Record<string, string> = {};
        let hasValue = false;
        for (let c = 0; c < numCols; c++) {
            const v = rowArr[c];
            const val = v == null ? '' : String(v);
            if (c < headers.length) rowObj[headers[c]] = val;
            if (val !== '') hasValue = true;
        }
        if (hasValue) rows.push(rowObj);
    }

    return { headers, rows };
};
