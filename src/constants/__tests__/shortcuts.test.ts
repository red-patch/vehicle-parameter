import { describe, expect, it } from 'vitest';
import {
    combosOf,
    formatCombos,
    formatShortcut,
    SHORTCUT_SCOPES,
    SHORTCUTS,
} from '../shortcuts';
import { findShortcutConflicts } from '../../utils/shortcutConflicts';

const COMBO_RE = /^(mod\+)?(shift\+)?(alt\+)?([a-z0-9,./]|enter|space|escape|arrowup|arrowdown|arrowleft|arrowright)$/;

describe('快捷键注册表', () => {
    it('id 唯一', () => {
        const ids = SHORTCUTS.map(s => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('每个 combo 语法合法', () => {
        for (const entry of SHORTCUTS) {
            for (const combo of combosOf(entry)) {
                expect(COMBO_RE.test(combo), `${entry.id} 的 combo「${combo}」不合语法`).toBe(true);
            }
        }
    });

    it('每个 entry 的 scope 都在 SHORTCUT_SCOPES 里', () => {
        const known = new Set(SHORTCUT_SCOPES.map(s => s.key));
        for (const entry of SHORTCUTS) {
            expect(known.has(entry.scope), `${entry.id} 的 scope 未知`).toBe(true);
        }
    });

    it('描述非空', () => {
        for (const entry of SHORTCUTS) {
            expect(entry.description.trim().length, `${entry.id} 缺说明`).toBeGreaterThan(0);
        }
    });

    // 真实注册表的已知冲突——不是写死清单，是算出来的；
    // 绑定一变这里会跟着变，正是我们要的「检测而非声明」。
    it('如实报出跨作用域冲突：mod+s（全局保存 vs 系统保存视图）与 escape（全局关弹层 vs 资产池退出态）', () => {
        const real = findShortcutConflicts(SHORTCUTS).map(c => c.combo);
        expect(real).toContain('mod+s');
        expect(real).toContain('escape');
    });
});

describe('formatShortcut', () => {
    it('macOS：符号 + 无分隔', () => {
        expect(formatShortcut('mod+shift+a', true)).toBe('⌘⇧A');
        expect(formatShortcut('mod+,', true)).toBe('⌘,');
        expect(formatShortcut('escape', true)).toBe('Esc');
    });

    it('Windows：词 + 加号分隔', () => {
        expect(formatShortcut('mod+shift+a', false)).toBe('Ctrl+Shift+A');
        expect(formatShortcut('mod+,', false)).toBe('Ctrl+,');
    });

    it('方向键渲染为箭头', () => {
        expect(formatShortcut('arrowup', true)).toBe('↑');
        expect(formatShortcut('arrowenter', false)).not.toBe(''); // 未知键不崩
    });

    it('formatCombos 拼多键', () => {
        expect(formatCombos(['mod+1', 'mod+2'], true)).toBe('⌘1 ⌘2');
    });
});
