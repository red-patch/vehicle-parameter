import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AGENTS.md 防漂移护栏（LESSONS L-4）。
 *
 * AGENTS.md 是每个 agent 开工必读、并且会被当作事实执行的文档：指向不存在的文件、
 * 已改名的构件或不存在的 npm 命令，比没写更糟。这里校验文中能机器核对的引用：
 * - Markdown 相对链接
 * - 反引号里的仓库路径（src/ docs/ scripts/ src-tauri/ .agent/ .github/ 开头）
 * - UI 构件表里的简写（`common/ListToolbar`、`utils/libraryPathPrompt`）
 * - 带 `()` 的函数名（必须在 src 里有导出）
 * - `npm run <脚本>`（必须在 package.json 里）
 */
// jsdom 环境下 import.meta.url 不是 file: 协议，用 vite-node 注入的 __dirname 定位仓库根
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

const AGENTS = read('AGENTS.md');
const scripts: Record<string, string> = JSON.parse(read('package.json')).scripts;

/** 反引号片段（行内代码） */
const inlineCode = (md: string): string[] => [...md.matchAll(/`([^`\n]+)`/g)].map(m => m[1].trim());

/** 占位写法（日期模板、省略号、通配）不是具体路径 */
const isPlaceholder = (token: string) => /YYYY|…|\*|<|\{|\$/.test(token);

describe('AGENTS.md 引用不得悬空', () => {
    it('Markdown 相对链接都指向存在的文件或目录', () => {
        const missing = [...AGENTS.matchAll(/\]\(([^)\s]+)\)/g)]
            .map(m => decodeURIComponent(m[1]).replace(/#.*$/, ''))
            .filter(href => href && !/^[a-z]+:/i.test(href))
            .filter(href => !exists(href));
        expect(missing).toEqual([]);
    });

    it('反引号里的仓库路径都存在', () => {
        const missing = inlineCode(AGENTS)
            .filter(t => /^(src|docs|scripts|src-tauri|\.agent|\.github)\//.test(t) && !/\s/.test(t))
            .filter(t => !isPlaceholder(t))
            .filter(t => !exists(t));
        expect(missing).toEqual([]);
    });

    it('UI 构件表里的构件简写都存在（common/* → src/components/common，utils/* → src/utils）', () => {
        const tokens = inlineCode(AGENTS).filter(t => /^(common|utils)\/\w+$/.test(t));
        expect(tokens.length).toBeGreaterThan(5); // 构件表还在
        const missing = tokens.filter(t => {
            const base = t.startsWith('common/') ? `src/components/${t}` : `src/${t}`;
            return !['.tsx', '.ts'].some(ext => exists(base + ext));
        });
        expect(missing).toEqual([]);
    });

    it('点名的函数（`name()`）在 src 里有导出', () => {
        const names = [...new Set(inlineCode(AGENTS).map(t => /^(\w+)\(\)$/.exec(t)?.[1]).filter(Boolean))] as string[];
        const sources = Object.values(
            import.meta.glob(['../**/*.{ts,tsx}', '!../**/__tests__/**'], { query: '?raw', import: 'default', eager: true }),
        ) as string[];
        const missing = names.filter(
            n => !sources.some(src => new RegExp(`export (?:async )?(?:function|const) ${n}\\b`).test(src)),
        );
        expect(names.length).toBeGreaterThan(0);
        expect(missing).toEqual([]);
    });

    it('`npm run <脚本>` 都在 package.json 里', () => {
        const missing = [...new Set([...AGENTS.matchAll(/npm run ([\w:-]+)/g)].map(m => m[1]))].filter(s => !(s in scripts));
        expect(missing).toEqual([]);
    });

    it('CLAUDE.md 只做引入，规则不在两处各写一份', () => {
        const claude = read('CLAUDE.md');
        expect(claude).toContain('@AGENTS.md');
        expect(claude.split('\n').filter(l => l.trim() && !l.trim().startsWith('<!--')).length).toBe(1);
    });
});
