import { describe, expect, it } from 'vitest';
import getThemeConfig, { FONT_LADDER, FONT_SANS, TABLE_DENSITY } from '../themeConfig';

/**
 * 主题单测（设计：docs/plans/2026-10-17-列表区统一设计语言-design.md §2–§3）。
 * 防的是「antd token 与 index.css 变量各说各话」——此前 info 色、字体栈、
 * small/middle 表格密度都曾在两边不一致。
 */

const readIndexCss = async (): Promise<string> => {
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
        readFileSync: (path: string, encoding: 'utf8') => string;
    };
    const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd();
    return readFileSync(`${cwd}/src/index.css`, 'utf8');
};

const cssVar = (css: string, name: string): string => {
    const m = css.match(new RegExp(`${name}:\\s*([^;]+);`));
    return (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
};

describe('表格密度只有一档（§3）', () => {
    it.each([12, 13, 15])('字号 %ipx：small / middle / large 三种 size 内边距一致', fs => {
        const t = getThemeConfig(false, fs).components?.Table as Record<string, unknown>;
        for (const k of ['cellPaddingBlock', 'cellPaddingBlockMD', 'cellPaddingBlockSM']) {
            expect(t[k], k).toBe(TABLE_DENSITY.cellPaddingBlock);
        }
        for (const k of ['cellPaddingInline', 'cellPaddingInlineMD', 'cellPaddingInlineSM']) {
            expect(t[k], k).toBe(TABLE_DENSITY.cellPaddingInline);
        }
        for (const k of ['cellFontSize', 'cellFontSizeMD', 'cellFontSizeSM']) {
            expect(t[k], k).toBe(fs);
        }
    });
});

describe('字号阶梯与 CSS 同源（§2.2）', () => {
    it.each([12, 13, 15])('字号 %ipx：fontSizeSM = aux 档，Card 标题 = title 档', fs => {
        const cfg = getThemeConfig(false, fs);
        expect(cfg.token?.fontSizeSM).toBe(FONT_LADDER[fs].aux);
        const card = cfg.components?.Card as Record<string, unknown>;
        expect(card.headerFontSize).toBe(FONT_LADDER[fs].title);
    });

    it('FONT_LADDER 与 index.css 的 --fs-aux / --fs-title 三档一致', async () => {
        const css = await readIndexCss();
        // 默认档（13px）定义在 :root
        expect(cssVar(css, '--fs-aux')).toBe(`${FONT_LADDER[13].aux}px`);
        expect(cssVar(css, '--fs-title')).toBe(`${FONT_LADDER[13].title}px`);
        for (const fs of [12, 15]) {
            expect(css).toContain(`--fs-aux: ${FONT_LADDER[fs].aux}px`);
            expect(css).toContain(`--fs-title: ${FONT_LADDER[fs].title}px`);
        }
    });
});

describe('token 与 index.css 变量同源', () => {
    it('亮色 info 色 = --info（不再撞品牌主色）', async () => {
        const css = await readIndexCss();
        const light = getThemeConfig(false, 13);
        expect(light.token?.colorInfo?.toLowerCase()).toBe(cssVar(css, '--info').toLowerCase());
        expect(light.token?.colorInfo).not.toBe(light.token?.colorPrimary);
    });

    it('fontFamily = --font-sans', async () => {
        const css = await readIndexCss();
        expect(getThemeConfig(false, 13).token?.fontFamily).toBe(FONT_SANS);
        expect(FONT_SANS.replace(/\s+/g, ' ').trim()).toBe(cssVar(css, '--font-sans'));
    });
});
