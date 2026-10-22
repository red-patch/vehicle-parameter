# AGENTS.md — 整车产品工作台 VPW

> 所有 AI coding agent（Codex / Claude Code / Alma 等）的项目入口，改代码前必读；Claude Code 经根目录 `CLAUDE.md` 引入本文件。
> 这里只放「每次都要知道」的规则，细节在链接的文档里，用到再读。文中的路径与 npm 命令由 `src/__tests__/agentsDoc.test.ts` 校验，文件改名/删除时会变红。

## 红线（碰到先停下问用户）

- **不发布**：不在 agent 会话里执行 `npm run release` / `scripts/release.sh`
- **不直推 `main`**：`main` 有分支保护（必需检查 `check`，管理员也不能绕），一律「分支 + PR」（[LESSONS.md](LESSONS.md) L-6）
- **不改 `identifier`**：`src-tauri/tauri.conf.json` 的 `com.vehicle.parameter` 决定用户数据目录，改了老用户的配置/资产路径/令牌全部失联。产品名与包标识解耦是刻意的
- **手机查看服务三条不动**（`src-tauri/src/mobile.rs`，ADR-0004）：**只绑 `127.0.0.1`**（局域网不可见，只经隧道对外）、**只读**（非 GET 一律 405，无写端点）、**每设备长期 token**（非共享码）；改动后跑 `cargo test`
- **真实数据只读、凭证不入库**：`docs/` 下的车辆 .xlsx/.csv 不改；不提交 `settings.local.json`、`.env`、任何凭证，也不提交用户发来的真实导出文件
- **资产池布局已冻结**：流体多列 / 浮动购物车 / 导航浮窗 / 列表头的视图·分组·排序·列 四个下拉，由 `docs/plans/2026-10-13-asset-panel-redesign-v2-design.md` 等三份设计冻结；UI 规范只约束控件形态，不重排布局
- **需求以 `docs/PRD.md` 为准**：功能改动与 PRD 冲突时先确认再动手

## 项目简介

面向整车产品工作的桌面工具（产品名 **整车产品工作台 VPW**）：车型资产治理与筛选、公告记录归档与比对、法规标准库、参数导入（Excel/CSV）、智能填报、数据体检与修复、版本对比、导出。名称刻意中性，不绑定单一品牌或单一角色。
技术栈：**Tauri 2 + React 19 + TypeScript + Vite 7 + Tailwind 3 + Ant Design v6**，状态用 Zustand，后端逻辑在 Rust（`src-tauri/`）。

## 验证（改完必须跑）

```bash
npm run check      # lint → typecheck → test → build 一次跑完（CI 必需检查 check 跑前三项）
```

| 改了什么 | 至少跑 |
|---|---|
| 文案 / 样式 / 界面结构 | `npm run lint` + `npx vitest run src/__tests__/uiConsistency.test.ts`（UI 护栏在测试里，只跑 lint 会漏） |
| 逻辑 / 解析 / 导出 / store | `npm run check` |
| `src-tauri/` | 在 `src-tauri/` 下 `cargo test`，再 `npm run check` |
| 本文件 | `npx vitest run src/__tests__/agentsDoc.test.ts` |

- **类型检查只认 `npm run typecheck`**（或 `check`）：根 `tsconfig.json` 是 solution 文件，裸跑 `tsc --noEmit`（含 `-p .`）检查零个文件，「通过」是假的
- **本地绿 ≠ HEAD 绿**：提交前 `git status --short` 不能留着被引用、却没 `git add` 的新文件（`??`）；拿不准就在干净 worktree 里跑一次 typecheck（L-5）
- 报告里写出**实际跑的命令**；没跑的写「未跑」，不能省略

## 界面验证（没有 Tauri 也能看）

- `npm run dev:mock`，浏览器打开 `http://localhost:5173`：Tauri 换成内存文件系统（`scripts/dev-mock/tauri-mock.js`），自带一个空资产库，刷新即清空。只在 mock 模式注入，不影响 `npm run dev` / `tauri dev` / 构建
- 数据从界面导入（车型资产 → 左栏「导入车型数据」）；要预置文件（如枚举词表 `custom_enums.json`）用 `window.__VPW_MOCK_FILES__`，见脚本头注释
- 改了表格 / 弹窗 / 列表：用**真实规模**数据回归——一次导入可达约 500 车型 × 500 参数，车型名、参数名都可能很长；亮 / 暗色都看
- 性能只在生产构建下测（`npm run build && npm run preview`）：dev 模式页面切换要 2-3s，生产仅 17-70ms

## 提交与 PR

- 分支从最新 `origin/main` 切：`feat/…` `fix/…` `docs/…` `chore/…` `refactor/…`
- commit 用 `type(scope): 中文摘要`，需要时加「— 补充」；type 取 feat / fix / refactor / test / docs / chore / style，scope 用模块名（`asset-pool`、`data-purify`、`ui`、`release`…）
- 新建文件和引用它的改动同批提交（L-5）
- PR 描述写：改了什么、为什么、跑了哪些检查（没跑的写「未跑」）

## 执行纪律

- 同一步骤失败两次：停下、记录卡点、重新计划，不要第三次硬试
- 修因不修表：禁止靠压制报错、放宽断言、跳过检查让问题消失
- **回退测试**：宣称「修好」前，把旧代码放回去，新写的测试必须**真挂、且挂得明白**（指出哪个行为错了）；编译不过、测试被跳过都不算修好
- **同类 bug 一次修全**：同一问题一次覆盖所有平台 / 所有实例，不留尾（如 CI 依赖同时覆盖 Windows 与 macOS、发布配置同时覆盖各目标平台）——L-1 / L-2
- **多个 AI 会话会并行改同一工作树**：动手前重读目标文件现状（不能凭本会话早前的读取）；验证失败先分诊是不是并行会话的在制品，再决定修不修
  - 撤销自己的改动时**只删自己新增的部分**；`git checkout` / `git restore` / `git stash` 会连带抹掉并行会话的在制品，一律不用
  - 已经覆盖了就查 `~/.claude/file-history/<会话 id>/`：按会话分目录，`@vN` 递增，覆盖前的版本通常就在里面
- **改了文档里的数字 / 引用，全库核对指向它的地方**（L-4）；能不写死的数字就不写，写「以 X 为准」
- 收尾报告 2-3 行：选了什么、放弃了什么、为什么；权衡时兼顾 UX（用户）、DX（后续开发者）、AX（下一个代理）

## 导航指针

- **领域术语**：[CONTEXT.md](CONTEXT.md) 是词汇表（资产/受控属性/身份键/公告记录…），读设计文档或写用户文案前先对齐；`_Avoid:_` 行是禁用叫法
- **错题本**：[LESSONS.md](LESSONS.md) 记 agent 的工程教训（返工/不该合/验证糙），同一教训在 3 个不同日期重现即升格进本文件；开工前扫一眼与本次改动相关的条目
- **架构决策**：[docs/adr/](docs/adr/)——0001 受控属性分层、0002 身份键与永不静默覆盖、0003 主文件退役、0004 只读远程访问面
- **设计方案**：`docs/plans/YYYY-MM-DD-主题-design.md`，带「日期｜状态」头与前置文档链；新设计照此体例落盘，实施完把状态头改为「已实施」。引用旧方案前先核对现状（如 `docs/交互优化设计方案.md` 部分已陈旧，见其文件头）
- **资产管理页组件链**：`MainLayout('pool')` → `ParameterWorkbench` → `AssetPoolLayout` → `AssetSidebar` / `AssetFilterBar` / `AssetGroupTree`；`src/components/AssetLibrary/` 只装筛选面板和弹窗抽屉，不是页面入口
- **设计类 skill**：`.agent/skills/` 下的 frontend-design、ui-ux-pro-max 只用于**全新界面**的方案探索；与本文件或 UI 护栏冲突时以本文件为准，不得据此改既有页面的字体、配色、密度、布局
- **产品改名**：按 [docs/产品名落点.md](docs/产品名落点.md) 逐条执行（TS 侧共用 `src/constants/app.ts` 的 `APP_NAME`；拉丁后缀「VPW」不可省）

## 目录地图

| 路径 | 说明 |
|---|---|
| `src/components/` | 功能模块（ParameterWorkbench / SmartFiller / DiffViewer / DataPurify / AssetLibrary / AnnouncementQuery / RegulationLibrary / FileUpload / GlobalSearch / Settings / Layout / VehicleDesigner），通用构件在 `common/` |
| `src/store/` | 全局状态 |
| `src/workers/` | Web Worker（解析等重计算） |
| `src/utils/` | 纯函数工具，优先把逻辑放这里方便测试 |
| `src-tauri/` | Rust 后端、Tauri 配置、capabilities 权限 |
| `scripts/` | 在用：`release.sh`、`start.sh`、`dev-mock/`；`debug_*` / `test_*` / `verify_*` 多为一次性验证脚本 |
| `docs/` | PRD.md、User_Manual.md、ADR、设计方案、测试数据 |

## 大文件（改动需格外小心）

- 超过 **700 行**的组件视为热点：新增逻辑写到独立文件 / 子组件 / hook，不要再往里堆。实时名单：
  `find src -name '*.tsx' -not -path '*/__tests__/*' | xargs wc -l | sort -rn | head`
- 最大的两个：`src/components/ParameterWorkbench/AssetPool/AssetPoolLayout.tsx`、`src/components/SmartFiller/ConfigManagerView.tsx`。资产对象级动作（重命名/激活/删除/标签/公告关联）已抽到 `src/components/ParameterWorkbench/useAssetActions.tsx`，新动作加在那里，别堆回 AssetPoolLayout

## UI 构件（用这些，别手搓）

**同一个意图只允许一种写法。** 本仓库曾因「构件只封容器、不封控件」而分化出 3 种搜索框、4 种枚举筛选编码——规范靠记忆必然被击穿（多会话并行 + 手搓零成本），所以把规范做成了**机器可判红**的护栏：`src/__tests__/uiConsistency.test.ts`（违反即 `npm run test` 变红）。

| 意图 | 唯一构件 | 禁止 |
|---|---|---|
| 列表页外壳 + 工具条 | `common/ListToolbar`（**固定 3 段槽位**，见下） | 自造 `<Card title=… extra=…>` + 另一行筛选、`<FilterBar>` 外壳 |
| 搜索框 | `common/SearchInput`（宽度只收 `sm\|md\|lg`） | `<Input.Search>`、裸 `Input` + `prefix={<SearchOutlined}`、拿 `TextArea` 当搜索框 |
| 维度/快捷筛选 | `common/FacetChips`（`tone` 只收语义档） | `Tag.CheckableTag`、`Checkbox.Group`、变色主按钮、裸 `Tag` 变色 |
| 视图 / 模式切换 | antd `Segmented` | `Radio.Group optionType="button"`（做同一件事的另一种写法） |
| 筛选行的标签 | `common/ListToolbar` 的 `<FilterItem label="层级">`（**冒号由组件补，label 不写**；只给维度，搜索框不带标签、靠右） | `label="搜索:"`、自己拼冒号、`搜索：` 标签 |
| 列表计数 | `ListToolbar` 的 `count`（`26` / `17 / 26`）；短标签带数用 `common/CountLabel` | 「共 N 项」、`<Tag>已选 3 款</Tag>`、`全部 (26)` 括号拼接 |
| 行内操作列 | `common/RowActions`（图标按钮 + Tooltip，>3 个自动收「更多」，删除传 `danger`/`confirm`） | `type="link"` 图标、红色 `danger` 垃圾桶常驻、裸 `Popconfirm` + `Button` |
| 状态列 | `common/StatusDot`（`tone` 只收 5 个语义档） | antd 预设色 `<Tag color="green">`（暗色不翻转、整列涂满） |
| 动态列标题（车型名等） | `common/ColumnTitle` + 列 `ellipsis: true`（`DataTable` 自动切 fixed 布局） | 长名直接当 `title`（表头折 3 行、列宽失控） |
| 表格分页 | `common/tablePresets`：页面 `pagePagination()`（50），弹窗/抽屉 `compactPagination()`（20） | `pageSize: 数字字面量` |
| 单元格文本 / 就地编辑 | `common/CellText`（只读态是文本，点开才变输入框） | 输入框常驻（会把行高撑开、与其他行不齐） |
| 「还没选车型」前置提示 | `common/SelectVehiclesHint`（带「去车型资产选择」直达按钮） | 每页手写 `Alert message="请先在「车型资产」中选择车型"` |
| 「资产库目录未设置」提示 | `utils/libraryPathPrompt`：toast 用 `warnLibraryPathMissing()`，空状态用 `LIBRARY_PATH_MISSING_TEXT` + `openLibraryPathSettings` | 自写文案（「数据源面板」已下线、「应用右上角」不准确），或只说不给入口 |
| 引导型空状态（前置条件没满足） | `common/GuideEmpty`（一句现状 + 下一步按钮，按钮用 default） | 一行灰字没有出路；纯展示的「暂无数据」继续用 antd `Empty` |
| 品牌色实色填充（白字） | `bg-brand-fill` / `border-brand-fill` | `bg-brand text-white`（暗色下 `--brand` 是浅色文字色，白字看不清） |


**列表页工具条的 3 段槽位**（段序固定，不得调换；① ③ 可整段省略；典型用法见 `src/components/common/ListToolbar.tsx` 文件头）：

```
① 标题 + 计数                          [操作按钮…]     ← 最多 1 个 primary
② 筛选：视图切换 · 快捷 chips · 搜索                     ← 改「数据集合」
③ 显示选项：隐藏无值字段 · 按字段名合并                   ← 只改「呈现方式」
```

②③ 必须分开：版本对比曾把两个显示开关混进筛选行，是最明显的语义混淆。
操作按钮 ≥3 个时收进 `⋯`/`Dropdown`；**同一动作一屏内只出现一次**。
**primary 只给「产出 / 终点动作」**——即「用户做完哪一步就可以离开这个页面」；
导入、迁移、刷新一律 default。**页面没有 primary 是合法状态**，别为了好看硬提一个。

**文案**：`<动作> <格式>` 两段式，动作限 `导出/复制/下载/导入`，格式限 `CSV/Excel/PDF`
（`导出 CSV`，不是 `导出CSV`/`下载 CSV`）。业务词可例外（如 `车上云系统模板导出`，它回答了「导给谁用」）。

**容器**：列表页外壳用 `ListToolbar`，**不要再套 `Card`**（会成盒中盒）；`Card` 留给非列表的内容块。
**弹窗/抽屉内的表格**只遵守「表格内部」（行高、单元格纪律、控件形态），不要求有标题行/导出区。
**刷新**：凡有刷新，形态为「图标按钮 + Tooltip」；没有刷新入口的页面多半是数据本就来自当前会话，不算不一致。
**异常信号**：判定依据不存在就不判（如没有词表就不标「字段名不在词表」）；不同性质的异常分开计数；一整列都亮的标记等于没有信号——先说明原因再弱化（列表区设计语言 §9.1）。

### 合法例外（能力模型装不下，**不要硬套构件**）

判据是「**装不下**」，不是「还没迁」；新例外在此登记一行（根因见 [docs/plans/2026-10-16-列表页设计语言-design.md](docs/plans/2026-10-16-列表页设计语言-design.md) §7.1）：

- 车型资产筛选条的 **`ChipShell`**（下拉式 facet chip，内嵌电量区间 `InputNumber` / 公告号粘贴口 `TextArea`；换成平铺的 `FacetChips` 会改变资产池核心筛选交互）
- 字段与词表的 `AutoComplete`（带 options 的组合框，可输入可选，不是搜索框；`SearchInput` 不支持 options）
- 法规标准主题域的 `Select multiple`（用户可增删的开放词表，不是定长枚举）

- 详情与根因分析：[docs/plans/2026-10-15-ui-构件规范-design.md](docs/plans/2026-10-15-ui-构件规范-design.md)
- **列表区度量**（行高 40 / 表头 36、密度只有一档、字号阶梯、工具条 32 / 表内 24、无竖线无投影）：[docs/plans/2026-10-17-列表区统一设计语言-design.md](docs/plans/2026-10-17-列表区统一设计语言-design.md)。
  密度由 `themeConfig` 的 `TABLE_DENSITY` 统一（三种 `size` 取同值），**不要在页面上调 padding / 行高**；护栏 R11–R15 锁 `bordered`、`pageSize` 字面量、`shadow-sm`、低于阶梯的字号、未定义的 CSS 变量
- **存量豁免**：护栏里有两张豁免表——`LEGACY_EXEMPT`（搜索框等控件）与 `LIST_LEGACY_EXEMPT`（列表区度量），**只减不增**；改到哪个文件就顺手迁哪个，迁完从表里删掉。现存多少以测试文件为准
- 加了新的通用控件，请一并加进护栏 —— 规范不进护栏就等于没有规范
- 护栏是**文本级**的：抓得住「手搓写法」，抓不住「该用 FacetChips 却用了 Select」这类语义偏差；后者靠 review

## 边界与约定

- 面向用户的文案不解释内部实现（存储格式、文件机制、内部文件名）；提示仅在用户需要据此行动或了解后果时出现，且以一句为限
- `verify_export.csv` 一类根目录验证产物是临时的，可清理；Excel 临时锁文件（`~$*.xlsx`）直接删除

## 已知坑

- `tauri dev` 旧二进制：改图标/版本号后 tauri dev 仍跑旧 app，`touch src-tauri/tauri.conf.json` 强制重链
- 测试里的 mock 数组/对象不要在每次渲染时新建（会拖垮 jsdom 甚至 OOM），用共享可变状态
- AI 会话的 worktree（`.claude/worktrees/`）是陈旧代码快照，vitest 扫描已将其排除（`vitest.config.ts`）；在主仓库跑测试报的假失败先看是不是这个原因
- 数据体检的「字段名不在词表」以**用户资产库**的 `custom_enums.json` 为准，应用不内置词表：空词表 / 模拟词表下的异常计数没有参考意义，回归时说明用的是哪份词表
