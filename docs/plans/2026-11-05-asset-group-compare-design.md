# 资产组内对比：文件维度 + 字段差异

> 日期：2026-11-05｜状态：已实施
> 前置：ADR-0003（主文件退役）、`2026-09-30-asset-facets-lifecycle-design.md`（受控属性与生命周期）
> 入口：车型资产 → 车型组头「对比本组」（hover 图标，`DiffOutlined`）

## 1. 背景

资产池里同一车型组常有十几到几十份文件（真实库 V6E 系列 27 份），名字几乎一样，列表只显示「参数数 / 完成率 / 空值」，无法回答：这些文件是不是同一份数据、哪份有效字段最多、差异在哪。

真实数据核查（`/Users/ethan/车型数据库`，542 个资产）：

- 5 份 `…JL6481BEV100 Ⅱ*` 的已填均为 352，逐字段比对 351/352 相同，只差「基础信息::车型族群」；界面 70% vs 74% 全部来自模板行数 478/503/505。
- 同系列内大多是真不同的车（V6E 26 份 → 24 种内容，仅 2 对完全相同）。因此不能承诺「10 份 = 3 种车」，只能把差异量化后交给用户判断。
- 已填值 117,667 个中 `/` 3,100、`N/A` 713 属纯符号占位；`无` 16,109 保留为真实取值。

已排除的路线：版本链折叠与「每组选一个代表」（ADR-0003，且用户明确不想管理版本链）；自由状态标签（会把派生事实写成人肉标注，导入后即失真）。

## 2. 方案

组头「对比本组」把该组**当前可见**文件加入工作集并跳到版本对比页；对比页在字段表上方新增「文件维度」块。

```
车型组头 ──对比本组──▶ addActiveAsset × N ──▶ setCompareProducts ──▶ 版本对比页
                                                                     ├─ 文件维度（新增）
                                                                     └─ 字段维度（既有）
```

### 2.1 口径（`src/utils/assetCompare.ts`，单一来源）

1. 配对键 = `分组::字段名`；值 trim。
2. 值为空或属于 `{ "/", "-", "—", "--", "N/A", "n/a", "na", "待定", "TBD" }` → 视为空；`无` 保留。
3. **有效字段** = 去空去占位后的键数；**总参数** = 参数行数；**占位** = 已填 − 有效。
4. 两份文件差异三桶：仅基准有 / 仅此份有 / 值不同；**内容相同** ⇔ 三桶为 0（缺失与空等价）。
5. **覆盖率** = 有效字段 ÷ 参与对比的**字段并集**。不用「完成率」——分母是各自模板行数，跨模板不可比。
6. 基准 = 有效字段最多的一份；并列取对比顺序靠前者。

### 2.2 文件维度块

- 摘要：`N 份 · 内容 M 种 · 有效字段 X–Y`。
- 表（默认按有效字段降序，可展开/收起）：
  `文件 | 有效字段 | 覆盖率 | 与基准差异 | 公告号 | 准入编号 | 品牌 | 车辆型号 | 等级 | 电池品牌 | 电量 | 状态 | 操作`
- 重点字段全部由参数派生（与 Rust `scan_one` 同源；公告号按包含匹配，兼容「整车公告号」）。
- 状态复用既有生命周期（历史版本 / 废弃），行内 `RowActions` 触发 `useAssetActions.setStatus`；「内容相同」由系统计算，不提供手打状态。仅资产来源可打状态，Excel 来源不出现操作。

## 3. 实现

| 文件 | 改动 |
|---|---|
| `src/utils/assetCompare.ts` | 新增：归一化、有效字段分析、重点字段派生、基准差异、内容等价类 |
| `src/utils/__tests__/assetCompare.test.ts` | 新增：占位口径、缺失等价、模板行数不影响覆盖率、基准选择 |
| `src/components/ParameterWorkbench/CompareFileSummary.tsx` | 新增：文件维度块（摘要 + 表 + 状态动作） |
| `src/components/ParameterWorkbench/CompareView.tsx` | 汇总计算、`_asset_meta.json` 状态读取、块渲染 |
| `AssetPool/AssetGroupHeader.tsx` / `AssetGroupTree.tsx` | 组头新增「对比本组」入口与透传 |
| `AssetPool/AssetPoolLayout.tsx` | 取当前可见组文件 → 激活 → 设对比选择 → 跳转 |
| `ParameterWorkbench/useAssetActions.tsx` | `setStatus` 参数放宽为 `Pick<AssetFileInfo,'fileName'>` |
| `__tests__/AssetPoolLayout.compareEntry.test.tsx` | 新增：点击入口后工作集、对比选择与跳转 |

不采用 `compareMatrix.buildCompareRows`（缺字段不算差异、原始字符串比较）与 `comparator.compareByContent`（忽略分组 + 模糊匹配），两者都不能作为「内容等价」判据。

## 4. 已知边界

- 对比页只消费工作集：带整组进对比会同时进购物车（V6E 为 26 份）。这是现有数据契约，未改动。
- 组内文件数大时，激活会触发 `AssetDataSynchronizer` 全量加载；对比页在此之前显示「同步中」。
- 文件维度块横向滚动；宽度不足时先看到「文件 / 有效字段 / 覆盖率 / 差异」，身份字段在后。

## 5. 验证

- `npx vitest run src/utils/__tests__/assetCompare.test.ts`（11 项）
- `npx vitest run src/components/ParameterWorkbench/__tests__/AssetPoolLayout.compareEntry.test.tsx`
- `npx vitest run src/__tests__/uiConsistency.test.ts`
- `npm run check`（lint → typecheck → test → build，959 项全绿）
- `npm run dev:mock`：构造 3 份（2 份相同、1 份差 1 格），组头对比 → 摘要「3 份 · 内容 2 种」、差异 1、内容相同徽标、历史版本标记落盘；亮/暗色均验证。
