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
    // R5 是迁移债：ListToolbar 已取代 FilterBar 这个**外壳**（2026-10-16 批次 9 后
    // 外壳的消费方已清零，FilterBar.tsx 已删除，FilterItem 迁入 ListToolbar.tsx）。
    // 规则保留为回归锁：旧外壳若被重新引入即报红。只匹配 JSX 用法（`<FilterBar`），
    // 不匹配 import——按路径匹配会误伤引用 FilterItem 的文件。
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
    // 设计语言 §7 批次 3：结果区三段落位（display 段独立）、删除重复导出入口。
    'ParameterWorkbench/CompareView.tsx',
    // 设计语言 §7 批次 4：三块并列（无标题操作行 + 筛选 Card + 记录 Card）合并为
    // ListToolbar 三段；清掉全仓最后一处 Input.Search。
    'RegulationLibrary/RegulationLibrary.tsx',
    // 设计语言 §7 批次 5：FilterBar 外壳 → ListToolbar 三段；搜索换 SearchInput；
    // 快捷筛选由变色主按钮换 FacetChips；去掉硬编码 bg-orange/green（绕过 token）。
    'DataPurify/DataPurifyView.tsx',
    // 设计语言 §7 批次 9：DiffViewer 是 FilterBar 最后一个外壳消费方；
    // 迁完即退役该外壳（FilterBar.tsx 已删，FilterItem 迁入 ListToolbar.tsx）。
    'DiffViewer/DiffResultView.tsx',
    // 设计语言 §7 批次 6：Card 外壳 → ListToolbar；页级搜索换 SearchInput；
    // Tab 内动作行按 §5.1 收进下拉（只留 1 个 primary）。
    'SmartFiller/ConfigManagerView.tsx',
    // 列表区统一设计语言（2026-10-17）§4：智能填报的两个多车结果区由
    // 「手写 border 容器 + <h3> 标题 + 手搓搜索框」迁到 ListToolbar。
    'ParameterWorkbench/BidPullView.tsx',
    'ParameterWorkbench/MultiVehicleView.tsx',
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
    'ParameterWorkbench/AssetPool/AssetSidebar.tsx': 1,
    'ParameterWorkbench/FileManager.tsx': 1,
    // 剩 1 处：AutoComplete 的内层 Input（带 options 下拉的组合框，非搜索框；
    // SearchInput 不支持 options）。这是文本级护栏的固有边界，见 R2 注释。
    'SmartFiller/ConfigManagerView.tsx': 1,
    'SmartFiller/CoreFieldRuleComposer.tsx': 1,
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

    it('资产池筛选条保留 ChipShell，不得被替换为 FacetChips（合法例外）', () => {
        // 用户明确要求保护资产池的筛选交互。ChipShell 是「下拉式 facet」，
        // 内嵌 InputNumber（电量区间）/ TextArea（公告号粘贴口）/ 值列表；
        // FacetChips 是「平铺式 + 定长枚举」，装不下这些语义。换掉会改变
        // 资产池最核心的筛选交互——此用例即为防止它被「顺手统一」掉。
        // 见 docs/plans/2026-10-16-列表页设计语言-design.md §7.1。
        const src = SOURCES['../components/ParameterWorkbench/AssetPool/AssetFilterBar.tsx'];
        expect(src, 'AssetFilterBar.tsx 不在扫描范围内（改名了？请同步本用例与 §7.1）').toBeTruthy();
        const code = stripComments(src!);
        expect(code, '筛选条不再使用 ChipShell——资产池筛选交互被改动').toContain('ChipShell');
        expect(code, '筛选条混入了 FacetChips——ChipShell 是已登记的合法例外').not.toContain('FacetChips');
    });

    it('前置条件提示走共享构件，不得手写（R8–R10）', () => {
        // 这三条与 R1–R6 分开：它们锁的是「引导文案 + 直达入口」这一意图，而非控件形态。
        // - R8 未选车：此前三页各自手写 Alert，只有一句话、没有去选车的按钮；
        // - R9 未设资产库目录：此前 5 种说法，其中「数据源面板」「应用右上角」指向不存在/不准确的入口；
        // - R10 暗色下 --brand 是浅色文字色，拿来当底色配白字看不清，实色填充只走 bg-brand-fill。
        const LOCAL_RULES = [
            { id: 'R8', re: /请先在「车型资产」中选择车型/g, site: 'common/SelectVehiclesHint.tsx', fix: 'SelectVehiclesHint（带「去车型资产选择」按钮）' },
            { id: 'R9', re: /数据源面板|应用右上角|资产库大目录|请先设置资产库(?:目录|路径)/g, site: '', fix: 'utils/libraryPathPrompt 的 warnLibraryPathMissing / LIBRARY_PATH_MISSING_TEXT' },
            { id: 'R10', re: /\bbg-brand(?![-\w])[^'"`\n]*\btext-white\b|\btext-white\b[^'"`\n]*\bbg-brand(?![-\w])/g, site: '', fix: 'bg-brand-fill（暗色下 --brand 不适合当白字底色）' },
        ];
        const offenders: string[] = [];
        for (const [key, src] of Object.entries(SOURCES)) {
            const rel = relKey(key);
            if (rel.startsWith('__tests__/') || rel.includes('/__tests__/')) continue;
            const code = stripComments(src);
            for (const rule of LOCAL_RULES) {
                if (rule.site === rel) continue;
                const hits = code.match(rule.re)?.length ?? 0;
                if (hits > 0) offenders.push(`${rel} → ${rule.id}→${rule.fix}`);
            }
        }
        expect(offenders, `出现手写前置提示，请改用共享构件：\n${offenders.join('\n')}`).toEqual([]);
        expect(Object.keys(SOURCES).map(relKey), 'R8 的定义处缺失').toContain('common/SelectVehiclesHint.tsx');
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

/**
 * 列表区统一设计语言护栏（设计：docs/plans/2026-10-17-列表区统一设计语言-design.md §11）。
 *
 * 与上面 R1–R10 同一策略：只锁**能唯一区分的文本信号**，语义项（该不该是 primary、
 * 状态该不该用圆点）留给文档 + review。每条都先实测零误报再入表。
 */
/**
 * index.css 不能走 import.meta.glob ?raw：vitest 默认把 .css 模块替换为空串。
 * 改为运行时读文件；模块名用变量传入，避开 tsconfig.app.json 不含 node 类型的限制。
 */
const readIndexCss = async (): Promise<string> => {
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
        readFileSync: (path: string, encoding: 'utf8') => string;
    };
    // import.meta.url 在 vitest(jsdom) 下不是 file:// 协议，改用 cwd（vitest 根 = 仓库根）
    const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd();
    return readFileSync(`${cwd}/src/index.css`, 'utf8');
};

const ALL_TS_SOURCES = import.meta.glob(['../**/*.{ts,tsx}', '!../**/__tests__/**'], {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

const LIST_RULES = [
    // R11 表格竖线：一档密度下只用横向分隔线（行），列靠对齐与留白区分。
    // 只匹配「独占一行的 bordered」与「<Table … bordered」——Descriptions 的 bordered 是合法用法。
    { id: 'R11', re: /^\s*bordered(?:=\{true\})?\s*$|<(?:Data)?Table\b[^>\n]*\sbordered\b/gm, fix: '去掉 bordered（表格不画竖线，§3.3）' },
    // R12 分页条数字面量：只有 pagePagination / compactPagination 两档（§6）
    { id: 'R12', re: /pageSize:\s*\d+|pageSize=\{\d+\}|[pP]ageSize\]\s*=\s*useState\(\d+\)/g, fix: 'common/tablePresets 的 pagePagination() / compactPagination()' },
    // R13 列表外壳不加投影：面板层级靠描边，不靠阴影（暗色下投影不可见，两套主题表现不一）
    { id: 'R13', re: /\bshadow-sm\b/g, fix: '去掉 shadow-sm（面板 = 描边 + 圆角 8，无投影，§4）' },
    // R14 阶梯外字号：最小档 caption = 11px；10px 及以下来自 antd 算法值或手写魔法数
    { id: 'R14', re: /text-\[(?:[0-9]|10)px\]|fontSize:\s*(?:[0-9]|10)\b|fontSize:\s*'(?:[0-9]|10)px'/g, fix: 'text-caption / var(--fs-caption)（字号阶梯最小 11px，§2.2）' },
] as const;

/**
 * 存量豁免（只减不增）。资产池布局已冻结（用户明确要求），其中的小字号随布局一起冻结；
 * 整车设计是画布标注，不属于列表区。浮动批量条（AssetBatchTagBar）是真正的抬升层，投影合法。
 */
const LIST_LEGACY_EXEMPT: Record<string, Partial<Record<(typeof LIST_RULES)[number]['id'], number>>> = {
    'ParameterWorkbench/AssetSummaryCard.tsx': { R14: 4 },
    'ParameterWorkbench/AssetGroupedView.tsx': { R14: 4 },
    'ParameterWorkbench/AssetPool/AssetCartCard.tsx': { R14: 2 },
    'ParameterWorkbench/AssetPool/AssetCard.tsx': { R14: 2 },
    'ParameterWorkbench/AssetPool/AssetSidebar.tsx': { R14: 1 },
    'ParameterWorkbench/AssetPool/AssetFilterBar.tsx': { R14: 1 },
    'ParameterWorkbench/AssetBatchTagBar.tsx': { R14: 1, R13: 1 },
    'VehicleDesigner/VehicleDesigner.tsx': { R14: 1 },
    'VehicleDesigner/TopBar.tsx': { R14: 1 },
    'VehicleDesigner/ParameterPanel/LinkedPair.tsx': { R14: 1 },
};

describe('列表区统一设计语言护栏（R11–R15）', () => {
    it('表格不画竖线、分页只用两档预设、面板无投影、字号不低于阶梯（R11–R14）', () => {
        const offenders: string[] = [];
        for (const [key, src] of Object.entries(SOURCES)) {
            const rel = relKey(key);
            if (rel.startsWith('__tests__/') || rel.includes('/__tests__/')) continue;
            const code = stripComments(src);
            for (const rule of LIST_RULES) {
                const hits = code.match(rule.re)?.length ?? 0;
                const allowed = LIST_LEGACY_EXEMPT[rel]?.[rule.id] ?? 0;
                if (hits > allowed) offenders.push(`${rel} → ${rule.id}（${hits} 处，豁免 ${allowed}）→ ${rule.fix}`);
            }
        }
        expect(offenders, `列表区出现规范外写法：\n${offenders.join('\n')}`).toEqual([]);
    });

    it('列表区豁免清单不得陈旧（文件仍在、且确有存量）', () => {
        const stale: string[] = [];
        for (const [rel, rules] of Object.entries(LIST_LEGACY_EXEMPT)) {
            const src = SOURCES[`../components/${rel}`];
            if (!src) { stale.push(`${rel}（文件不存在）`); continue; }
            const code = stripComments(src);
            for (const [id, n] of Object.entries(rules)) {
                const rule = LIST_RULES.find(r => r.id === id)!;
                const hits = code.match(rule.re)?.length ?? 0;
                if (hits < (n ?? 0)) stale.push(`${rel} ${id}：登记 ${n}，实际 ${hits}（改小了请同步）`);
            }
        }
        expect(stale, `豁免清单需同步：\n${stale.join('\n')}`).toEqual([]);
    });

    it('引用的 CSS 变量必须在 index.css 定义（R15）', async () => {
        // 此前 3 处引用了不存在的 --border / --bg / --line：浏览器静默回退为初始值，
        // 边框消失、表头透明——没有任何报错，只有「看起来不太对」。
        const css = await readIndexCss();
        expect(css, 'index.css 未读到').toContain('--surface-1');
        const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
        const missing: string[] = [];
        for (const [key, src] of Object.entries(ALL_TS_SOURCES)) {
            const code = stripComments(src);
            // 自带样式的导出文档（如 reportExport 生成的 HTML）在同文件内定义自己的变量
            const local = new Set([...code.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
            for (const m of code.matchAll(/var\((--[a-z0-9-]+)/g)) {
                const name = m[1];
                if (name.startsWith('--ant-') || defined.has(name) || local.has(name)) continue;
                missing.push(`${key.replace(/^\.\.\//, 'src/')} → ${name}`);
            }
        }
        expect([...new Set(missing)], `引用了未定义的 CSS 变量：\n${[...new Set(missing)].join('\n')}`).toEqual([]);
    });
});
