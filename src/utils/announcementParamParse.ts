import type { VehicleParameter } from '../types';

/**
 * 「其它」大字段解析（公告参数表里那一格编号明细）。
 *
 * 工信部参数表把储能装置种类/生产企业、驱动电机额定功率/峰值功率、ABS 型号/生产企业
 * 等明细全塞在「其它」一格：`1.键:值;2.键:值;3.叙述…`。下游按参数名取值（智能填报匹配、
 * 与公告对比、资产命名），整格原文没法用，这里拆成独立参数：
 * - 「键:值」式 → 键为参数名（尾部括号如「(单体/总成)」剥掉，与规范字段名对齐）；
 * - 叙述式（EDR/ETC/选装清单等）→ 名为「其它-N」，N 优先用原文序号；
 * - 原文整格不删（调用方保留原件），拆分幂等（见 normalizeOtherParams）。
 */

/** 子项分组名；同时作为「已拆分」标记，勿随意改名（旧记录无此分组 → 读取时自动再拆一遍） */
export const OTHER_PARAM_GROUP = '其它-详细参数';

/** 「其它」格子的参数名（「其」/「其他」两种写法都见过） */
export const OTHER_PARAM_NAMES: readonly string[] = ['其它', '其他'];
const OTHER_NAME_SET = new Set(OTHER_PARAM_NAMES);

/** 「1./2.」式序号起点：序号前不接数字（防「1985 2.」连写误切）、点后不接数字（防吃小数点） */
const NUMBERED_START = /(?<!\d)\d{1,2}[.．](?!\d)/g;
/** 单条明细的「序号.」前缀，同样带小数点护栏 */
const ITEM_NUMBER_PREFIX = /^(\d{1,2})[.．](?!\d)\s*([\s\S]+)$/;
/** 「键:值」明细：键限定短且不含标点（防把带冒号的整句当键值） */
const KEY_VALUE = /^([^:：,，。;；]{2,60})[：:]\s*([\s\S]+)$/;

/** 剥键名尾部括号：「储能装置种类/生产企业(单体/总成)」→「储能装置种类/生产企业」 */
const stripTrailingBracket = (name: string): string => {
    const stripped = name.replace(/[（(][^（()）]*[)）]\s*$/, '').trim();
    return stripped || name;
};

/** 按「1./2.」式序号把一段文本切段（序号本身留在段首，由 ITEM_NUMBER_PREFIX 再解析） */
const splitByNumbering = (chunk: string): string[] => {
    const indices: number[] = [];
    NUMBERED_START.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NUMBERED_START.exec(chunk)) !== null) {
        if (m.index > 0) indices.push(m.index);
    }
    if (indices.length === 0) return [chunk];
    const parts: string[] = [];
    let prev = 0;
    for (const i of indices) {
        parts.push(chunk.slice(prev, i));
        prev = i;
    }
    parts.push(chunk.slice(prev));
    return parts;
};

export interface OtherSubParam {
    name: string;
    value: string;
}

/**
 * 拆「其它」格原文为子项（纯函数）。
 * 无可拆内容（整格就是一句叙述、或只有一个键值项之外的短句）时返回 []，由原文整格覆盖。
 */
export const splitOtherParamValue = (raw: unknown): OtherSubParam[] => {
    // 换行是 PDF/表格复制的排版噪声，直接抹掉（行内粘连优于把一条明细劈成两条）
    const text = String(raw ?? '').replace(/[\r\n]+/g, '').trim();
    if (!text) return [];

    const items: { num: string | null; body: string; keyed: boolean }[] = [];
    for (const chunk of text.split(/[;；]/)) {
        for (const piece of splitByNumbering(chunk)) {
            const trimmed = piece.trim().replace(/[;；.．]+$/, '').trim();
            if (!trimmed) continue;
            const numbered = trimmed.match(ITEM_NUMBER_PREFIX);
            const body = numbered ? numbered[2].trim() : trimmed;
            if (!body) continue;
            items.push({ num: numbered ? numbered[1] : null, body, keyed: KEY_VALUE.test(body) });
        }
    }
    if (items.length === 0) return [];
    // 单条且无「键:值」结构 → 拆出来的子和原文整格一样，没必要复制一份
    if (items.length === 1 && !items[0].keyed) return [];

    return items.map((item, i) => {
        if (item.keyed) {
            const kv = item.body.match(KEY_VALUE)!;
            const name = stripTrailingBracket(kv[1].trim());
            if (name) return { name, value: kv[2].trim() };
        }
        return { name: `其它-${item.num ?? i + 1}`, value: item.body };
    });
};

/**
 * 读时归一：把「其它」整格拆成子项参数（原整格保留在子项之前）。
 * 幂等——带子项分组即视为拆过（旧记录/迁移记录无分组，读取时自动补拆）；
 * 无改动时原样返回同一引用。
 */
export const normalizeOtherParams = (params: VehicleParameter[]): VehicleParameter[] => {
    if (!Array.isArray(params) || params.length === 0) return params;
    if (params.some(p => p.group === OTHER_PARAM_GROUP)) return params;

    const out: VehicleParameter[] = [];
    let changed = false;
    params.forEach(p => {
        out.push(p);
        if (!OTHER_NAME_SET.has(String(p.name ?? '').trim())) return;
        const subs = splitOtherParamValue(p.value);
        if (subs.length === 0) return;
        changed = true;
        subs.forEach((sub, i) => {
            out.push({
                id: `${p.id || 'other'}-sub-${i + 1}`,
                group: OTHER_PARAM_GROUP,
                name: sub.name,
                value: sub.value,
                originSheet: p.originSheet,
                productName: p.productName,
                instanceKey: p.instanceKey,
            });
        });
    });
    return changed ? out : params;
};
