/**
 * 核心字段配置的「从 Excel 模板导入」纯逻辑（可单测）
 *
 * 公司模板就是「第一列全是字段名」的清单，与「批量导入」的产物同构，
 * 所以这里只负责：取名字、去重、报告重复，不做解析器那套启发式识别。
 */
import type { ExportFormat, FieldGroupConfigItem } from '../../utils/fieldLists';
import { normalizeFieldName } from './coreFieldRules';

const HEADER_CELLS = new Set([
    '参数项名称', '参数名', '参数名称', '字段名', '字段名称', '属性名称',
    'name', 'parameter', 'attribute', '参数',
]);

export interface TemplateImportResult {
    fields: string[];
    duplicates: string[];
    headerSkipped: boolean;
}

/** 从首 sheet 的二维数组取第一列作为字段清单 */
export function extractTemplateFields(rows: unknown[][]): TemplateImportResult {
    const firstCell = rows[0]?.[0];
    const headerSkipped = typeof firstCell === 'string' && HEADER_CELLS.has(firstCell.trim());

    const seen = new Set<string>();
    const duplicates: string[] = [];
    const fields: string[] = [];

    for (let i = headerSkipped ? 1 : 0; i < rows.length; i++) {
        const raw = rows[i]?.[0];
        if (raw === undefined || raw === null) continue;
        const name = normalizeFieldName(String(raw));
        if (!name) continue;
        if (seen.has(name)) {
            if (!duplicates.includes(name)) duplicates.push(name);
            continue;
        }
        seen.add(name);
        fields.push(name);
    }

    return { fields, duplicates, headerSkipped };
}

export interface TemplateDiff {
    added: string[];
    removed: string[];
}

export function diffFields(oldFields: string[], newFields: string[]): TemplateDiff {
    const oldSet = new Set(oldFields);
    const newSet = new Set(newFields);
    return {
        added: newFields.filter(f => !oldSet.has(f)),
        removed: oldFields.filter(f => !newSet.has(f)),
    };
}

/** 字段组换字段后，导出格式里指向该组的格式仍然有效（字段随组走） */
export function exportFormatsForDisplay(
    formats: ExportFormat[],
    groups: FieldGroupConfigItem[],
): Array<ExportFormat & { fieldCount: number }> {
    return formats.map(format => ({
        ...format,
        fieldCount: groups.find(g => g.id === format.fieldGroupId)?.fields.length ?? 0,
    }));
}

/** 从文件路径导入字段的准备步骤抽成函数，便于测试与复用 */
export async function importFieldsFromWorkbook(
    readRows: () => Promise<unknown[][]>,
): Promise<TemplateImportResult> {
    const rows = await readRows();
    return extractTemplateFields(rows);
}
