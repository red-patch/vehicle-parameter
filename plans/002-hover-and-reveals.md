# 002 · 高频 hover 手感 + 瞬跳补动效 + 卫生清理

> 审计来源：同 001（2026-09-30），用户后续指示「继续做完」落地剩余三包。
> 基准 commit：`ce88a55`（工作树上另有用户进行中的未提交改动，未触碰其语义）。
> 验证：lint（改动行零问题）/ test（失败集=历史基线，stash 已证明）/ build ✅ / 浏览器实测见文末。

## 一、高频 hover 手感

| 位置 | 改动 | 依据 |
| --- | --- | --- |
| AssetGroupedView.tsx 行快捷按钮 | `hidden group-hover:flex` → 常驻占位 `opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100` | 最高频 hover 面上 display 切换会推挤行内容布局跳变；对齐 DataSourcePanel:1170 的正确写法；focus-within 补键盘可达 |
| index.css 表格行 hover | 删除 `transition: background-color 0.15s ease`（整个声明） | 行 hover 是全应用最高频交互，渐变该删（AUDIT 频率表）；且原声明写在 `:hover` 规则内造成渐入瞬出不对称 |
| index.css 上传拖拽区 | `0.3s` → `0.15s` ×2 | hover 响应预算 ~150ms，300ms 发滞 |
| VehicleListPanel.tsx:274 | `active:scale-[0.995]` → `active:scale-[0.98]` | 0.5% 缩放不可感知；0.98 在 AUDIT 0.95–0.98 有效区间 |

## 二、瞬跳补动效（全部零 JS：display:none→渲染会重启 CSS animation）

新工具类（index.css「瞬跳补动效」段）：`vp-fade-in`（0.18s opacity）、`vp-slide-down`（0.18s -6px 位移+淡入）；
曲线统一走新 token `--ease-ui: cubic-bezier(0.23, 1, 0.32, 1)`。

| 位置 | 改动 |
| --- | --- |
| App.tsx 四个顶层模块 wrapper | 加 `vp-fade-in`（保活 display 切换不变） |
| ParameterWorkbench.tsx 嵌入模式 pane div | 加 `vp-fade-in` |
| index.css | `.parameter-workbench-tabs .ant-tabs-tabpane { animation: vp-fade-in … }`——已核实 antd v6 用 `.ant-tabs-tabpane-hidden { display:none }` 隐藏非活动 pane，激活即重启动画 |
| AssetGroupedView.tsx 分组体 | `{expanded && …}` 条件挂载 → grid-rows reveal（`grid-rows-[0fr/1fr]` + overflow-hidden + visibility 离散过渡：收起播完才隐藏、展开立即显示）；caret 旋转原有，现在终成全套 |
| DataSourcePanel.tsx 批量打标工具栏 | 包一层 `vp-slide-down`（落位入场解释"从哪来"；行缩进 46→78px 的瞬跳刻意不动——多行 padding 过渡是布局动画，一次离散切换反而干净） |
| GovernanceReportModal.tsx 采纳建议 | 新增 `leavingGroups` 状态：采纳后卡片在报告刷新后仍挂载 240ms，`grid-rows-[0fr] + opacity-0` 折叠收场；单个采纳与「全部采纳」同路径 |

## 三、卫生清理

- **删除 `src/App.css`**（Vite 脚手架残留，无任何 import；含 logo-spin 死动画）
- **删除 .skeleton 死代码**：`.skeleton` 类 + `skeleton-sweep` keyframes + `--skeleton-base/--skeleton-shine` 明暗两对 token（实际骨架屏全用 antd `<Skeleton>`）
- **删除 tailwind.config.js 死 token**：`animate-fade-in` + `fadeIn` keyframes（全仓零使用，职责由 vp-fade-in 承接；config 内留注释指路）
- **DataPurifyView.tsx:369**：`hover:text-[--warning]` 与本体同色是死 hover → 改 `--warning-text`（加深一档，真实反馈）
- **AssetListDrawer.tsx:180**：`hover:border-blue-100`（Tailwind 原生蓝，逃逸主题体系）→ `hover:border-[color:var(--border-strong)]`

## 浏览器实测（vite dev + Playwright）

1. 顶层模块切换：`animationstart` 恰好触发一次、仅 incoming 模块淡入 ✅
2. Tab pane 机制：antd 源码核实 display:none 隐藏 → 与模块切换同一已证机制 ✅
3. CSSOM：upload-drag 0.15s / vp-slide-down / tabpane 规则 / 行 hover 无 transition，全部编译生效 ✅

## 手动 feel-check 清单（需真实数据，浏览器无资产）

- 资产分组展开/收起：高度平滑、下方分组不再跳位；暗色下右键菜单
- 批量打标：工具栏落位入场
- 治理体检：采纳后卡片折叠（非瞬跳）；「全部采纳」整组收起
