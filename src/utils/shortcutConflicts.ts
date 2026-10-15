import { combosOf, SHORTCUT_SCOPES, type ShortcutEntry, type ShortcutScope } from '../constants/shortcuts';

/**
 * 快捷键冲突检测（设计：docs/plans/2026-10-15-快捷键管理-design.md §4.3）。
 *
 * 判定规则：**跨作用域**同一 combo 被 ≥2 个 scope 占用 = 冲突。
 *
 * 为什么是「跨作用域」而非「同作用域」：
 * - 跨作用域的两个 handler 互不知情、都会响应同一次按键——这正是实际 bug 的机理
 *   （如 Esc 同时触发全局「关弹层」与资产池「退出当前态」）。
 * - 同作用域内的同 combo 是**作用域内优先级**问题（一个 handler 内从上到下 `return`），
 *   由该 handler 自己决定，不是本检测的职责。
 *
 * 归一化：只比较 combo 字符串（已是注册表的规范形式）。`escape` 出现在全局与资产池
 * 两处即判冲突——是**如实反映**现状，不因「其中一个更具体」而豁免。
 */
export interface ConflictGroup {
    combo: string;
    /** 占用它的作用域（去重、按 SHORTCUT_SCOPES 顺序） */
    scopes: ShortcutScope[];
    /** 占用它的条目（供设置页列出说明） */
    entries: ShortcutEntry[];
}

const scopeOrder = new Map(SHORTCUT_SCOPES.map((s, i) => [s.key, i]));

export function findShortcutConflicts(entries: readonly ShortcutEntry[]): ConflictGroup[] {
    // combo → 命中条目
    const byCombo = new Map<string, ShortcutEntry[]>();
    for (const entry of entries) {
        for (const combo of combosOf(entry)) {
            const list = byCombo.get(combo);
            if (list) list.push(entry);
            else byCombo.set(combo, [entry]);
        }
    }

    const conflicts: ConflictGroup[] = [];
    for (const [combo, hit] of byCombo) {
        const scopes = [...new Set(hit.map(e => e.scope))];
        if (scopes.length < 2) continue; // 同作用域内的优先级，不算冲突
        scopes.sort((a, b) => (scopeOrder.get(a) ?? 0) - (scopeOrder.get(b) ?? 0));
        conflicts.push({ combo, scopes, entries: hit });
    }

    // 稳定排序：先按 combo 字典序，便于快照与阅读
    conflicts.sort((a, b) => a.combo.localeCompare(b.combo));
    return conflicts;
}

/** 某条目是否落在任一冲突组里（设置页给该行加「冲突」标） */
export function conflictingIds(conflicts: readonly ConflictGroup[]): Set<string> {
    const ids = new Set<string>();
    for (const g of conflicts) for (const e of g.entries) ids.add(e.id);
    return ids;
}

export const scopeLabel = (scope: ShortcutScope): string =>
    SHORTCUT_SCOPES.find(s => s.key === scope)?.label ?? scope;
