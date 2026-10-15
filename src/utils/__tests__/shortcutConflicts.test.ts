import { describe, expect, it } from 'vitest';
import { findShortcutConflicts, conflictingIds, scopeLabel } from '../shortcutConflicts';
import type { ShortcutEntry } from '../../constants/shortcuts';

const e = (id: string, scope: ShortcutEntry['scope'], combo: string | string[]): ShortcutEntry => ({
    id,
    scope,
    combo,
    description: id,
});

describe('findShortcutConflicts', () => {
    it('跨作用域同 combo 判为冲突', () => {
        const entries = [
            e('a', 'global', 'escape'),
            e('b', 'assetPool', 'escape'),
        ];
        const groups = findShortcutConflicts(entries);
        expect(groups).toHaveLength(1);
        expect(groups[0].combo).toBe('escape');
        expect(groups[0].scopes).toEqual(['global', 'assetPool']);
    });

    it('同作用域同 combo 不判冲突（那是作用域内优先级）', () => {
        const entries = [
            e('a', 'assetPool', 'mod+s'),
            e('b', 'assetPool', 'mod+s'),
        ];
        expect(findShortcutConflicts(entries)).toEqual([]);
    });

    it('不同 combo 不冲突', () => {
        const entries = [
            e('a', 'global', 'mod+f'),
            e('b', 'assetPool', 'mod+r'),
        ];
        expect(findShortcutConflicts(entries)).toEqual([]);
    });

    it('combo 数组里任一命中即参与冲突（方向键四向）', () => {
        const entries = [
            e('a', 'assetPool', ['arrowup', 'arrowdown']),
            e('b', 'vehicleDesigner', 'arrowup'),
        ];
        const groups = findShortcutConflicts(entries);
        expect(groups).toHaveLength(1);
        expect(groups[0].combo).toBe('arrowup');
    });

    it('冲突组按 combo 字典序稳定排序', () => {
        const entries = [
            e('a', 'global', 'mod+w'),
            e('b', 'assetPool', 'mod+w'),
            e('c', 'global', 'escape'),
            e('d', 'assetPool', 'escape'),
        ];
        const groups = findShortcutConflicts(entries);
        expect(groups.map(g => g.combo)).toEqual(['escape', 'mod+w']);
    });

    it('conflictingIds 收全冲突条目', () => {
        const entries = [
            e('a', 'global', 'escape'),
            e('b', 'assetPool', 'escape'),
            e('c', 'assetPool', 'mod+r'),
        ];
        const ids = conflictingIds(findShortcutConflicts(entries));
        expect([...ids].sort()).toEqual(['a', 'b']);
    });

    it('scopeLabel 回中文名', () => {
        expect(scopeLabel('assetPool')).toBe('车型资产池');
        expect(scopeLabel('global')).toBe('全局');
    });
});
