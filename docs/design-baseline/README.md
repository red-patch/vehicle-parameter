# 视觉基线 · 车型资产页（2026-11-20）

给后续 UI 改动当参照物：**颜色 / 字号 / 间距 / 圆角 / 阴影** 的当前取值，加上车型资产页在桌面与窄屏、浅色与深色下的真实渲染。

- 基线日期：**2026-11-20**
- 产品版本：整车产品工作台 **VPW v4.15.0**
- 主题：**曜蓝 Obsidian Blue v4.1**
- 基线页面：顶层导航第一项「车型资产」（`pool`），入口 `src/components/ParameterWorkbench/AssetPool/AssetPoolLayout.tsx`

## 文件

| 文件 | 内容 |
|---|---|
| `design-baseline.json` | 设计 token 快照。每个值带 `line` / `source`，指向真实源码位置 |
| `extract-tokens.mjs` | 生成 JSON 的提取脚本（只读源码，不手抄、不猜值） |
| `shots/pool-1440-light.png` | 1440 × 900，浅色，导航浮窗收起（主对照图） |
| `shots/pool-1440-dark.png` | 1440 × 900，深色，导航浮窗收起（主对照图） |
| `shots/pool-1024-light.png` | 1024 × 768，浅色，导航浮窗收起（窄屏对照图） |
| `shots/pool-1024-dark.png` | 1024 × 768，深色，导航浮窗收起（窄屏对照图） |
| `shots/pool-1440-light-nav-open.png` | 1440 × 900，浅色，左侧导航浮窗展开（补充） |
| `shots/pool-1440-dark-nav-open.png` | 1440 × 900，深色，左侧导航浮窗展开（补充） |

四张主图对应验收要求；两张 `-nav-open` 是补充：左侧导航按设计是**覆盖在列表上的浮窗**（`AssetPoolLayout.tsx` 注释「浮窗（覆盖在列表上，不挤压布局）」），展开时会盖住首列卡片，所以主图取收起态保证「筛选区 + 分组 + 卡片列表」结构完整，浮窗形态单独留一张。

## token 从哪来

`design-baseline.json` 由 `extract-tokens.mjs` 解析源码生成，主要来源：

1. `src/index.css` —— CSS 自定义属性，`:root`（浅色）/ `.dark`（深色）两套；另有 `[data-font-scale='small'|'large']` 两档字号。
2. `src/theme/themeConfig.ts` —— antd v6 token（`LIGHT` / `DARK` Palette）、组件级覆盖（Button / Card / Table / Layout / Tabs）、字号阶梯 `FONT_LADDER`、表格密度 `TABLE_DENSITY`。
3. `tailwind.config.js` —— 仅登记工具类阴影。

JSON 结构：

```
color.cssVariables.light / .dark   每个 CSS 变量（值 + 行号）
color.antdTokens.light / .dark     antd token 名 → 值（Palette 映射后）
typography.fontFamily              --font-sans / --font-mono / antd fontFamily
typography.scale.normal/.small/.large
typography.antd                    fontSize 三档、SM 档、Card 标题档
spacing                            表格密度、行高、控件高度、组件内边距
radius / shadow                    圆角与阴影
```

**不要从截图吸色。** 截图有压缩、抗锯齿和明暗两种光照；颜色一律以 JSON（即源码）为准。

## 怎么对照

改 UI 前后各看一遍：

1. 先看 **必须保持不变** 的东西（改动若破坏它们，视为回归）：
   - 三层表面体系：`--surface-1/2/3` 的明暗方向（浅色越内层越深，深色越上层越亮）
   - 品牌拆名：`--brand` 只管文字/链接/描边，主按钮实色填充用 `--brand-fill`（暗色下两者不同值）
   - 文字四级 `--text-1..4` 与语义色 `--success/warning/danger/info`（含 `*-text` 小字层）
   - 字号阶梯 8 档（`--fs-caption` 11 → `--fs-hero` 32，随界面字号 12/13/15 缩放）
   - 一档表格密度：表头 36、行高 40、单元格 padding 7 / 8
   - 圆角：全局/按钮 6、卡片/表格 8；阴影只用于弹层补充抬升
   - 三块结构：筛选工具条（含 3 段槽位）→ 分组头 → 卡片/表格区
2. 再看 **允许变化** 的东西：
   - 单个页面的业务内容、列/字段、卡片上的信息密度
   - 新增语义 token（必须明暗成对，并同步 `index.css` 与 `themeConfig.ts`）
   - 动效曲线以外的过渡时长微调（`--ease-ui` 不建议改）
3. 有差异就问三句：是**设计变更**还是**回归**？改的是 token 还是单页覆盖？明暗两边都改了吗？

## 怎么更新基线

只在**有意的设计变更**合并后更新，不要在功能分支里顺手刷新：

```bash
# 1. 重新提取 token（改完主题后）
node docs/design-baseline/extract-tokens.mjs

# 2. 起 mock 环境
npm run dev:mock          # http://localhost:5173

# 3. 从界面导入一份「脱敏/合成」车型表（不要用 docs/test_data 下的真实导出）
#    本基线使用 8 个合成车型（XH-X1 / XH-X2 / XH-X3 / XH-M1 系列，星河品牌）

# 4. 截图：1440×900 / 1024×768，浅色与深色各一组；
#    深色用顶栏右侧月亮/太阳按钮切换，左侧导航浮窗收起为默认主图

# 5. 更新本 README 的「基线日期」与版本号
```

截图工具不限；本基线用 ego-browser 以 `deviceScaleFactor: 2` 渲染后取视口截图（CSS 像素 1440 / 1024）。

## 边界

- 基线只覆盖**车型资产页的默认列表形态**（按车型分组、卡片列表）。其他 tab、弹窗、抽屉、空状态、错误态不在本快照内。
- 这是**人眼对照基线**，不是像素 diff 回归。UI 护栏（`src/__tests__/uiConsistency.test.ts`）才是机器判红的那一层，两者互不替代。
- 截图里的车型是合成演示数据，用于展示结构；真实数据只在本地以只读方式出现，不入库。
