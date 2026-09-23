/**
 * 资产标签批量操作纯函数。
 *
 * 标签存储模型见 assetManager.ts：Record<fileName, string[]>。
 * 批量添加语义：
 * - 普通标签：合并且去重，不覆盖资产已有标签；
 * - 互斥组标签：替换组内已有标签（与单卡片 TagSelector 的互斥行为一致），
 *   组内一次输入多个时按输入顺序 last-wins。
 */

/**
 * 解析批量标签输入：支持中英文逗号、顿号、空白（空格/换行/Tab）分隔，去空、去重、保序。
 */
export const parseBatchTagInput = (input: string): string[] => {
    const tags: string[] = [];
    const seen = new Set<string>();
    input
        .split(/[,，、\s]+/)
        .map(t => t.trim())
        .filter(Boolean)
        .forEach(t => {
            if (!seen.has(t)) {
                seen.add(t);
                tags.push(t);
            }
        });
    return tags;
};

export interface BatchTagOptions {
    /** 互斥组标签集合列表：新增某集合内标签时，替换资产上该集合的已有标签 */
    exclusiveGroupTags?: string[][];
}

/**
 * 计算批量添加标签后的变更项。
 * 只返回发生变化的条目（结果与原有相同的条目不返回），不修改传入的 currentTags。
 */
export const buildBatchTagUpdates = (
    currentTags: Record<string, string[]>,
    fileNames: string[],
    tagsToAdd: string[],
    options: BatchTagOptions = {}
): Record<string, string[]> => {
    const updates: Record<string, string[]> = {};
    if (tagsToAdd.length === 0) return updates;
    const exclusiveSets = (options.exclusiveGroupTags ?? [])
        .map(tags => new Set(tags.filter(Boolean)))
        .filter(set => set.size > 0);

    const ownerIndex = (tag: string) => exclusiveSets.findIndex(set => set.has(tag));

    // 每个互斥组的最终胜出标签（输入顺序 last-wins）与发生替换的组
    const winners: (string | null)[] = exclusiveSets.map(() => null);
    const replacedGroups = new Set<number>();
    for (const tag of tagsToAdd) {
        const gi = ownerIndex(tag);
        if (gi >= 0) {
            winners[gi] = tag;
            replacedGroups.add(gi);
        }
    }
    // 生效的新增列表（保持输入顺序；互斥组只保留胜者）
    const finalAdds: string[] = [];
    const emitted = new Set<string>();
    for (const tag of tagsToAdd) {
        const gi = ownerIndex(tag);
        const effective = gi >= 0 ? winners[gi]! : tag;
        if (!emitted.has(effective)) {
            emitted.add(effective);
            finalAdds.push(effective);
        }
    }

    for (const fileName of fileNames) {
        const existing = currentTags[fileName] || [];
        // 本轮涉及替换的互斥组：剥离组内已有标签，胜者随后由 finalAdds 补回
        const base = existing.filter(t => {
            const gi = ownerIndex(t);
            return !(gi >= 0 && replacedGroups.has(gi));
        });
        const merged = [...base];
        const seen = new Set(base);
        for (const tag of finalAdds) {
            if (!seen.has(tag)) {
                seen.add(tag);
                merged.push(tag);
            }
        }
        const changed = merged.length !== existing.length || merged.some((t, i) => t !== existing[i]);
        if (changed) {
            updates[fileName] = merged;
        }
    }
    return updates;
};
