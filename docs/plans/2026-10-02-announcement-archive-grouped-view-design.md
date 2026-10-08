# 公告归档分组视图重设计 — 设计方案

> 日期：2026-10-02 ｜ 状态：**已实施并验证**（Q1–Q11 全项落地；实施备注与验证范围见 §9）
> 来源：2026-10-02 grilling 会话（Q1–Q11 两轮收口，用户逐项确认）。
> 关联：`docs/plans/2026-10-01-announcement-center-design.md`（公告中心）、`2026-09-29-asset-grouped-view-design.md`（资产分组视图，范式参照）、`docs/adr/0003`（版本链语义）。

## 1. 背景与问题

公告归档列表（`AnnouncementArchiveList.tsx`）是单层平铺表：一行 = 一条记录（车型名｜公告号｜批次｜PDF｜参数数｜关联资产｜导入时间｜6 操作），孤儿置顶、其余按导入时间倒序。用户痛点：**一个车型有多个公告号、一个公告号有多个批次，全部分散在不同位置**，没有「这款车的公告全景」的入口。

真实库（车型数据库/公告PDF，22 条记录）证据：

| 现象 | 实例 |
|---|---|
| 车型 → 多公告号 | 大拿V1 有 SH5033…-Z50 / SH5041…-J51 / SH6520…-J64 三个公告号；V6E 有 DNC5037XXYBEVP1 / JHC6480BEV22 两个 |
| 公告号 → 多批次 | DNC5037XXYBEVP1 有 398/404 两批次；JHC6480BEV22 有 396/406；DNC5037XXYBEVGR5 有 402/408/无批次 |
| 车型名近名分家 | `V8E_DNC5037XXYBEVGS1_403` 与 `远程V8E_*` 按名分组会拆成两家 |
| 车型名粘连公告号 | `GLE850（邮政）XML5036XYZEVS0`（vehicleName 字段里混入了公告号） |
| 无车型名记录 | `DNC5031XXYBEVGS3`（批次 407）、`DNC5037XXYBEVP1`（无批次）——**未归类桶有真实住户** |
| 非标批次 | F1E 的批次值 =「减免购置税目录批次（第65批）」 |
| 重复对 | `大拿V1_SH5041XXYU6BEV-J51_399(2)`（用户手动删，不自动处理） |

## 2. 目标形态（总览）

```
公告归档（Card 全宽）
┌──────────────────────────────────────────────────────────────┐
│ [搜索: 车型/公告号/批次]  chips: 全部|有PDF|无PDF|未归类|有关联资产 │
│ [Segmented: 分组 | 平铺]        导入PDF | 批量导入 | 迁移 | 刷新  │
│ ──────────────────────────────────────────────────────────── │
│ ▾ 未归类（2）                                    ⚠待认领       │
│   · DNC5031XXYBEVGS3 · 407   [认领建档] [6操作]                │
│   · DNC5037XXYBEVP1 · —      [认领建档] [6操作]                │
│ ▸ 大拿V1（3 公告号 · 4 记录 · 关联资产 5）                       │
│ ▾ 远程V8E（1 公告号 · 4 记录 · 关联资产 2）        ← V8E 已并入   │
│   ▾ DNC5037XXYBEVGR5          [导入新批次] [对比批次]           │
│   │   ● 408（最新） PDF✓ 参数41  [打开][复制][参数][关联][定位][删除] │
│   │   ○ 402（历史 1 版）       [同上 6 操作]                    │
│   │   ○ 无批次                 [同上 6 操作]                    │
│ ▸ V6E（2 公告号 · 4 记录）        …（列表内部滚动）               │
└──────────────────────────────────────────────────────────────┘
```

一句话：**分组树是主视图（车型 → 公告号 → 批次三层，批次层保留全部行内操作），平铺表格保留为辅助视图；纯视图层聚合，存储与扫描零改动。**

### 2.1 决策一览（grilling 收口）

| # | 决策 | 裁定 |
|---|---|---|
| Q1 | 视图集 | **分组树（主）+ 平铺表格（辅）**；时间线视图不做 |
| Q2 | 分组键 | **归一化组键**：剥品牌词等规则纯函数实现；显示名 = 组内最常见写法；数据不动；组改名 UI 不做（Q10） |
| Q3 | 多批次 | **版本链**：批次新→旧，最新 = 链头默认可见，旧批次折叠为「历史 N 版」可展开；链头仅是展示焦点，不改数据语义（新批次≠替换） |
| Q4 | 脏数据 | **未归类桶置顶**（无车型名记录），行内「认领建档」复用现有弹窗；非标批次原样显示；`(2)` 重复对不特殊处理 |
| Q5 | 查找 | 搜索匹配车型/公告号/批次且**自动展开命中路径**；chips：全部｜有 PDF｜无 PDF｜未归类｜有关联资产 |
| Q6 | 数据层 | **纯视图层**：`announcementStore.infos` 运行时聚合；不动 JSON/扫描命令 |
| Q7 | 级间操作 | 公告号级 = `导入新批次`（预填车型+公告号）；组级 = `查看全部关联资产`（多公告号过滤）+ `导入该车型新公告`（预填车型名）；批次级 = 现有 6 操作原样 |
| Q8 | 批次对比 | **进本期**：公告号级「对比批次」，默认相邻两批次（新 vs 旧），多批次可切换；只读，差异行高亮 |
| Q9 | 视觉 | **树形表格**（antd Table treeData）：组行加深底色+粗体+统计徽标；与资产分组视图同一语言 |
| Q10 | 组改名 | v1 **不做**手动改名：纯函数归一化 + 词表驱动，接口留好 |
| Q11 | 杂项 | 默认全折叠不持久化；Segmented 选择记 localStorage；未归类桶置顶带认领入口 |

## 3. 分组算法（纯函数，重测试）

新文件 `src/utils/announcementGrouping.ts`，输入 `AnnouncementInfo[]` + 筛选/搜索态，输出树形结构。全部规则有单测，用例直接取上表真实记录。

### 3.1 车型名归一化（normalizeVehicleSeriesName）

按序应用，产出组键（groupKey）：

1. **R1 压空白**：trim + 压内部空白。
2. **R2 剥粘连公告号**：vehicleName 含 announceNo 子串时移除（清掉残留分隔符）——治 `GLE850（邮政）XML5036XYZEVS0`。
3. **R3 剥品牌词前缀**：`BRAND_WORDS = ['远程', '解放', '吉利', …]`（常量词表，可扩充），命中即剥——治 `V8E` ≡ `远程V8E`。
4. **R4 剥尾部括号段**：去掉结尾的 `（…）/(...)`——治 `GLE850（邮政）` ≡ `GLE850`。

**组显示名** = 组内原样 vehicleName 出现最多的写法（票数同 22 条样例：`远程V8E` 3 票 > `V8E` 1 票 → 显示 远程V8E）；平票取更长者（信息多者优先）。词表不全时顶多没合并、不会拆错（Q2 裁定依据）。

### 3.2 树构建（buildAnnouncementTree）

```
Group[]（车型组，含「未归类」桶）
└─ vehicle: { key, displayName, recordCount, announceCount, linkedAssetCount }
   └─ AnnounceNode[]（组内按公告号聚合）
   │  └─ { announceNo, batches: AnnouncementInfo[] }
   │     ├─ 链头 = 批次号最大的记录（batchSeq 排序；非标批次/无批次恒排链头之后）
   │     └─ history = 其余记录（新→旧）
   └─ 组内排序：公告号按其链头批次号降序；组间按显示名 localeCompare(zh)；未归类桶恒置顶
```

- **未归类判定**：vehicleName 为空/空白 → `未归类` 桶（组键 `__unsorted__`），桶内不设公告号层，直接平铺记录（每条带「认领建档」）。
- 同公告号跨车型出现（`DNC5037XXYBEVP1` 裸记录 vs V6E 组内两条）**不强行合并**：树按车型归属；chips/搜索能同时捞出三处（Q4 裁定：只提示不自动动）。

### 3.3 搜索与筛选

- 搜索（子串、大小写不敏感）命中任意层字段 → 该记录可见，且**祖先链全部自动展开**；无命中词时恢复默认折叠。
- chips 与搜索叠加（AND）：`有PDF`=`hasPdf`；`未归类`=组键 `__unsorted__`（含孤儿）；`有关联资产`=linkedAssetCount>0。

## 4. 视图与交互规格

### 4.1 分组树视图（新组件 AnnouncementGroupedTable）

antd Table 三类行（treeData 展开箭头 + 缩进）：

| 行 | 内容 | 操作 |
|---|---|---|
| 车型组行 | 显示名（粗体）+ 徽标：`N 公告号 · M 记录 · 关联资产 K`（K>0 高亮） | `查看全部关联资产`（跳工作台，按组内全部公告号过滤）· `导入该车型新公告`（预填车型名） |
| 公告号行 | 公告号 + `N 批次` 徽标 | `导入新批次`（预填车型+公告号）· `对比批次`（Q8）· 展开 |
| 批次行（叶子） | 链头带 `最新` 标记；历史折叠为「历史 N 版」父行（展开后逐行展示）；列 = PDF/参数数/关联资产/导入时间 | 现有 6 操作原样：打开/复制/参数/关联资产/定位/删除 |

- 默认**全折叠**（只见组行）；不持久化展开状态（Q11）。`历史 N 版` 行本身可再展开——折叠只影响默认可见性，任何批次行随时可操作。
- 组行/公告号行/叶子行宽度对齐同一套列栅格，操作列右对齐固定。

### 4.2 平铺视图

现有表格原样保留（含孤儿置顶、导入时间倒序、6 操作、关联资产展开行）。搜索框、chips 两种视图共用；平铺视图下 chips 同样生效。

### 4.3 视图切换

工具栏 `Segmented「分组｜平铺」`，选择写 localStorage（key `announcement-archive-view`）；默认分组。

### 4.4 批次对比（新组件 AnnouncementBatchDiffDrawer）

- 入口：公告号行 `对比批次`；默认选**相邻两批次**（链头 vs 下一批），多批次时抽屉内可切换对比对。
- 形态：复用 `AnnouncementDiffDrawer` 的表样语言（Drawer + 三列），列 = 参数名｜旧批次值｜新批次值（新为基准列）；同名参数 trim+压空白精确匹配（与 `announcementCompare.toValueMap` 同口径），值不同高亮、单侧缺失单列显示，统计条 `N 项对比 · M 项差异`。只读。
- 实现：`compareBatchParams(oldParams, newParams)` 纯函数放 `announcementCompare.ts`（复用 toValueMap），抽屉组件独立新文件，不往 AnnouncementArchiveList 里堆（热点文件纪律）。

### 4.5 级间操作联动

- `查看全部关联资产`：`vehicleStore.pendingAnnounceNoFilter` 从 `string | null` 扩为 `string[] | null`（单值调用方包数组），工作台消费侧改为 Set 过滤——一次信号传递组内全部公告号。
- `导入新批次`/`导入该车型新公告`：复用 `AnnouncementImportModal` 的 prefill 通道，零新弹窗。

## 5. 组件划分与改动面

| 文件 | 动作 | 说明 |
|---|---|---|
| `src/utils/announcementGrouping.ts` | 新增 | 归一化 + 树构建 + 筛选纯函数；BRAND_WORDS 词表 |
| `src/utils/__tests__/announcementGrouping.test.ts` | 新增 | 真实 22 条样例做 fixture：近名合并、粘连剥除、版本链、未归类、chips、搜索展开路径 |
| `src/utils/announcementCompare.ts` | 扩展 | `compareBatchParams`（复用 toValueMap） |
| `src/utils/__tests__/announcementCompare.test.ts` | 扩展 | 批次对比用例 |
| `src/components/AnnouncementQuery/AnnouncementGroupedTable.tsx` | 新增 | 分组树表格（Q9 视觉规格） |
| `src/components/AnnouncementQuery/AnnouncementBatchDiffDrawer.tsx` | 新增 | 批次对比抽屉（4.4） |
| `src/components/AnnouncementQuery/AnnouncementArchiveList.tsx` | 改造 | 工具栏（搜索/chips/Segmented）+ 双视图编排；平铺表抽成子组件或原样内留，**总行数不得净增超 ~150**（热点纪律，超了就拆平铺表出去） |
| `src/store/vehicleStore.ts` | 微改 | `pendingAnnounceNoFilter: string[] \| null`；消费侧（DataSourcePanel）同步 |

**不改动**：记录 JSON 结构、`scan_announcements`、公告号 join 语义、`AnnouncementImportModal`/批量导入/迁移。

## 6. 验收标准

1. 真实库打开默认分组视图：`未归类(2)` 置顶 → 10 个车型组；`远程V8E` 组含 4 条记录（V8E 并入），显示名 `远程V8E`；`GLE850` 组 2 条（（邮政）条目经 R2/R4 并入）。
2. 展开 V6E → 2 个公告号；展开 DNC5037XXYBEVP1 → `404（最新）` + `历史 1 版`（398），两行都能打开 PDF。
3. 搜「403」→ 命中记录的祖先链自动展开（H8E、大拿V1-SH6520、V8E 各路径可见；真实库实测 3 条）。
4. chips `未归类` → 仅桶内 2 条；`有关联资产` → 仅有关联记录的组可见。
5. 公告号级「对比批次」：DNC5037XXYBEVP1 默认 404 vs 398，差异行高亮，统计条数字正确。
6. 组级「查看全部关联资产」→ 工作台按该组全部公告号过滤（多值）。
7. 平铺视图行为与现版一致（回归基线）；Segmented 选择重启应用后保持。
8. `npm run lint`（比对改动文件）、`npm run test`、`npm run build` 三条过；新纯函数 ≥15 单测。

## 7. 分期

- **M1（骨架）**：announcementGrouping.ts + 单测、分组树表格、Segmented 切换、未归类桶 + 认领、搜索自动展开。
- **M2（补全）**：chips、组级/公告号级操作（多值过滤信号）、批次对比抽屉、平铺视图 chips 共用。
- 单期可交付（用户要求时 M1+M2 一并落）；顺序即依赖序。

## 8. 开放问题

无——Q1–Q11 已全部收口。实施期唯一自由度是 BRAND_WORDS 初始词表范围（先 `['远程','解放','吉利']`，按库内数据再扩）。

## 9. 实施备注（2026-10-08 回填；代码核对）

**落位产物**：

| 文件 | 动作 | 说明 |
|---|---|---|
| `src/utils/announcementGrouping.ts` | 新增 | 归一化（R1–R4）+ `buildAnnouncementTree` + `filterArchiveInfos` + 行键/展开键工具；`BRAND_WORDS` 初始词表即 §8 三项 |
| `src/utils/__tests__/announcementGrouping.test.ts` | 新增 | 19 单测，fixture = 真实库 22 条（§1 表格） |
| `src/utils/announcementCompare.ts` | 扩展 | `compareBatchParams`（复用 `toValueMap`） |
| `src/utils/__tests__/announcementCompare.test.ts` | 扩展 | 批次对比例再 +4（`compareAssetWithAnnouncement` 6 + 批次 4） |
| `src/components/AnnouncementQuery/AnnouncementGroupedTable.tsx` | 新增 | 分组树（antd treeData，309 行） |
| `src/components/AnnouncementQuery/AnnouncementFlatTable.tsx` | 新增 | 平铺表原样抽出（162 行，回归基线） |
| `src/components/AnnouncementQuery/AnnouncementBatchDiffDrawer.tsx` | 新增 | 批次对比抽屉（168 行） |
| `src/components/AnnouncementQuery/AnnouncementArchiveList.tsx` | 改造 | 工具栏（chips/Segmented/搜索）+ 双视图编排 + 动作编排（425 行） |
| `src/store/vehicleStore.ts` | 微改 | `pendingAnnounceNoFilter: string[] \| null`（§4.5） |
| `src/components/ParameterWorkbench/DataSourcePanel.tsx` | 微改 | 消费侧多值信号 → `announceNoInput`（按空白拆多值） |
| `src/index.css` | 微改 | `.group-row` / `.diff-row` 高亮 |
| `scripts/verify_archive_grouping_dry_run.ts` | 新增 | 只读真实库干跑，对照验收 #1–#4 |

**§ 节覆盖对照**（逐项核对，非凭组件存在推断）：

- **§2.1 决策 Q1–Q11 全项落地**：双视图（Q1）、归一化组键纯函数（Q2）、版本链链头+历史折叠（Q3）、未归类桶置顶+认领（Q4）、搜索自动展开+5 chips（Q5）、纯视图层聚合（Q6）、三级操作（Q7）、批次对比进本期（Q8）、antd treeData 树形表格（Q9）、组改名 v1 不做（Q10）、默认折叠不持久化 / Segmented 记 localStorage（Q11）。
- **§3 分组算法**：R1–R4 齐；链头 = `batchSeq` 最大、非标/无批次（seq=-1）恒排链头之后（`batchSeq` 取首个数字，无数字返回 -1）；组间显示名 `localeCompare('zh')`、未归类恒置顶；`groupKeyOf` 以 `orphan || 归一化空` 判未归类。
- **§3.2 同公告号跨车型不强行合并**：树按车型归属（`DNC5037XXYBEVP1` 裸记录落未归类桶、V6E 组内两条各自成链），未做车型间合并——符合 Q4「只提示不自动动」。
- **§4.1 分组树**：三类行、批次行 6 操作原样、组行/公告号行各自操作、未归类桶不设公告号层直接平铺（`AnnouncementGroupedTable.tsx:70-108`）；默认全折叠、展开态不持久化。
- **§4.2/§4.3 平铺视图 + 切换**：`AnnouncementFlatTable` 保留孤儿置顶/导入时间倒序/6 操作/关联资产展开行；Segmented 共用搜索与 chips，写 `announcement-archive-view`，默认分组。
- **§4.4 批次对比**：入口公告号行「对比批次」（<2 批次禁用）；默认相邻两批次（索引 0 vs 1）、抽屉内 Select 可切换；新批次为基准列、差异行 `.diff-row` 高亮、统计条 `N 项 · 一致 / 差异`；只读；`compareBatchParams` 在 `announcementCompare.ts`，抽屉独立成文件（未堆进 ArchiveList）。
- **§4.5 级间联动**：组级多值过滤信号 `pendingAnnounceNoFilter: string[]`，消费侧改为输入框多值（空白拼接）而非 Set 实例；`导入新批次`/`导入该车型新公告` 复用 `AnnouncementImportModal` prefill 通道（零新弹窗）。
- **§5 改动面**：均按表落位；`AnnouncementArchiveList` 425 行（含平铺表抽出），热点纪律满足。

**实施偏差**（1 处，方向已反转）：

- **组显示名平票取舍与 §3.1 相反**：§3.1 写「平票取更长者（信息多者优先）」，实现取**更短者**（`announcementGrouping.ts:87-103`，按「脏写法往往更长，如粘连公告号的那种」）。22 条真库样例下两种规则产出一致（`远程V8E` 3 票 > `V8E` 1 票），故验收 #1 不受影响；仅平票且长短写法并存时行为有别。以代码为准，本节即口径。

**验证记录**（2026-10-08，主仓库 e15bc7b）：

- `npx vitest run` 两文件全绿：`announcementGrouping` 19 + `announcementCompare` 10 = **29 passed**（满足 §6.8「新纯函数 ≥15 单测」，实际 19）。
- 代码核对：`grep` 确认 `pendingAnnounceNoFilter` 类型、`DataSourcePanel` 消费侧、`.group-row`/`.diff-row` CSS、`batchSeq`/`orphan` 语义均已落位。
- **未重复执行**：`npm run lint` / `npm run build` 因本次为纯文档改动、无代码变更而未重跑；构建态与验收 #1–#7 的用户实测记录属 v4.10.0 发布（`e15bc7b`）本身，本文不另行复现。

**遗留**：无阻断项。可选后续：BRAND_WORDS 按库内数据扩词（§8）；组显示名若确认要「取更长者」，改 `pickDisplayName` 比较方向即可。
