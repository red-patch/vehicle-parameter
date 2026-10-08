# 001 · 弹层动效调教（antd 缩放起点 / 抽屉空壳 / 右键菜单 / reduced-motion）

> 审计来源：improve-animations 工作流（2026-09-30），用户选定「弹层动效调教」包。
> 基准 commit：`ce88a55`。验证命令：`npm run lint && npm run test && npm run build`。

## 背景

全应用弹层（7 个 Modal/Drawer、message、表格）均走 antd v6，但 `themeConfig.ts`
未调教任何 motion token，动效性格完全继承库默认。审计确认的四处硬伤：

1. antd Modal 的 `antZoomIn` keyframe 起始值是 `scale(0.2)`——弹窗"凭空蹦出"。
2. `BidMappingDrawer` 用 `{open && <SchemeEditor/>}` 包裹内容，抽屉退场动画
   进行时内容已卸载，用户看到空壳滑出。
3. `useContextMenu` 是主题孤岛：硬编码 `#fff/#333/#f0f0f0`，暗色模式下是白板；
   瞬现无过渡；hover 靠内联 JS 改 style。
4. `prefers-reduced-motion` 是全杀写法，把 spinner 旋转、脉冲提醒等必要状态
   反馈一起冻住。

## 关键事实（浏览器实测 + node_modules 验证）

- antd v6 keyframe 名带 hash：`css-<hash>-antZoomIn`，dev/prod 前缀不同，
  **静态 CSS 按名覆盖不可行**；必须覆盖 `animation-name`。
- motion 类挂在 `.ant-modal` 同一元素上：`ant-modal css-xxx ant-zoom-enter
  ant-zoom-enter-prepare`。antd 规则选择器为 `:where(.css-xxx).ant-zoom-enter...`
  （特异性 0,2,0），`.ant-modal.ant-zoom-enter.ant-zoom-enter-active` 为 (0,3,0)，稳定生效。
- 入场曲线已是 `cubic-bezier(0.08, 0.82, 0.17, 1)`（antd outCirc，够好）、
  时长 `motionDurationMid` 0.3s（在 200–500ms 预算内）——**不动曲线和时长**。
- Spin 旋转挂在 `.ant-spin-dot`（antRotate 1.2s）与 `.ant-spin-dot-item`
  （antSpinMove 1s alternate）。

## 改动

### A. `src/index.css` — Modal 缩放起点覆盖

```css
@keyframes vp-modal-zoom-in  { from { transform: scale(0.96); opacity: 0; } }
@keyframes vp-modal-zoom-out { to   { transform: scale(0.96); opacity: 0; } }

.ant-modal.ant-zoom-enter.ant-zoom-enter-active,
.ant-modal.ant-zoom-appear.ant-zoom-appear-active { animation-name: vp-modal-zoom-in; }
.ant-modal.ant-zoom-leave.ant-zoom-leave-active { animation-name: vp-modal-zoom-out; }
```

0.96 = AUDIT.md 目标区间 0.9–0.97 的上限档（crisp 性格，弹得少）。

### B. `src/index.css` — reduced-motion 重写

位移/缩放类动画停用（0.01ms），但 transition 限定为颜色/透明度/阴影属性、
保留 0.15s，颜色反馈不死；`.ant-spin-dot(-item)` 豁免（加载指示是必要信号）。

### C. `src/hooks/useContextMenu.tsx` — token 化 + 入场动效

- 内联样式/内联 hover 全部移到 `index.css` 的 `.vp-context-menu*` 类，
  颜色接 `--surface-elevated / --border-popover / --shadow-popover /
  --text-1/4 / --danger-text / --surface-3 / --border-default`，明暗自适配。
- 入场：`scale(0.96)→1 + fade`，0.15s `cubic-bezier(0.23, 1, 0.32, 1)`；
  `transform-origin` 设为真实点击点相对菜单的偏移（state 里存 originX/Y，
  处理视口边缘 clamp 后的翻转）。退场即关（桌面菜单惯例，不拖泥带水）。

### D. `src/components/ParameterWorkbench/BidMappingDrawer.tsx:360`

删掉 `{open && …}` 条件渲染；内容随 Drawer 首开挂载、退场动画播完由
`destroyOnClose` 卸载——空壳滑出消失。

## 不做的事（范围纪律）

- themeConfig 的 motionDuration*/motionEase* token：antd 默认值本就在预算内，
  统一 token 双接线属「卫生+可访问性」包（用户未选）。
- Tooltip `zoom-big-fast` 起点 0.8 + 0.1s fast：感知轻微，不动。
- AssetGroupedView hover、表格行 hover、瞬跳补动效：属其他包。

## 验证

1. 浏览器（vite dev + Playwright）：重开 GovernanceReportModal，捕获入场动画
   `animation-name === 'vp-modal-zoom-in'`，t≈5ms 时 transform ≈ scale(0.96)。
2. 暗色模式打开右键菜单（真机，浏览器无数据）：无白板、从点击点缩放淡入。
3. 关 BidMappingDrawer：编辑内容跟随抽屉滑出，不再空壳。
4. 系统开启「减弱动态效果」后：modal/菜单直现，但加载转圈仍在转、hover 变色仍有过渡。
5. `npm run lint && npm run test && npm run build`。
