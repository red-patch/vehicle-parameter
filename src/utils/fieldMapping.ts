/**
 * 字段组的取值来源解析与按格式导出（纯函数）
 *
 * 设计：docs/plans/2026-10-19-车上云模板导出-design.md
 *
 * 三层职责（不要混）：
 * - **字段组**（核心字段配置）决定输出哪些字段名
 * - **映射**（字段组的 `sources`）决定每个字段取资产的哪个字段
 * - **枚举字典**决定该字段允许填哪些值
 */
import type { VehicleParameter } from '../types';
import type { ExportFormat, FieldGroupConfigItem, FieldSourceRule } from './fieldLists';
import { findBestMatch, findUniqueMatch, normalizeName } from './matchingEngine';
import { renderCombineTemplate } from './bidFieldMapping';

// ===================== 来源解析 =====================

export type SourceMatchType = 'exact' | 'normalized' | 'alias' | 'fuzzy' | 'manual';

export interface ResolvedField {
    /** 输出（模板）字段名 */
    field: string;
    /** 参与取值的资产字段（可能多个：组合字段） */
    sources: string[];
    /** 怎么解析出来的 */
    matchType?: SourceMatchType;
    /** 来自模糊建议、尚未人工确认 */
    suggested?: boolean;
    value: string;
    /** 人工修正后的值（优先于 value 参与导出） */
    manualValue?: string;
    enums: string[];
    status: FieldStatus;
    /** 字段组标记的必填 */
    required: boolean;
}

/**
 * 单字段状态（只取最严重一档）：
 *
 * | 状态 | 判定 | 处理 |
 * |---|---|---|
 * | unmapped | 找不到资产字段 | 红 |
 * | enum_invalid | 有词表、值非空、不在词表内 | 红 |
 * | low_confidence | 来源是未确认的模糊建议 | 黄 |
 * | empty | 有来源但值为空 | 黄 |
 * | no_enum | 词表未收录该字段 | 不判错 |
 * | ok | 其余 | — |
 */
export type FieldStatus = 'unmapped' | 'enum_invalid' | 'empty' | 'no_enum' | 'low_confidence' | 'ok';

/** 同一字段名可能有多条记录（不同分组），优先取有值的 */
export function indexLibraryByName(library: VehicleParameter[]): Map<string, VehicleParameter> {
    const byName = new Map<string, VehicleParameter>();
    for (const p of library) {
        const existing = byName.get(p.name);
        if (!existing) { byName.set(p.name, p); continue; }
        const existingEmpty = isEmptyValue(existing.value);
        if (existingEmpty && !isEmptyValue(p.value)) byName.set(p.name, p);
    }
    return byName;
}

const isEmptyValue = (value: unknown): boolean =>
    value === undefined || value === null || String(value).trim() === '';

/**
 * 解析一个字段组里每个字段的取值来源。
 *
 * 优先级：**人工配置的来源 > 唯一确定 > 模糊建议（不确认也照常显示，但标黄）**。
 * 模糊建议照常给值是因为导出前预检会明确标出「待确认」，不会静默当作正确。
 */
export function resolveGroupFields(
    group: FieldGroupConfigItem,
    library: VehicleParameter[],
    getEnums: (field: string) => string[],
    /** 人工修正的值（字段名 → 值）；优先于资产里的值 */
    manualValues: Record<string, string> = {},
): ResolvedField[] {
    const byName = indexLibraryByName(library);

    const requiredSet = new Set(group.required ?? []);

    return group.fields.map(field => {
        const rule = group.sources?.[field];
        const enums = getEnums(field);
        const isRequired = requiredSet.has(field);
        // 人工修正优先：同一字段组下切换车型时，这些值是用户逐条校对过的
        const manual = manualValues[field];

        // ① 人工配置的规则优先：候选按顺序取第一个在当前车型存在的
        if (rule?.candidates.length) {
            const hits = rule.candidates
                .map(name => byName.get(name))
                .filter((p): p is VehicleParameter => !!p);
            if (hits.length > 0) {
                // 候选是「备选名」还是「组合来源」由 template 决定：
                // - 有 template → 全部命中项按模板拼接（外扩尺寸 ← 长×宽×高）
                // - 无 template → 只取第一个命中项（A 车叫「颜色」、B 车叫「车颜色」）
                // 若默认拼接，上面那种一车两名的数据会被拼成「白色×白色」。
                const useCombine = (rule.template ?? '').trim().length > 0;
                const picked = useCombine ? hits : hits.slice(0, 1);
                const values = picked.map(p => (isEmptyValue(p.value) ? '' : String(p.value).trim()));
                const value = useCombine
                    ? renderCombineTemplate(rule.template!, values)
                    : values[0];
                return finalize(field, picked.map(p => p.name), 'manual', false, manual ?? value, enums, isRequired, manual);
            }
            // 候选在当前车型都不存在 → 落到自动匹配（换车后仍有机会命中）
        }

        // ② 自动：唯一确定
        const unique = findUniqueMatch(field, library);
        if (unique) {
            const matchType: SourceMatchType = field === unique.name
                ? 'exact'
                : (normalizeName(field) === normalizeName(unique.name) ? 'normalized' : 'alias');
            const value = isEmptyValue(unique.value) ? '' : String(unique.value).trim();
            return finalize(field, [unique.name], matchType, false, manual ?? value, enums, isRequired, manual);
        }

        // ③ 自动：模糊建议（标黄待确认）
        const best = findBestMatch(field, library, 0.45).matchedParam;
        if (best) {
            const value = isEmptyValue(best.value) ? '' : String(best.value).trim();
            return finalize(field, [best.name], 'fuzzy', true, manual ?? value, enums, isRequired, manual);
        }

        return finalize(field, [], undefined, false, manual ?? '', enums, isRequired, manual);
    });
}

/**
 * 匹配类型 → 置信度（0-1）。
 *
 * 曾经这里只按「有没有来源」给 0/1，于是模糊匹配（`驾驶室宽度（mm）` ←
 * `货厢内部宽度（mm）`）也显示 100%，用户无法从界面看出它只是猜的。
 * 分档与 `matcher.ts` 的既有口径一致。
 */
export function matchTypeConfidence(
    matchType: SourceMatchType | undefined,
    hasSource: boolean,
): number {
    if (!hasSource) return 0;
    switch (matchType) {
        case 'exact':
        case 'manual':
            return 1;
        case 'normalized':
            return 0.95;
        case 'alias':
            return 0.9;
        case 'fuzzy':
            return 0.6;
        default:
            return 1;
    }
}

/** 统一算状态：值越界优先于「待确认」，因为越界是更硬的事实 */
function finalize(
    field: string,
    sources: string[],
    matchType: SourceMatchType | undefined,
    suggested: boolean,
    value: string,
    enums: string[],
    required: boolean,
    manualValue?: string,
): ResolvedField {
    let status: FieldStatus;
    if (sources.length === 0) status = 'unmapped';
    else if (enums.length > 0 && value !== '' && !enums.includes(value)) status = 'enum_invalid';
    else if (suggested) status = 'low_confidence';
    else if (value === '') status = 'empty';
    else if (enums.length === 0) status = 'no_enum';
    else status = 'ok';

    return { field, sources, matchType, suggested, value, enums, status, required, manualValue };
}

export interface SyncDiffItem {
    field: string;
    referenceValue: string;
    currentValue: string;
}

/**
 * 视同差异：把参考车型的**最终值**（人工修正优先）与当前车型逐字段比对。
 *
 * 复用数据体检「视同更新」的判据，但更窄：
 * - 参考值为空的字段永不算差异（不把空覆盖进来）
 * - 只比「值」，不比字段名/分组——字段组的字段名是模板规定的，不该被另一个车型改写
 */
export function computeSyncDiff(
    fields: ResolvedField[],
    reference: {
        manualValues: Record<string, string>;
        library: VehicleParameter[];
    },
): SyncDiffItem[] {
    const byName = indexLibraryByName(reference.library);
    const items: SyncDiffItem[] = [];
    for (const row of fields) {
        // 参考值的取法（依次尝试）：
        // ① 参考车型在该字段上的人工修正值
        // ② 用本车的来源字段名去参考车型里找（两边命名一致时命中）
        // ③ **直接用输出字段名去找** —— 本车没有配置来源（未映射）时，
        //    参考车型可能仍然有这个字段，不尝试就会整行漏掉，
        //    用户会以为「参考车型的字段没展现」。
        const refManual = reference.manualValues[row.field];
        const fromSourceName = row.sources[0] ? byName.get(row.sources[0]) : undefined;
        const fromFieldName = byName.get(row.field);
        const picked = fromSourceName ?? fromFieldName;
        const refRaw = refManual !== undefined
            ? refManual
            : (picked && !isEmptyValue(picked.value) ? String(picked.value).trim() : '');
        const referenceValue = refRaw.trim();
        if (!referenceValue) continue;
        const currentValue = row.manualValue !== undefined ? row.manualValue : row.value;
        if (referenceValue === currentValue) continue;
        items.push({ field: row.field, referenceValue, currentValue });
    }
    return items;
}

export interface ResolvedSummary {
    total: number;
    ok: number;
    unmapped: number;
    enumInvalid: number;
    empty: number;
    noEnum: number;
    lowConfidence: number;
    /** 会被拦下的项（红） */
    blocking: number;
    /** 已确定来源（含人工与唯一命中，不含模糊建议） */
    resolved: number;
    /** 必填字段数 */
    required: number;
    /** 必填但取值为空（真正会漏填的） */
    requiredMissing: number;
}

export function summarizeResolved(fields: ResolvedField[]): ResolvedSummary {
    const summary: ResolvedSummary = {
        total: fields.length, ok: 0, unmapped: 0, enumInvalid: 0, empty: 0,
        noEnum: 0, lowConfidence: 0, blocking: 0, resolved: 0, required: 0, requiredMissing: 0,
    };
    for (const row of fields) {
        switch (row.status) {
            case 'ok': summary.ok++; break;
            case 'unmapped': summary.unmapped++; summary.blocking++; break;
            case 'enum_invalid': summary.enumInvalid++; summary.blocking++; break;
            case 'empty': summary.empty++; break;
            case 'no_enum': summary.noEnum++; break;
            case 'low_confidence': summary.lowConfidence++; break;
        }
        if (row.sources.length > 0 && !row.suggested) summary.resolved++;
        if (row.required) {
            summary.required++;
            if (row.value === '' || row.status === 'unmapped') summary.requiredMissing++;
        }
    }
    return summary;
}

/** 写入字段组的人工来源规则；传 null 表示恢复自动匹配 */
export function withSource(
    group: FieldGroupConfigItem,
    field: string,
    rule: FieldSourceRule | null,
): FieldGroupConfigItem {
    const sources = { ...(group.sources ?? {}) };
    if (rule && rule.candidates.length > 0) sources[field] = rule;
    else delete sources[field];
    return { ...group, sources };
}

/** 设置/取消单个字段的必填 */
export function withRequired(
    group: FieldGroupConfigItem,
    field: string,
    required: boolean,
): FieldGroupConfigItem {
    const current = new Set(group.required ?? []);
    if (required) current.add(field);
    else current.delete(field);
    return { ...group, required: Array.from(current) };
}

/** 批量设置必填（只作用于仍在组内的字段） */
export function setRequiredFor(
    group: FieldGroupConfigItem,
    fields: string[],
    required: boolean,
): FieldGroupConfigItem {
    const inGroup = new Set(group.fields);
    const current = new Set(group.required ?? []);
    for (const field of fields) {
        if (!inGroup.has(field)) continue;
        if (required) current.add(field);
        else current.delete(field);
    }
    return { ...group, required: Array.from(current) };
}

export type ImportMode = 'replace' | 'merge';

/**
 * 应用从 Excel 导入的字段清单。
 *
 * **必填标记不受影响**：`required` 按字段名独立存储，覆盖/合并都只改
 * `fields` 与 `sources`；被移除字段的必填标记才随字段一起消失（否则会留下幽灵字段）。
 */
export function applyImportedFields(
    group: FieldGroupConfigItem,
    fields: string[],
    mode: ImportMode,
): FieldGroupConfigItem {
    if (mode === 'merge') {
        // **不排序**：模板顺序就是导出顺序，任何重排都会让行号对不上回执。
        // 保留现有顺序，文件里新出现的字段按文件中的顺序追加到末尾。
        const existing = new Set(group.fields);
        const appended = fields.filter(field => !existing.has(field));
        return pruneGroupSources(group, [...group.fields, ...appended]);
    }
    return pruneGroupSources(group, fields);
}

/**
 * 把单个字段加进组：**追加到末尾，不重排**。
 *
 * 曾经这里会 `localeCompare` 重排整组——模板导入的 441 项顺序会被一次「加入字段」
 * 打乱，随之导出行号与车上云回执全都对不上。
 */
export function appendField(
    group: FieldGroupConfigItem,
    field: string,
): FieldGroupConfigItem {
    const trimmed = field.trim();
    if (!trimmed || group.fields.includes(trimmed)) return group;
    return { ...group, fields: [...group.fields, trimmed] };
}

/**
 * 按给定顺序重排字段组（显式操作，用于导入模板后矫正历史遗留的乱序）。
 * 不在 `order` 里的字段按原相对顺序追加到末尾，不丢字段。
 */
export function reorderFields(
    group: FieldGroupConfigItem,
    order: string[],
): FieldGroupConfigItem {
    const inOrder = order.filter(field => group.fields.includes(field));
    const listed = new Set(inOrder);
    const rest = group.fields.filter(field => !listed.has(field));
    return { ...group, fields: [...inOrder, ...rest] };
}

/** 批量追加（保持传入顺序；已存在的跳过） */
export function appendFields(
    group: FieldGroupConfigItem,
    incoming: string[],
): FieldGroupConfigItem {
    let next = group;
    for (const field of incoming) next = appendField(next, field);
    return next;
}

/** 单候选便捷写法（下拉直接选一个字段时用） */
export function withSingleSource(
    group: FieldGroupConfigItem,
    field: string,
    source: string | null,
): FieldGroupConfigItem {
    return withSource(group, field, source && source.trim() ? { candidates: [source.trim()] } : null);
}

/**
 * 字段组换了一批字段（如从模板 Excel 重新导入）后修剪来源：
 * 只保留仍然存在的字段，其余丢弃。
 */
export function pruneGroupSources(
    group: FieldGroupConfigItem,
    fields: string[],
): FieldGroupConfigItem {
    const keep = new Set(fields);
    const sources: Record<string, FieldSourceRule> = {};
    for (const [field, rule] of Object.entries(group.sources ?? {})) {
        if (keep.has(field)) sources[field] = rule;
    }
    // 必填按名字保留，只清掉已不在组内的（否则重导后会在组里留下幽灵必填项）
    const required = (group.required ?? []).filter(field => keep.has(field));
    return { ...group, fields, sources, required };
}

// ===================== 导出格式 =====================

export interface ExportRow {
    field: string;
    value: string;
}

/** 按格式生成二维数组：首行表头 + 每个字段一行，顺序 = 字段组顺序 */
export function buildExportRows(fields: ResolvedField[]): string[][] {
    return [
        ['参数项名称', '参数值'],
        ...fields.map(row => [row.field, row.value]),
    ];
}

/** 渲染文件名模板：{车型} {日期} {格式}，未知占位符原样保留 */
export function renderFileName(
    format: ExportFormat,
    vars: { vehicle: string; date: string },
): string {
    return format.fileNamePattern.replace(/\{(车型|日期|格式)\}/g, (_, key: string) => {
        if (key === '车型') return vars.vehicle;
        if (key === '日期') return vars.date;
        return format.name;
    });
}

/** 导出格式引用的字段组不存在时为无效格式（配置页应拦住） */
export function isFormatUsable(format: ExportFormat, groups: FieldGroupConfigItem[]): boolean {
    return groups.some(g => g.id === format.fieldGroupId);
}

export function createId(prefix: string, now: number = Date.now(), seed = Math.random()): string {
    return `${prefix}-${now.toString(36)}-${Math.floor(seed * 1e6).toString(36)}`;
}
