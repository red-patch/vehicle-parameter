# 产品更名「整车产品工作台」+ 外壳文案对齐 — 设计方案

> 日期：2026-10-12 ｜ 状态：**已实施**
> 来源：用户提出——工具的实际服务面已从「DST 车型参数维护」扩到整车产品经理的完整工作流（资产治理、公告情报、法规标准、版本对比、智能填报、数据校验），
> 现有名称「DST车型参数管理工具」既绑死单一品牌，又把工具窄化成"参数"，需要中性、领域口径的产品名。
> 关联：[tauri.conf.json](../../src-tauri/tauri.conf.json)、[MainLayout.tsx](../../src/components/Layout/MainLayout.tsx)、[AGENTS.md](../../AGENTS.md)、`CONTEXT.md`（领域术语，本次不动）

## 1. 问题

**(a) 产品名绑死品牌且窄化定位。** 「DST车型参数管理工具」出现在 7 处硬编码位置，且还并存两个更旧的名字——`docs/PRD.md` 叫「智行参数管理系统」、`index.html` 叫「车辆参数管理系统」。三套名字互不一致，用户无法从任意一处确认自己在用什么软件；非 DST 部门使用时，名字本身就是使用门槛。

**(b) 产品名无共享常量。** 7 处全部写死字面量，没有任何单一来源。改名要人工找齐全部落点，漏一处就出现"一半新名一半旧名"——`index.html` 的标题不一致就是这个问题的现存证据。

**(c) 两个导航标签读不懂。** 「资产管理」中的"资产"是内部术语（[CONTEXT.md](../../CONTEXT.md) 定义资产=一台车型的参数快照），首次进入的用户会误以为是财务/库存模块；「系统配置」实管字段、枚举字典、标签分组，用户想"加个字段"不会想到点进"系统配置"。

## 2. 目标与非目标

**目标**

1. 产品名统一为 **整车产品工作台**，替换全部 7 处落点，消除三套名字并存。
2. 建立 `APP_NAME` 单一来源常量，TS 侧全部引用；Rust 侧与构建配置的重复落点在 AGENTS.md 留一张清单。
3. 对齐外壳文案中读不懂的两处导航标签与相关提示语，使 UI 措辞与用户心智一致。

**非目标**

- **不改 `identifier`**（`com.vehicle.parameter`）。它是用户数据目录（`~/Library/Application Support/com.vehicle.parameter/`）的判定依据，改动会导致老用户配置、资产路径、令牌全部失联。产品名与包标识解耦是正确做法。
- **不改 `requiredFields.ts` 中的 `出厂预装DST-t-box` / `出厂预装DST智能车机`**。这两条是**车型参数数据**（描述车辆出厂配置），不是产品文案。
- **不改 `mobile.rs` 的「手机查看」**。它是只读远程访问页面的功能标题，不是产品名（见 [ADR-0004](../../docs/adr/0004-read-only-remote-access-surface.md)）。
- **不动领域术语**。「资产」「资产库」「车型组」「公告记录」「法规标准」「身份键」等在 [CONTEXT.md](../../CONTEXT.md) 有定义与 `_Avoid_` 禁用叫法，改动会外溢到全部文档与代码标识符，形成文档与代码两张皮。本次只动**外壳文案**——且导航标签的调整是"换一个更通俗的叫法指向同一概念"，不是重新定义概念。
- 不重构导航结构，不新增模块，不改交互。

## 3. 命名决策

**选定：整车产品工作台**

| 候选 | 读作 | 采纳 |
|---|---|---|
| **整车产品工作台** | 面向整车产品的工作台 | ✅ 行业口径，范围最宽 |
| 整车产品经理工作台 | 产品经理的工作台 | ❌ 角色口径，等于声明"只有产品经理能用" |
| 整车工作台 | 整车的工作台 | ❌ 去掉「产品」会退回"参数工具"观感 |
| 车型产品工作台 | 面向车型产品的工作台 | ❌ 「车型」偏单一型号，装不下公告/法规 |

**理由**：

- **「工作台」在中文化习惯里跟领域，不跟角色**——数据工作台、研发工作台、运营工作台。跟角色（产品经理工作台）是在门口挂牌说"其他人别进"，与「服务对象扩张」的定位相悖。
- **「整车」锚定行业口径**，且范围足够宽：PRD 与行业说法都是"整车参数"（完整车辆），比现有词表的「车型」更大一层，与「车型组」不冲突（整车 ⊃ 车型组）。
- **「产品」不可省**：它说明这个工具做的是产品定义与合规（车型参数、公告申报、法规标准、竞品对比），不是"管一堆文件"。去掉就退回"参数工具"。

**品牌处理：DST 从界面彻底消失。** DST 是这个工具服务的对象之一（DST 的车型），不是它的出品方署名。挂出品方品牌会让其他部门用起来别扭（"这是 DST 的东西"）。页脚 `© 计皓琛` 已在做归属表达，不再另设「关于」品牌位。

## 4. 落点清单

| # | 文件 | 现值 | 新值 |
|---|---|---|---|
| 1 | [tauri.conf.json:3](../../src-tauri/tauri.conf.json) `productName` | DST车型参数管理工具 | 整车产品工作台 |
| 2 | [tauri.conf.json:15](../../src-tauri/tauri.conf.json) `windows[0].title` | DST车型参数管理工具 | 整车产品工作台 |
| 3 | [lib.rs:16](../../src-tauri/src/lib.rs) macOS 应用菜单 | DST车型参数管理工具 | 整车产品工作台 |
| 4 | [MainLayout.tsx:163](../../src/components/Layout/MainLayout.tsx) 顶栏标题 | 字面量 | `{APP_NAME}` |
| 5 | [reportExport.ts:259](../../src/utils/reportExport.ts) 报告页眉品牌行 | DST 车型参数管理工具 | `{APP_NAME}` |
| 6 | [reportExport.ts:267](../../src/utils/reportExport.ts) 报告页脚默认值 | DST 车型参数管理工具 | `APP_NAME` |
| 7 | [diffReport.ts:179](../../src/utils/diffReport.ts) Markdown「工具：」行 | DST 车型参数管理工具 | `APP_NAME` |
| 8 | [compareReport.ts:144](../../src/utils/compareReport.ts) 同上 | DST 车型参数管理工具 | `APP_NAME` |
| 9 | [assetUpgradeReport.ts:125](../../src/utils/assetUpgradeReport.ts) 同上 | DST 车型参数管理工具 | `APP_NAME` |
| 10 | [index.html:7](../../index.html) `<title>` | 车辆参数管理系统 | 整车产品工作台 |

**TS 侧单一来源**：新建 `src/constants/app.ts`，导出 `export const APP_NAME = '整车产品工作台'`。表 4–9 共 6 处改为引用该常量。

**Rust 侧与构建配置**：表 1–3 无法共享 TS 常量（跨语言），接受重复，但在 [AGENTS.md](../../AGENTS.md) 记一条落点清单，下次改名照单执行。

## 5. 外壳文案对齐

导航 7 个标签中，5 个已是清楚的领域口径（版本对比、智能填报、数据体检与修复、公告中心、法规标准），保留不动。只调整两个读不懂的：

| 位置 | 现值 | 新值 | 理由 |
|---|---|---|---|
| 导航 `pool` | 资产管理 | **车型资产** | "资产"是内部词，首次进入会误以为是财务/库存；「车型资产」与「车型组」同源，更自洽 |
| 导航 `dict` | 系统配置 | **字段与词表** | 实管字段、枚举字典、标签分组；「系统配置」听着像 App 偏好设置，用户想"加个字段"不会点这里 |
| ConfigManagerView 卡片标题 | 系统配置中控台 | **字段与词表** | 跟随导航；「中控台」是不必要的比喻 |
| 顶栏重置按钮 tooltip | 清除缓存并重置系统 | **重置本地数据** | 原词说"缓存"听着无害，实际会清空已上传临时文件、重置已选车型/对比历史/填报配置 |

**「数据体检与修复」保留不动**。曾考虑改为「数据校验与修复」以更精确，但"体检"更生动、有记忆点，且「体检」在 `CONTEXT.md` 与标签体系中已是既有说法（来源标签含"数据体检"）。为精确牺牲生动不划算。

**提示语联动**：以下用户可见提示引用了被改的导航标签，需同步，否则指向不存在的位置：

| 文件 | 现值 | 新值 |
|---|---|---|
| [ProductSourceSelector.tsx:69](../../src/components/ParameterWorkbench/ProductSourceSelector.tsx) | 请先在资产管理中激活车型 | 请先在「车型资产」中激活车型 |
| [CompareView.tsx:295](../../src/components/ParameterWorkbench/CompareView.tsx) | 请先在资产管理中选择车型 | 请先在「车型资产」中选择车型 |
| [SmartFillView.tsx:161](../../src/components/ParameterWorkbench/SmartFillView.tsx) | 请先在资产管理中选择车型 | 请先在「车型资产」中选择车型 |
| [SmartFillView.tsx:184](../../src/components/ParameterWorkbench/SmartFillView.tsx) | 请先在资产管理中激活车型 | 请先在「车型资产」中激活车型 |
| [BidMappingDrawer.tsx:193](../../src/components/ParameterWorkbench/BidMappingDrawer.tsx) | 请先在「资产管理」中选择资产库目录 | 请先在「车型资产」中选择资产库目录 |
| [useAssetActions.tsx:350](../../src/components/ParameterWorkbench/useAssetActions.tsx) | 文件保留但退出资产管理 | 文件保留但退出车型资产 |
| [TagSelector.tsx:100](../../src/components/common/TagSelector.tsx) | 暂无标签分组，请在系统配置中创建 | 暂无标签分组，请在「字段与词表」中创建 |

**不改**（注释/内部日志，非用户可见，且其表述准确）：`useViewportPaneHeight.ts:8`、`ParameterWorkbench.tsx:45` 的代码注释；`ConfigManagerView.tsx:120` 的 `console.error`。

## 6. 验证

- 测试 [MainLayout.navigation.test.tsx:37-42](../../src/components/Layout/__tests__/MainLayout.navigation.test.tsx) 断言导航标签文本，需同步更新为「车型资产」「字段与词表」。其余断言（`truncate`/`max-w-` 类名、负向断言）不受影响。
- 标题宽度：`max-w-[180px]` 是按旧名长度定的。「整车产品工作台」7 字比「DST车型参数管理工具」10 字短，不会溢出，无需调整。
- 跑了：`npm run lint`、`npm run typecheck`、`npm run test`、`npm run build`；改了 `lib.rs`，`cargo test` 一并跑。

## 7. 影响面评估

- **用户可见**：应用名、Dock 名、安装包名、窗口标题、macOS 菜单、顶栏标题、导出报告（HTML 页眉页脚 + Markdown）、页面 `<title>`、两个导航标签、七条提示语。均为正向（消除三处名字不一致 + 提升可读性）。
- **数据兼容**：零影响。`identifier` 不动，用户数据目录不变，资产路径/令牌/配置全部保持。
- **代码结构**：新增 `src/constants/app.ts`（1 个常量），消除 6 处重复字面量。Rust 侧 3 处保留重复（跨语言限制），用文档清单兜底。
