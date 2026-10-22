# 快捷筛选 chip：可恢复、可辨识、不误放段位 — 设计方案

> 日期：2026-10-19 ｜ 状态：已实施
> 来源：用户反馈「几个模块下面的快捷按钮太丑了，且好像不支持恢复筛选」
> 关联（本文**修订**下列既有规范）：
> - `2026-10-15-ui-构件规范-design.md` §4.2（FacetChips）
> - `2026-10-17-列表区统一设计语言-design.md` §4.1（②③ 分段）、§5.3（清除筛选）、§9.1（异常信号）
> - `2026-10-19-参数名只读-design.md` §2.4（非标准字段名仍告警，信号保留）

## 1. 现象与根因

用户一句话点出三件事，实测全部复现（数据体检 / 智能填报 / 公告归档）：

| 现象 | 根因 |
|---|---|
| **「不支持恢复筛选」** | `FacetChips` 单选没有取消语义：再点已选项回传同一个值，表格原地不动。数据体检选中「枚举异常」后**唯一退路是刷新页面**；公告归档得自己回头去点「全部」 |
| **「太丑」** | ① 语义档色用了图形层 token（`--warning` #E8930C / `--danger` #E5484D），白底 12px 小字对比度约 3:1 与 4:1，读起来像禁用态，且与表格内的图标色不统一；② 未选中项是「灰底 + 灰边 + 12px 灰字」，和只读标签无法区分，没有可点击的暗示；③ 一次性给 chip 挂 `text-2` 和 `text-warning` 两个文字色类，谁生效取决于样式表顺序 |
| **同一页里「快捷」找不到** | 数据体检把快捷筛选放在 **③ 显示选项段**，与「分组」「字段组」混排。快捷筛选改变的是**可见行集合**，属于 ② 筛选段（§4.1 原文：② 改数据集合，③ 只改呈现方式） |

另有一处语义错误：异常数为 0 时 chip 显示「完全合规」，但它可点击——点下去会把表筛成空的（`valueFilter === 'anomaly'` 找不到任何行）。「未配置词表」「完全合规」是**状态说明**，不是筛选项。

## 2. 裁定

1. **单选 chip 必须可取消**：`FacetChips` 新增 `clearable`，再点已选项回传 `''`，调用方映射回「不筛」。护栏 **R16** 强制：单选且未传 `clearable` 的 `<FacetChips>` 判红。
2. **清除筛选 = link 按钮，仅在有筛选时出现**（§5.3 已有规定，本轮补齐落地页）：数据体检、智能填报、公告归档、版本对比、多车型整理。法规标准此前已按此实现，本轮不动。它不替代 chip 的取消语义——筛选横跨两段时，逐个点掉不现实。
3. **语义档改用 `--warning-text` / `--danger-text`**：`--warning` / `--danger` 是图形层色（圆点、色条、图标），文字色有专门的 `-text` 变体，亮暗两套各自调过对比度。
4. **选中态加对勾**：未选中的 chip 与普通标签同形，仅靠底色差不足以表达「可切换」。
5. **悬停反馈**：未选中 chip 悬停时底色抬到 `--surface-2`、描边转 `--brand`，过渡 0.12s（与 `.cell-edit-text` 同档）。
6. **快捷筛选归 ② 段**：数据体检把「快捷」移回筛选行；③ 段只留「分组」「字段组」。
7. **状态说明不可点**：「未配置词表」「完全合规」标 `disabled`（文案保留，避免用户以为筛选项丢了）。

## 3. 影响

- 行为：所有存在快捷筛选的页面都能「再点一次取消」+「一键清除」；两处状态说明不再可点。
- 视觉：语义色变深（亮色 #9A5806 / #C92A2A，暗色自动提亮）；选中态多一个对勾；未选中态悬停有反馈。
- 兼容：`clearable` 默认 `false`，其余调用点行为不变；护栏 R16 会把「新写的单选 chip 没给退路」判红。

## 4. 代码落点

| 文件 | 改动 |
|---|---|
| `src/components/common/FacetChips.tsx` | `clearable` 开关、对勾、tone → `-text` 变体、去掉重复文字色类 |
| `src/index.css` | `.chip-md` 过渡 + 未选中悬停底色 |
| `src/components/DataPurify/purifyAnomaly.ts` | 状态说明 chip 置 `disabled`；新增 `hasPurifyFilters` 纯函数 |
| `src/components/DataPurify/DataPurifyView.tsx` | 「快捷」移回 ② 段；`clearable`；清除筛选 |
| `src/components/SmartFiller/MatchResultTable.tsx` | 两处单选 chip `clearable`；清除筛选（覆盖匹配度/状态/必填/视同/搜索） |
| `src/components/SmartFiller/ConfigManagerView.tsx` | 字段表 chip `clearable` + 空值映射回 `all`；Tab 内补「清除筛选」 |
| `src/components/AnnouncementQuery/AnnouncementArchiveList.tsx` | `clearable` + 清除筛选 |
| `src/components/ParameterWorkbench/CompareView.tsx` | 清除筛选（差异视图/字段组/搜索） |
| `src/components/ParameterWorkbench/MultiVehicleView.tsx` | 清除筛选（搜索） |
| `src/__tests__/uiConsistency.test.ts` | 护栏 R16 |

## 5. 验证

- `npm run lint`（0 error / 19 条既有 exhaustive-deps warning）、`npm run typecheck`、`npm run test`（109 文件 926 用例）、`npm run build` 全过
- **回退测试**：把 `FacetChips.tsx` / `DataPurifyView.tsx` / `purifyAnomaly.ts` / `AnnouncementArchiveList.tsx` / `MatchResultTable.tsx` / `ConfigManagerView.tsx` / `CompareView.tsx` 换回旧实现，新写的 14 条用例全部真挂且指向具体行为（例如「再点已选项应回传空串，实际回传同值」）
- **全量跑 5 次，3 次绿**；2 次失败均为 `Test timed out in 15000ms`（`CompareView.groupKey` / `CompareView.assetSync` / `assetManager.persist` 交替出现），单独跑与按目录跑均 3/3 通过 → 判为并行负载下的既有抖动，与本轮改动无关（本轮新增的 CompareView 用例在所有轮次中均通过）
- 浏览器实测（vite dev）：数据体检点 chip → 2/12、再点 → 12、清除筛选 → 输入搜索后再点 → 12；公告归档、智能填报同样验证；暗色下语义色为 rgb(245,188,102) / rgb(245,138,141)
