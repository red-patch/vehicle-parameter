# 公告中心 / 法规标准 布局与字号一致性优化 — 设计方案

> 日期：2026-10-15 ｜ 状态：**已实施**
> 来源：2026-10-15 用户真机截图反馈（公告中心 3 条 + 「看看法规标准是不是也有相应问题」）。
> 视觉基准：**曜蓝 v4.1**（`docs/design-v4-obsidian-blue/` token 体系）。
> 关联：`docs/plans/2026-10-02-announcement-archive-grouped-view-design.md`（分组视图）、`2026-10-08-regulation-library-design.md`（法规库）、`2026-10-01-asset-panel-layout-redesign.md`（用视口钉高范式）。

## 1. 用户反馈与实测根因

用户逐条反馈（截图红框）与真机量测的对应关系：

| # | 反馈原文 | 实测证据 | 根因 |
|---|---|---|---|
| 1 | 「下滑公告归档列表的时候 这块是不是可以隐藏起来？」 | 查询/粘贴两卡 + Steps 常驻首屏 ~290px | 顶部区无滚动联动，永久占版面 |
| 2 | 「字体是不是有点小啊？」（chips：全部/有PDF/无PDF/未归类/有关联资产） | `Tag.CheckableTag` 实渲 **10px** | 组件默认吃 `fontSizeSM`——基准 13px 时 antd 算出 `floor(ceil(13·e^-0.2)/2)*2 = 10`，**跌出字号阶梯最低档 11px** |
| 3 | 「显示 json 文件的意义是什么…这块整体布局都要优化一下」（展开行） | `AnnouncementFlatTable` 展开行渲染 `productName` + `fileName`（含 `.json`） | ① 泄露内部文件名，违反 AGENTS.md「面向用户的文案不解释内部实现」；② 资产文件名由 `productName` 派生，两列**内容近乎重复**（真实数据：`V6E…Ⅲ2` vs `V6E…Ⅲ2.json`） |
| 4 | 「法规标准那块是不是也有相应的问题」 | 表头 **11.5px / `#555`**；正文 12.5px；输入框 13px 固定 | **同一根因**：`index.html` 的「原生质感覆写」用 `!important` 写死字号与颜色 |

### 1.1 根因定位：`index.html` 内联覆写绕过 token 体系

`index.html` `<head>` 内有一段「原生质感覆写」，其中 ⑤ 组：

```css
.ant-table-cell { font-size: 12.5px !important; }
.ant-input, .ant-select, .ant-btn { font-size: 13px !important; }
.ant-table-thead .ant-table-cell { font-size: 11.5px !important; font-weight: 600 !important; color: #555 !important; }
```

两处后果，**两张表都中招**（同类 bug，一次修全）：

1. **字号冻结**：真机验证——把「设置 → 外观 → 界面字号」调到「大」（`data-font-scale=large`，`--fs-aux` 12→14px），输入框仍 13px、表头仍 11.5px、正文仍 12.5px，**全不跟随**。该设置对这三类元素形同失效。
2. **暗色不可读**：`color: #555` 是硬编码浅色灰。暗色下 `#555` on `--surface-2`(`#161B23`) 对比度 **2.0:1**，远低于 WCAG AA 正文 4.5:1；表头比正文还暗，层级倒置。

同组 ⑥ 另有 `rgba(0, 122, 255, …)`（iOS 系统蓝）作行底/hover——与曜蓝 `--brand`(`#2F44D8`) 不同源，暗色下几乎不可见。

## 2. 目标与范围（grilling 收口）

| # | 决策 | 裁定 |
|---|---|---|
| Q1 | 顶部区收起方式 | **滚动自动收起**（用户选定）：滚过阈值收成一条摘要条，滚回顶部自动展开；摘要条带 caret 可手动展开，手动展开态在滚回顶部时重置 |
| Q2 | 法规标准范围 | **一致性小修 + 筛选可折叠**（用户选定）：统一控件尺寸/字号、去重复标题、列宽响应式、筛选区可收起。结构不动，不做「深度对齐 chips 范式」 |
| Q3 | 字号修法 | **修因不修表**：删 `index.html` 的 `!important` 字号/颜色覆写，改由 antd token + `--fs-*` 阶梯驱动；表头层级用 token 化的 aux 档保留 |
| Q4 | chips 修法 | 新增 `.chip-md`（`--fs-aux` / 20px 行高）提到 12px 档，与资产池 chips 同档；不改 antd 全局 `fontSizeSM`（那会连带 Badge/Table 展开图标） |
| Q5 | 展开行内容 | **替换为有意义的信息**（而非仅删 `.json`）：车型名 + 参数量 + 完成率 + 更新时间——直接回答「显示这个文件名的意义是什么」 |
| Q6 | 行底/hover 色 | 同组硬编码 iOS 蓝一并换 token（`--brand-weak`），与全站选中态同源 |
| Q7 | 交互态持久化 | 法规筛选折叠态记 localStorage；公告顶部区不持久化（纯滚动派生） |

## 3. 实施规格

### 3.1 根因修复（`index.html` + `src/index.css`）

- `index.html`：删除 ⑤ 整组字号 `!important` 覆写；⑥ 的行底/悬停改用 token 变量（不写死 iOS 蓝）。保留非字号的原生质感覆写（圆角、过渡、`::selection`、禁右键）。
- `src/index.css`：把表头排版收进 token 化规则——

```css
.ant-table-thead .ant-table-cell {
  font-size: var(--fs-aux);      /* 12px 基准，随「界面字号」缩放 */
  font-weight: 600;
  color: var(--text-2);          /* 暗色自动翻转，不再 2:1 */
}
```

正文单元格不再单独覆写——antd 的 `Table` 用 `token.fontSize`，本就等于当前档位基准字号。

- `src/index.css` 新增 chip 档位类（见 3.2）。

### 3.2 公告中心

| 项 | 改动 |
|---|---|
| chips 字号 | `AnnouncementArchiveList` 的 `Tag.CheckableTag` 挂 `chip-md`；`index.css` 定义 `.ant-tag.chip-md { font-size: var(--fs-aux); line-height: 20px; padding: 0 8px; border-radius: 6px; }`（特异性 0,2,0 稳压 `.ant-tag`） |
| 展开行 | `JoinedAsset` 增 `totalParams`/`filledParams`/`updatedAt`（可选，向后兼容）；`AnnouncementArchiveList` 的 `linkedAssets` 填充；`AnnouncementFlatTable.expandedRowRender` 改为紧凑一行：`车型名 · N 参数 · 完成率 · 时间`，**不再出现 `.json`** |
| 顶部收起 | 新增 `src/utils/scrollCollapse.ts`（纯函数 `shouldCollapse`）+ `src/hooks/useScrollCollapse.ts`（滚动监听，含保活 tab 的可见性守卫）；`AnnouncementQuery` 收起 Steps + 两卡为一条摘要条 |

### 3.3 法规标准

| 项 | 改动 |
|---|---|
| 重复标题 | 去掉 `Title level={4}`「法规标准」（18px，与顶栏 tab 名重复）；库路径与「选择目录/刷新」移入卡片头 |
| 筛选区 | `RegulationFilterPanel`：去掉 `size="small"` 混排（与默认尺寸的搜索框对齐）；加折叠 caret + localStorage（默认展开，收起后只剩搜索行） |
| 列宽响应式 | `RegulationTable`：层级/主题域/实施日期/文件按 `lg`/`xl` 收纳（对齐公告表的既有做法），窄窗不再挤塌 |

## 4. 改动面

| 文件 | 动作 |
|---|---|
| `index.html` | 删字号覆写、颜色换 token |
| `src/index.css` | 表头 token 化规则、`.chip-md` |
| `src/utils/scrollCollapse.ts` | 新增（纯函数） |
| `src/hooks/useScrollCollapse.ts` | 新增 |
| `src/utils/announcementGrouping.ts` | `JoinedAsset` 扩字段 + `describeLinkedAsset`（纯函数） |
| `src/components/AnnouncementQuery/AnnouncementArchiveList.tsx` | chips 类、`linkedAssets` 填字段 |
| `src/components/AnnouncementQuery/AnnouncementFlatTable.tsx` | 展开行重写 |
| `src/components/AnnouncementQuery/AnnouncementQuery.tsx` | 顶部滚动收起 |
| `src/components/RegulationLibrary/RegulationLibrary.tsx` | 去重复标题、头部重排 |
| `src/components/RegulationLibrary/RegulationFilterPanel.tsx` | 尺寸统一 + 折叠 |
| `src/components/RegulationLibrary/RegulationTable.tsx` | 列宽响应式 |
| 对应 `__tests__` | 新增/扩展 |

## 5. 验证

- `npm run lint` / `typecheck` / `test` / `build` 四条全跑
- 新增单测：`scrollCollapse`（阈值/手动展开/回顶重置）、`describeLinkedAsset`（去 `.json`、重复抑制、空值）
- 回退测试：把旧实现放回，新测试必须真挂
- 真机核对：暗色下表头对比度、界面字号切「大」后控件跟随、chips 12px
