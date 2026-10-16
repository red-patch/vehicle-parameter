# AGENTS.md — 整车产品工作台 VPW

> 本文件是所有 AI coding agent（Codex / Claude / Alma 等）的项目入口。改代码前必读。

## 项目简介

面向整车产品工作的桌面工具（产品名 **整车产品工作台 VPW**）：车型资产治理与筛选、公告记录归档与比对、法规标准库、参数导入（Excel/CSV）、智能填报、数据体检与修复、版本对比、导出。名称刻意中性，不绑定单一品牌或单一角色。
技术栈：**Tauri 2 + React 19 + TypeScript + Vite 7 + Tailwind 3 + Ant Design v6**，状态用 Zustand，后端逻辑在 Rust（src-tauri）。

## 验证命令（改完代码必须跑）

```bash
npm run lint       # ESLint
npm run typecheck  # tsc 类型检查（tsconfig.app.json）
npm run test       # Vitest（jsdom + Testing Library）
npm run build      # tsc -b + vite build
```

- 只改了 UI 文案/样式：至少跑 `npm run lint`
- 改了逻辑/解析/导出：四条全跑
- 裸跑 `tsc --noEmit` 检查零个文件（根 tsconfig 是 solution 文件），类型检查一律走 `npm run typecheck`
- `npm run release` 走 `scripts/release.sh`，**不要在 agent 会话里执行发布**

## 执行纪律

- 同一步骤失败两次：停下、记录卡点、重新计划，不要第三次硬试
- 修因不修表：禁止靠压制报错、放宽断言、跳过检查让问题消失
- 没跑的检查不算通过：报告里明说哪些跑了、哪些没跑；**没跑的项必须显式写成「未跑」，不能省略不写**
- **回退测试**：宣称"修好"前，把旧代码放回去，新写的测试必须**真挂、且挂得明白**（指出哪个行为错了）；编译不过、测试被跳过都不算修好
- **同类 bug 一次修全**：同一问题要一次覆盖所有平台/所有实例，不留尾（如 CI 依赖要同时覆盖 Windows 与 macOS、发布配置要同时覆盖各目标平台）——见 [LESSONS.md](LESSONS.md) L-1/L-2
- **多个 AI 会话会并行改同一工作树**：动手前重读目标文件现状（不能凭本会话早前的读取）；验证失败先分诊是不是并行会话的在制品，再决定修不修
- 收尾报告 2-3 行：选了什么、放弃了什么、为什么；权衡时兼顾 UX（用户）、DX（后续开发者）、AX（下一个代理）

## 导航指针

- **领域术语**：[CONTEXT.md](CONTEXT.md) 是词汇表（资产/受控属性/身份键/公告记录…），读设计文档或写用户文案前先对齐；`_Avoid:_` 行是禁用叫法
- **错题本**：[LESSONS.md](LESSONS.md) 记 agent 的工程教训（返工/不该合/验证糙），同一教训在 3 个不同日期重现即升格进本文件；开工前扫一眼与本次改动相关的条目
- **架构决策**：`docs/adr/0001-0004`（受控属性分层、身份键与永不静默覆盖、主文件退役、只读远程访问面）
- **设计方案**：`docs/plans/YYYY-MM-DD-主题-design.md`，带「日期｜状态」头与前置文档链；新设计照此体例落盘，实施完把状态头改为「已实施」
- **资产管理页组件链**：`MainLayout('pool')` → `ParameterWorkbench` → `AssetPoolLayout` → `AssetSidebar` / `AssetFilterBar` / `AssetGroupTree`；`src/components/AssetLibrary/` 只装筛选面板和弹窗抽屉，不是页面入口

## 目录地图

| 路径 | 说明 |
|---|---|
| `src/components/` | 功能模块（ParameterWorkbench / SmartFiller / DiffViewer / DataPurify / AssetLibrary / AnnouncementQuery / RegulationLibrary / FileUpload / GlobalSearch / VehicleDesigner） |
| `src/store/` | 全局状态 |
| `src/workers/` | Web Worker（解析等重计算） |
| `src/utils/` | 纯函数工具，优先把逻辑放这里方便测试 |
| `src-tauri/` | Rust 后端、Tauri 配置、capabilities 权限 |
| `src-tauri/src/mobile.rs` | **手机查看**只读 HTTP 服务（ADR-0004）。三条不可动摇：**只绑 `127.0.0.1`**（局域网不可见，只经隧道对外）、**只读**（非 GET 一律 405，无写端点）、**每设备长期 token**（非共享码）。改动后跑 `cargo test` |
| `scripts/` | 一次性脚本（debug_*/test_*/verify_* 多为临时验证用） |
| `docs/` | PRD.md、User_Manual.md、设计方案、测试数据 |

## 热点文件（大文件，改动需格外小心）

| 文件 | 行数 | 改动后必跑 |
|---|---|---|
| `src/components/ParameterWorkbench/AssetPool/AssetPoolLayout.tsx` | ~1550 | lint + test + build |
| `src/components/SmartFiller/ConfigManagerView.tsx` | ~1270 | lint + test + build |
| `src/components/DiffViewer/DiffResultView.tsx` | ~520 | lint + test |

原则：这些文件已经超过需要拆分的阈值，**新增逻辑优先写到独立文件/子组件，不要再往里面堆**。资产对象级动作（重命名/激活/删除/标签/公告关联）已抽到 `src/components/ParameterWorkbench/useAssetActions.tsx`，新动作加在那里，别堆回 AssetPoolLayout。

## UI 构件（用这些，别手搓）

**同一个意图只允许一种写法。** 本仓库曾因「构件只封容器、不封控件」而分化出 3 种搜索框、4 种枚举筛选编码——规范靠记忆必然被击穿（多会话并行 + 手搓零成本），所以把规范做成了**机器可判红**的护栏：`src/__tests__/uiConsistency.test.ts`（违反即 `npm run test` 变红）。

| 意图 | 唯一构件 | 禁止 |
|---|---|---|
| 列表页外壳 + 工具条 | `common/ListToolbar`（**固定 3 段槽位**，见下） | 自造 `<Card title=… extra=…>` + 另一行筛选、`<FilterBar>` 外壳 |
| 搜索框 | `common/SearchInput`（宽度只收 `sm\|md\|lg`） | `<Input.Search>`、裸 `Input` + `prefix={<SearchOutlined}`、拿 `TextArea` 当搜索框 |
| 维度/快捷筛选 | `common/FacetChips`（`tone` 只收语义档） | `Tag.CheckableTag`、`Checkbox.Group`、变色主按钮、裸 `Tag` 变色 |
| 视图 / 模式切换 | antd `Segmented` | `Radio.Group optionType="button"`（做同一件事的另一种写法） |
| 筛选行的标签 | `common/FilterBar` 的 `<FilterItem label="搜索">`（**冒号由组件补，label 不写**） | `label="搜索:"`、自己拼冒号 |
| 单元格文本 / 就地编辑 | `common/CellText`（只读态是文本，点开才变输入框） | 输入框常驻（会把行高撑开、与其他行不齐） |

**列表页工具条的 3 段槽位**（段序固定，不得调换；① ③ 可整段省略）：

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

### 合法例外（能力模型不匹配，**不要硬套构件**）

当构件的能力模型装不下场景语义时，保留原实现并在此登记。判据是「**装不下**」，不是「还没迁」：

| 位置 | 保留的东西 | 为什么不能换 |
|---|---|---|
| 车型资产筛选条 | **`ChipShell`**（下拉式 facet chip） | 内嵌 `InputNumber`（电量区间）/ `TextArea`（公告号粘贴口）/ 值列表；`FacetChips` 只有定长枚举且是平铺式。换掉会改变资产池核心筛选交互 |
| 字段与词表 | `AutoComplete` | 带 options 的下拉组合框（可输入可选），非搜索框；`SearchInput` 不支持 options |
| 法规标准 | 主题域 `Select multiple` | **可增长**的开放词表（用户能增删），非定长枚举 |

**资产池的布局（流体多列 / 浮动购物车 / 导航浮窗 / 列表头行的视图·分组·排序·列 四个下拉）
已由 `docs/plans/2026-10-13-asset-panel-redesign-v2` 等三份设计文档冻结，不得改动**——
这些规范只约束控件形态，不重排布局。

典型用法（列表页整页外壳）：

```tsx
<ListToolbar
    title="公告归档"
    actions={<Button size="small">导入</Button>}
    filters={
        <>
            <FilterItem label="搜索">
                <SearchInput value={q} onChange={setQ} placeholder="搜索车型名" />
            </FilterItem>
            <FacetChips options={[…] } value={chip} onChange={setChip} />
        </>
    }
    padded={false}   /* 表格贴边时传 false */
>
    <DataTable … />
</ListToolbar>
```

- 详情与根因分析：[docs/plans/2026-10-15-ui-构件规范-design.md](docs/plans/2026-10-15-ui-构件规范-design.md)
- **存量豁免**：护栏的 `LEGACY_EXEMPT` 列了 13 个落地前的老文件（仅剩 29 处），**只减不增**；改到哪个就顺手迁哪个，迁完从表里删掉。
- 加了新的通用控件，请一并加进护栏 —— 规范不进护栏就等于没有规范。
- 护栏是**文本级**的：抓得住「手搓写法」，抓不住「该用 FacetChips 却用了 Select」这类语义偏差；后者靠 review。

## 边界与约定

- 面向用户的文案不解释内部实现（存储格式、文件机制、内部文件名）；提示仅在用户需要据此行动或了解后果时出现，且以一句为限
- 真实车辆数据（docs/ 下的 .xlsx/.csv）只读，不要改原始数据文件
- `docs/PRD.md` 是需求基准，功能改动与 PRD 冲突时先确认再动手
- 不要提交 `settings.local.json`、`.env`、任何凭证文件
- `verify_export.csv` 一类根目录验证产物是临时的，可清理
- Excel 临时锁文件（`~$*.xlsx`）直接删除即可

### 产品名落点（改名时逐条执行）

产品名 **整车产品工作台 VPW** 有 10 处落点，TS 侧 6 处共享常量 `src/constants/app.ts` 的 `APP_NAME`（改一处即可），剩下 4 处因跨语言/跨构建配置无法共享，须手工同步：

**拉丁后缀「VPW」不可省**。macOS Spotlight 按整词注音索引：纯中文名只能被中文或全拼（`zhengche`）搜到，拼音首字母（`zc` / `gzt`）搜不到。保留字面拉丁字符，中文 / 拉丁 / 全拼三条检索通道才全通（实测：`VPW` ✓、`整车` ✓、`zhengche` ✓，三者兼得；改成纯拉丁文件名反而丢掉中文检索）。

| 落点 | 说明 |
|---|---|
| `src-tauri/tauri.conf.json` `productName` | .app 名、安装包名、Dock 名 |
| `src-tauri/tauri.conf.json` `windows[0].title` | 窗口标题 |
| `src-tauri/src/lib.rs` `setup_macos_menu` | macOS 应用菜单标题 |
| `index.html` `<title>` | 浏览器标签页标题 |

**不要改** `tauri.conf.json` 的 `identifier`（`com.vehicle.parameter`）——它决定用户数据目录，改动会让老用户配置/资产路径/令牌全部失联。产品名与包标识解耦是刻意的。

## 已知坑

- README.md 还是 Vite 模板原文，不代表项目实际内容（以本文件和 docs/PRD.md 为准）
- `docs/交互优化设计方案.md`（2026-07-17）**部分内容已陈旧**：原文称有 3 个 TODO，实测 `TODO|待定|TBD` 零命中；其「删除 diff/search 死代码、App.tsx 243→120 行」未执行（现 134 行、`LegacyDiffPanel` 仍挂载）。该文档属待定设计方案，不是代码债，引用前先核对现状
- `tauri dev` 旧二进制：改图标/版本号后 tauri dev 仍跑旧 app，`touch src-tauri/tauri.conf.json` 强制重链
- dev 模式性能放大百倍：页面切换 dev 下 2-3s、生产构建仅 17-70ms；性能测量必须用生产构建（vite preview）
- 测试里的 mock 数组/对象不要在每次渲染时新建（会拖垮 jsdom 甚至 OOM），用共享可变状态
- AI 会话的 worktree（`.claude/worktrees/`）是陈旧代码快照，vitest 扫描已将其排除（vitest.config.ts）；在主仓库跑测试报的假失败先看是不是这个原因
