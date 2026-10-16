import { describe, expect, it } from 'vitest';

/**
 * UI 构件一致性护栏（设计：docs/plans/2026-10-15-ui-构件规范-design.md §5）。
 *
 * 为什么需要它：同一个意图（搜索框 / 枚举筛选）在本仓库曾有 3~4 种都跑得通的写法，
 * 而「用没用共享组件」与「长得一样」是两回事——`FilterItem` 只封了容器、没封控件，
 * 于是每个页面各写各的。一致性靠记忆维持必然被击穿（多会话并行 + 手搓零成本），
 * 所以把规范做成**机器能判红**的东西。
 *
 * 读源码用 import.meta.glob（tsconfig.app.json 的 types 不含 node，不能引 fs）。
 *
 * 策略：**存量豁免 + 增量强制**。豁免清单只减不增；存量清零后删表。
 */

const SOURCES = import.meta.glob('../components/**/*.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

/** 扫描规则：每种「手搓写法」→ 应改用的构件 */
const RULES = [
    { id: 'R1', re: /<Input\.Search/g, fix: 'SearchInput' },
    { id: 'R2', re: /prefix=\{<SearchOutlined/g, fix: 'SearchInput' },
    { id: 'R3', re: /Tag\.CheckableTag/g, fix: 'FacetChips' },
    { id: 'R4', re: /label="[^"]*[:：]"/g, fix: 'FilterItem（冒号由组件补，label 不写冒号）' },
    // R5 是迁移债：ListToolbar 已取代 FilterBar 这个**外壳**，剩下的消费方属存量、逐页迁移。
    // 只匹配 JSX 用法（`<FilterBar`），不匹配 import——`FilterItem` 仍住在 FilterBar.tsx
    // 且仍是合法的标签原语，按路径匹配会误伤它的引用方。
    // 文本级护栏的边界：它抓得住「还渲染着旧外壳」，抓不住「该用 FacetChips 却用了
    // Select」这类语义偏差——那要靠 code review 兜。
    { id: 'R5', re: /<FilterBar[\s/>]/g, fix: 'ListToolbar（FilterBar 外壳已被其取代）' },
    // R6 表格行规范（docs/plans/2026-10-16-表格行规范-design.md §2.1）：
    // virtual 按固定值估行高（small 档 ≈37px），单元格含可变高内容时估位失真。
    // 这条也示范了护栏该定在哪：**定在能唯一区分的信号上**。
    // 我最初想禁「表格文件里的 <Switch>」，但实测会误伤——ConfigManagerView 的
    // Switch 在侧栏面板而非单元格；禁 flex-col 更会误伤 7 个文件的页面级布局
    // （CompareView 那 5 处全是布局壳）。文本级扫描分不清单元格内外。
    // 而 `virtual` 当前零消费，规则精确、无误报风险。
    { id: 'R6', re: /\bvirtual\b/g, fix: '去掉 virtual（行高契约见表格行规范；如需虚拟滚动请先证行高恒定）' },
] as const;

/**
 * 每种写法的唯一合法定义处：构件自身就是「正确写法」的定义，
 * 它必然包含被禁的标记（SearchInput 内部就是 prefix+SearchOutlined）。
 * 这些文件是规则的**落点**而非违例——但除此之外任何文件都不得再出现。
 */
const DEFINITION_SITE: Record<string, string> = {
    R2: 'common/SearchInput.tsx',
    R3: 'common/FacetChips.tsx',
    // DataTable 是 virtual 这个开关的定义处（它自己实现并透传），不算消费
    R6: 'common/DataTable.tsx',
};

/**
 * 已迁移到 ListToolbar 的「列表页」（设计：2026-10-16-列表页设计语言-design.md §6/§7）。
 *
 * 为什么用显式清单而不是「凡有 <Table> 就必须有 ListToolbar」：
 * 后者实测有 **20 处误报**——表格实现件（DataTable / FlatTable / RegulationTable…）
 * 和弹窗内的表（Q9 已裁定它们本就不该有工具条）都会被误伤。
 * 有误报的护栏会被绕过，比没有更糟——这一点在本仓库已实测三次
 * （禁 flex-col、禁 <Switch>、这条 R7 初版）。
 *
 * 所以：**这条护栏只锁「已经迁了的页面不许退回去」**；新页面要不要迁，
 * 由 §7 的分批清单驱动、靠 review 把关（Q11 裁定 C：机械项进护栏，语义项进文档）。
 * 迁移一批就往这里加一个文件名 —— 清单只增不减。
 */
const MIGRATED_LIST_PAGES: string[] = [
    'AnnouncementQuery/AnnouncementArchiveList.tsx',
    // 设计语言 §7 批次 1：手写 <h3> 标题行并入 ListToolbar 的 title/actions，
    // 导出按钮按 §5.1 收进下拉（≥3 个动作）、标题行只留 1 个 primary。
    'SmartFiller/MatchResultTable.tsx',
];

/**
 * 存量豁免：规范落地前的既有写法（2026-10-15 实测 13 文件 29 处）。
 * **只减不增**——修完一处就删一处；新增文件不得入内。
 * 数字是当时的处数，护栏会在不匹配时提示（改小了记得同步）。
 *
 * 已完成迁移（不在此表，即受全量约束）：
 * - AnnouncementQuery/AnnouncementArchiveList.tsx → ListToolbar + FacetChips + SearchInput
 * - SmartFiller/MatchResultTable.tsx → ListToolbar + FacetChips + SearchInput
 */
const LEGACY_EXEMPT: Record<string, number> = {
    'AssetLibrary/AssetListDrawer.tsx': 1,
    'DataPurify/DataPurifyView.tsx': 8,
    'DiffViewer/DiffResultView.tsx': 6,
    'ParameterWorkbench/AssetPool/AssetFilterBar.tsx': 1,
    'ParameterWorkbench/AssetPool/AssetSidebar.tsx': 1,
    'ParameterWorkbench/CompareView.tsx': 1,
    'ParameterWorkbench/FileManager.tsx': 1,
    'ParameterWorkbench/MultiVehicleView.tsx': 1,
    'RegulationLibrary/RegulationFilterPanel.tsx': 1,
    'SmartFiller/ConfigManagerView.tsx': 4,
    'SmartFiller/CoreFieldRuleComposer.tsx': 1,
    'SmartFiller/EnumImportModal.tsx': 2,
};

/** glob 键是相对本文件的路径，归一为 `src/components/` 之后的相对路径 */
const relKey = (globKey: string): string => globKey.replace(/^\.\.\/components\//, '');

/**
 * 扫描前剥掉注释：规则讲解本身要能写出违规写法（如「取代 Tag.CheckableTag」），
 * 否则护栏会惩罚文档。只剥注释、不剥字符串，避免漏掉真实调用。
 */
const stripComments = (src: string): string =>
    src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** 某文件对某规则的命中数；定义处自身豁免（它就是该写法的唯一定义） */
const hitsFor = (rel: string, src: string, ruleId: string): number => {
    if (DEFINITION_SITE[ruleId] === rel) return 0;
    const rule = RULES.find(r => r.id === ruleId)!;
    return stripComments(src).match(rule.re)?.length ?? 0;
};

const countHits = (rel: string, src: string): number =>
    RULES.reduce((sum, r) => sum + hitsFor(rel, src, r.id), 0);

const ruleHitsOf = (rel: string, src: string): string[] =>
    RULES.filter(r => hitsFor(rel, src, r.id) > 0).map(r => `${r.id}→${r.fix}`);

describe('UI 构件一致性护栏', () => {
    it('非豁免文件不得手搓搜索框 / 筛选控件（R1–R4）', () => {
        const offenders: string[] = [];
        for (const [key, src] of Object.entries(SOURCES)) {
            const rel = relKey(key);
            if (rel.startsWith('__tests__/') || rel.includes('/__tests__/')) continue;
            if (rel in LEGACY_EXEMPT) continue;
            const hits = countHits(rel, src);
            if (hits > 0) offenders.push(`${rel} → ${ruleHitsOf(rel, src).join(', ')}`);
        }
        expect(
            offenders,
            `新增/未豁免的文件出现手搓写法，请改用共享构件：\n${offenders.join('\n')}`,
        ).toEqual([]);
    });

    it('每种写法的定义处必须唯一：构件之外不得再有人实现一遍', () => {
        // SearchInput 内部就是 prefix+SearchOutlined，FacetChips 内部就是 chip——
        // 它们是规则的落点。真正要防的是「构件之外又冒出第二个实现」。
        for (const [ruleId, site] of Object.entries(DEFINITION_SITE)) {
            expect(Object.keys(SOURCES).map(relKey), `${ruleId} 的定义处缺失`).toContain(site);
        }
    });

    it('豁免清单里的文件必须仍然存在（防陈旧豁免长期挂着）', () => {
        const present = new Set(Object.keys(SOURCES).map(relKey));
        const stale = Object.keys(LEGACY_EXEMPT).filter(f => !present.has(f));
        expect(stale, `以下豁免项已不存在，请从 LEGACY_EXEMPT 删除：\n${stale.join('\n')}`).toEqual([]);
    });

    it('豁免清单只减不增：处数不得比登记时更多', () => {
        const grown: string[] = [];
        for (const [rel, registered] of Object.entries(LEGACY_EXEMPT)) {
            const key = `../components/${rel}`;
            const src = SOURCES[key];
            if (!src) continue; // 存在性由上一条用例负责
            const now = countHits(rel, src);
            if (now > registered) grown.push(`${rel}: 登记 ${registered} → 现在 ${now}`);
        }
        expect(grown, `豁免文件里手搓写法变多了（豁免是给存量兜底的，不是合法通道）：\n${grown.join('\n')}`).toEqual([]);
    });

    it('已迁移的列表页必须继续用 ListToolbar，且不得退回手写外壳（R7）', () => {
        const missing: string[] = [];
        const regressed: string[] = [];
        for (const rel of MIGRATED_LIST_PAGES) {
            const src = SOURCES[`../components/${rel}`];
            expect(src, `${rel} 不在扫描范围内（文件名写错了？）`).toBeTruthy();
            if (!src) continue;
            const code = stripComments(src);
            if (!/\bListToolbar\b/.test(code)) missing.push(rel);
            // 退回手写外壳的信号：自己拼 <h3> 当标题行、或重新引入旧 FilterBar
            if (/<h3[\s>]/.test(code)) regressed.push(`${rel}（手写 <h3> 标题行）`);
            if (/<FilterBar[\s/>]/.test(code)) regressed.push(`${rel}（退回 <FilterBar>）`);
        }
        expect(missing, `以下页面不再使用 ListToolbar：\n${missing.join('\n')}`).toEqual([]);
        expect(regressed, `以下页面退回手写外壳：\n${regressed.join('\n')}`).toEqual([]);
    });

    it('存量违规总量有账可查（改小了请同步 LEGACY_EXEMPT 数字）', () => {
        let total = 0;
        for (const rel of Object.keys(LEGACY_EXEMPT)) {
            const src = SOURCES[`../components/${rel}`];
            if (src) total += countHits(rel, src);
        }
        // 只断言「不高于登记总量」，避免存量清零过程中的数字同步成为噪音
        const budget = Object.values(LEGACY_EXEMPT).reduce((a, b) => a + b, 0);
        expect(total).toBeLessThanOrEqual(budget);
    });
});
