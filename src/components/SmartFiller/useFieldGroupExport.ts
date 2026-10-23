/**
 * 单车填报的「字段组 + 导出格式」装配（从 MatchResultTable 抽出的独立 hook）
 *
 * 三层职责见 docs/plans/2026-10-19-车上云模板导出-design.md：
 * 字段组定输出 → 字段组里的 sources 定取值 → 枚举字典定合法性。
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { message } from 'antd';
import * as XLSX from 'xlsx';
import type { MatchItem, VehicleParameter } from '../../types';
import type { ExportFormat, FieldGroupConfigItem } from '../../utils/fieldLists';
import { buildExportRows, matchTypeConfidence, renderFileName, resolveGroupFields, summarizeResolved } from '../../utils/fieldMapping';
import {
    getEnumDataVersion,
    getEnumValuesSync,
    subscribeEnumData,
} from '../../utils/attributeEnums';

export interface UseFieldGroupExportOptions {
    group: FieldGroupConfigItem | null;
    format: ExportFormat | null;
    library: VehicleParameter[];
    productName?: string | null;
    /**
     * 人工修正值（字段名 → 值）。必须传进来：否则导出的还是资产原值，
     * 用户在表格里改的东西等于白改。
     */
    manualValues?: Record<string, string>;
}

export interface UseFieldGroupExportResult {
    fields: ReturnType<typeof resolveGroupFields>;
    summary: ReturnType<typeof summarizeResolved>;
    /** 模板模式下的表格行（id = 输出字段名） */
    matchItems: MatchItem[];
    exportWorkbook: () => Promise<void>;
}

export function useFieldGroupExport({
    group, format, library, productName, manualValues,
}: UseFieldGroupExportOptions): UseFieldGroupExportResult {
    // 词表热更新 → 状态重算
    const enumVersion = useSyncExternalStore(subscribeEnumData, getEnumDataVersion);

    const fields = useMemo(
        () => (group ? resolveGroupFields(group, library, getEnumValuesSync, manualValues ?? {}) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [group, library, enumVersion, manualValues],
    );

    const summary = useMemo(() => summarizeResolved(fields), [fields]);

    const matchItems = useMemo<MatchItem[]>(() => {
        const byName = new Map(library.map(p => [p.name, p]));
        return fields.map(row => {
            // 组合字段没有单一来源：挂第一个来源仅用于「来源」列展示，值以 row.value 为准
            const primary = row.sources[0] ? byName.get(row.sources[0]) : undefined;
            return {
                id: row.field,
                requirementName: row.field,
                matchedParam: primary ?? null,
                // 按真实匹配类型给分：模糊匹配不能显示 100%
                confidence: matchTypeConfidence(row.matchType, row.sources.length > 0),
                isManual: row.manualValue !== undefined,
                ...(row.manualValue !== undefined ? { manualValue: row.manualValue } : {}),
            };
        });
    }, [fields, library]);

    const exportWorkbook = useCallback(async () => {
        if (!group) return;
        const data = buildExportRows(fields);
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const vehicle = productName || '未命名车型';
        const fileName = `${renderFileName(
            format ?? {
                id: 'ad-hoc',
                name: '全字段',
                fieldGroupId: group.id,
                sheetName: '产品准入导入模版',
                fileNamePattern: '车上云系统导入_{车型}_{日期}',
            },
            { vehicle, date },
        )}.xlsx`;
        const sheetName = format?.sheetName || '产品准入导入模版';

        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
            const { save } = await import('@tauri-apps/plugin-dialog');
            const { invoke } = await import('@tauri-apps/api/core');
            const target = await save({
                defaultPath: fileName,
                filters: [{ name: 'Excel', extensions: ['xlsx'] }],
            });
            if (!target) return;
            await invoke('export_xlsx', {
                path: target,
                sheetName,
                rows: data,
                colWidths: [46, 40],
            });
            message.success(`已导出 ${fields.length} 行`);
            return;
        }

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{ wch: 46 }, { wch: 40 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, fileName);
        message.success(`已导出 ${fields.length} 行`);
    }, [group, format, fields, productName]);

    return { fields, summary, matchItems, exportWorkbook };
}
