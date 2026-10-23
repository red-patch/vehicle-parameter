/**
 * 车上云「上传异常」回执解析（纯函数）
 *
 * 车上云实测有**两套措辞**，都要认：
 *
 * 旧版（带方括号）：
 *   第[285]行  商品属性[前装易流温度监测设备]不存在
 *   第[288]行  属性[燃料类型]的取值[/]有误
 *   第[309]行  属性[尾板类型]必填
 *
 * 新版（无方括号，「列不属于该模版」）：
 *   第[25]行   车辆数据监控方式 列不属于该模版
 *   第[288]行  燃料类型 的取值[/]有误
 *
 * **行号就是导出文件的行号**（含表头，参数项名称=第 1 行），因此可以精确反查回字段，
 * 不必让用户自己去 441 行里找。设计：docs/plans/2026-10-20-上传回执修正-design.md
 */
import type { ResolvedField } from './fieldMapping';

/**
 * 车上云其实有**两层不同校验**，措辞不同、含义也不同，不能合并成一类：
 *
 * - `列不属于该模版`   —— 你上传时选的模板里没有这一列（选错模板 / 模板版本不一致）
 * - `商品属性[…]不存在` —— 商品属性库里没有这个属性（字段名本身在系统里不存在）
 */
export type UploadIssueKind =
    /** ……列不属于该模版：与该次上传选的类别模板不一致 */
    | 'column_not_in_template'
    /** 商品属性[…]不存在：系统属性库里没有这个字段 */
    | 'attribute_missing'
    /** 属性[…]的取值[…]有误：枚举越界 */
    | 'value_invalid'
    /** 属性[…]必填：必填为空 */
    | 'required_missing'
    /** 能读出字段但归类不了 */
    | 'other';

export interface UploadIssue {
    /** 原文行号（与导出文件一致，表头为第 1 行） */
    rowNumber?: number;
    /** 解析出的字段名 */
    field?: string;
    /** 解析出的非法值 */
    value?: string;
    kind: UploadIssueKind;
    /** 原始提示，展示用 */
    raw: string;
}

const ROW_RE = /第\s*\[\s*(\d+)\s*\]\s*行/;
/** 只取「属性[...]」「商品属性[...]」后面的方括号，避免把行号 [285] 当成字段名 */
const ATTR_RE = /(?:商品)?属性\s*\[([^\]]*)\]/;
const VALUE_RE = /取值\s*\[([^\]]*)\]/;
/** 无方括号版：`车辆数据监控方式 列不属于该模版` / `车身颜色 的取值[白色]有误` */
const PLAIN_FIELD_RE = /^\s*([^\s[]+?)\s*(?:列不属于该模版|的取值|必填|不存在)/;
/** 无方括号版的行号（`第25行` 也容忍） */
const ROW_PLAIN_RE = /第\s*\[?\s*(\d+)\s*\]?\s*行/;

/** 解析一行提示文本（方括号版与无方括号版都支持） */
export function parseIssueLine(line: string): UploadIssue {
    const raw = line.trim();
    const rowMatch = raw.match(ROW_RE) ?? raw.match(ROW_PLAIN_RE);
    const rowNumber = rowMatch ? Number(rowMatch[1]) : undefined;

    // 从「第N行」开始切，剩下的才是提示正文。
    // 不能直接 replace：表格里复制出来的行常带序号（`1 第[25]行 ...`），
    // 直接替换会把序号留在正文开头，无方括号版就会把「1」当成字段名。
    const rowIdx = raw.search(ROW_PLAIN_RE);
    const body = rowIdx >= 0 ? raw.slice(rowIdx).replace(ROW_PLAIN_RE, '').trim() : raw;

    // 方括号版优先；取不到再用无方括号版
    const field = raw.match(ATTR_RE)?.[1]?.trim()
        ?? body.match(PLAIN_FIELD_RE)?.[1]?.trim();
    const value = raw.match(VALUE_RE)?.[1]?.trim();

    if (raw.includes('列不属于该模版')) {
        return { rowNumber, field, kind: 'column_not_in_template', raw };
    }
    if (raw.includes('不存在')) {
        return { rowNumber, field, kind: 'attribute_missing', raw };
    }
    if (raw.includes('必填')) return { rowNumber, field, kind: 'required_missing', raw };
    if (raw.includes('有误')) return { rowNumber, field, value, kind: 'value_invalid', raw };
    return { rowNumber, field, kind: 'other', raw };
}

/**
 * 解析整段回执（多行粘贴）。容忍空行、序号列、全角括号。
 *
 * 例：`33  第[285]行  商品属性[前装易流温度监测设备]不存在`
 * —— 前面的序号会被忽略，只认「第[N]行」与方括号内容。
 */
export function parseUploadFeedback(text: string): UploadIssue[] {
    return text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        // 跳过纯序号/表头行：必须带「第[N]行」或「属性[...]」，或含三类特征措辞
        .filter(line => ROW_PLAIN_RE.test(line)
            || ATTR_RE.test(line)
            || /列不属于该模版|的取值.*有误|必填/.test(line))
        .map(parseIssueLine);
}

/**
 * 行号 → 字段名。
 *
 * 导出文件第 1 行是表头，所以第 N 行对应 `fields[N - 2]`。
 * 越界返回 undefined（回执与当前字段组不一致时会出现，例如换了模板）。
 */
export function fieldFromRowNumber(
    rowNumber: number | undefined,
    fields: Pick<ResolvedField, 'field'>[],
): string | undefined {
    if (!rowNumber || rowNumber < 2) return undefined;
    return fields[rowNumber - 2]?.field;
}

export interface MatchedIssue extends UploadIssue {
    /** 反查/匹配到的字段（回执里的字段名优先，行号兜底） */
    resolvedField?: string;
    /** 该字段当前的导出值（让用户看到「车上云拿到的到底是什么」） */
    currentValue?: string;
}

/**
 * 把回执对到当前字段组：
 * 1. 优先按**字段名**匹配（回执里带了名字，最可靠）
 * 2. 名字对不上再用**行号**反查（用户可能改过字段组）
 * 3. 都对不上 → 保留原样，标成 unmatched 让人工看
 */
export function matchIssuesToFields(
    issues: UploadIssue[],
    fields: ResolvedField[],
): MatchedIssue[] {
    const byName = new Map(fields.map(f => [f.field.trim(), f]));

    return issues.map(issue => {
        const direct = issue.field ? byName.get(issue.field.trim()) : undefined;
        // 行号兜底：导出文件第 1 行是表头，第 N 行 = fields[N-2]
        const fromRow = issue.rowNumber && issue.rowNumber >= 2
            ? fields[issue.rowNumber - 2]
            : undefined;
        const hit = direct ?? fromRow;
        return {
            ...issue,
            resolvedField: hit?.field ?? issue.field,
            currentValue: hit?.value,
        };
    });
}

/**
 * 合并同一行同一字段的多条报错。
 *
 * 车上云对同一个问题会同时报「列不属于该模版」与「商品属性不存在」，
 * 不合并的话 42 条里一半是镜像重复，用户会以为问题翻倍了。
 * 合并后 `kinds` 保留全部类型，`raw` 保留全部原文。
 */
export interface MergedIssue extends MatchedIssue {
    kinds: UploadIssueKind[];
    raws: string[];
}

export function mergeIssuesByField(issues: MatchedIssue[]): MergedIssue[] {
    const merged = new Map<string, MergedIssue>();
    for (const issue of issues) {
        // 同一字段即视为同一条；行号可能缺失，所以只按字段名做键
        const key = (issue.resolvedField ?? issue.field ?? '').trim() || `row-${issue.rowNumber ?? 'x'}`;
        const existing = merged.get(key);
        if (existing) {
            if (!existing.kinds.includes(issue.kind)) existing.kinds.push(issue.kind);
            existing.raws.push(issue.raw);
            if (issue.currentValue) existing.currentValue = issue.currentValue;
            if (issue.rowNumber) existing.rowNumber = issue.rowNumber;
            continue;
        }
        merged.set(key, {
            ...issue,
            kinds: [issue.kind],
            raws: [issue.raw],
        });
    }
    return Array.from(merged.values());
}

export interface IssueSummary {
    total: number;
    columnNotInTemplate: number;
    attributeMissing: number;
    valueInvalid: number;
    requiredMissing: number;
    other: number;
    /** 回执里的行号 ≥2，说明导出文件带表头，口径对得上 */
    rowAligned: boolean;
}

export function summarizeIssues(issues: Array<MatchedIssue | MergedIssue>): IssueSummary {
    const summary: IssueSummary = {
        total: issues.length,
        columnNotInTemplate: 0, attributeMissing: 0, valueInvalid: 0, requiredMissing: 0, other: 0,
        rowAligned: issues.every(i => !i.rowNumber || i.rowNumber >= 2),
    };
    for (const issue of issues) {
        // 合并后的行可能带多个类型（同一字段既「列不属于模版」又「属性不存在」），
        // 分类计数按类型展开；`total` 仍是行数，所以分项之和可能大于 total。
        const kinds: UploadIssueKind[] = 'kinds' in issue ? issue.kinds : [issue.kind];
        for (const kind of kinds) {
            if (kind === 'column_not_in_template') summary.columnNotInTemplate++;
            else if (kind === 'attribute_missing') summary.attributeMissing++;
            else if (kind === 'value_invalid') summary.valueInvalid++;
            else if (kind === 'required_missing') summary.requiredMissing++;
            else summary.other++;
        }
    }
    return summary;
}
