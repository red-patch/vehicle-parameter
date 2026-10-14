# 资产池 · 车型组重命名入口 — 设计方案

> 日期：2026-10-14 ｜ 状态：已实施
> 前置文档：`2026-10-13-asset-alias-design.md`（资产级别名，与本设计的分层关系见 §3）、`2026-10-14-asset-pool-grouping-design.md`（分组渲染）、`2026-10-14-asset-pool-multigroup-views-design.md`（多层分组树）
> 领域术语见 `CONTEXT.md`「组名别名」条；关键决策见 `docs/adr/0002`。

## 1. 背景与问题

### 1.1 用户诉求

> 现在车型组名，这个在哪里改啊？给新界面补组重命名入口。

### 1.2 现状缺口（实测）

| 能力 | 现状 |
|---|---|
| 组重命名逻辑 | ✅ 存在：`DataSourcePanel.tsx:783` `handleGroupRenameConfirm`（写 `meta.groupName` 到组内每个文件） |
| 组重命名 UI | ✅ 存在，但只在**旧界面** `DataSourcePanel` / `AssetGroupedView`（组头 hover 编辑按钮） |
| 当前界面入口 | ❌ **不存在**。`ParameterWorkbench.tsx:31` 只挂载 `AssetPoolLayout`；`AssetPoolLayout` 内零处 `groupRename`；`AssetPoolHeader`/`AssetGroupHeader` 均无重命名入口 |

**结论**：功能齐全，只是新版资产池界面漏了入口——用户当前**无法**改任何车型组的显示名。

## 2. 目标

- 在资产池（`AssetPoolLayout`）的**车型维度组头**补组重命名入口。
- 行为与旧界面一致：写 `_asset_meta.json` 的 `groupName`，**不改文件名**、**不改资产 JSON**。
- 与既有组显示名/归组语义完全一致（同名组自动合并，仍走 `resolveVehicleGroupKey`）。

## 3. 与资产别名（2026-10-13）的分层关系

两个「名字」是**不同层级**，本设计只碰组级（见 `2026-10-13-asset-alias-design.md` §6.2）：

| 层级 | 字段 | 作用域 | 入口 |
|---|---|---|---|
| **组名**（本设计） | `meta.groupName` | 组头；**参与归组**（同名自动合并） | 组头 hover「重命名」按钮 |
| **资产别名** | `meta.alias` | 单张卡；**不参与归组** | 卡片右键「设置别名…」/ 检查器 |

两条链刻意分离，互不交叉（2026-10-14 已因交叉踩过一次坑）。

## 4. 方案

### 4.1 入口

车型维度组头（`AssetGroupHeader`，`vehicleGroup` 存在时）hover 渐显一个「重命名」图标，与既有「⚡ 激活组内最新版」并排。点击 → 复用旧界面的 Modal（标题「重命名车型」，输入「分组显示名」，okText「保存显示名」）。

### 4.2 落盘

照搬 `DataSourcePanel.handleGroupRenameConfirm`：

```ts
const next = { ...meta };
group.files.forEach(f => { next[f.info.fileName] = { ...next[f.info.fileName], groupName: newKey }; });
await saveAssetMeta(libraryPath, next);
```

- `newKey = sanitizeGroupName(输入)`（trim + 折叠空白）；空则拒绝。
- 组名取**未筛选的全量组**（`governanceReport.groups`，体检报告口径）确定作用范围，避免筛选态漏写。
- 保存后 `bumpAssetVersion()` 触发重扫。

### 4.3 合并提示

新显示名规范化（`normalizeGroupKey`）后若与既有组同键 → 保存后两组自动合并，提示「并入组 X（合并后共 N 个文件，文件名保持不变）」，并提示合并组内多辆车版本链相互独立。

## 5. 影响范围

| 文件 | 改动 |
|---|---|
| `AssetGroupHeader.tsx` | 新增 `onRenameGroup` prop + hover 按钮 |
| `AssetGroupTree.tsx` | 透传 `onRenameGroup` |
| `AssetPoolLayout.tsx` | 组重命名 state + 确认处理 + 合并提示 + Modal |

## 6. 验证标准

- [x] 车型维度组头 hover 出现「重命名」按钮；非车型维度（主机厂/族群/…）无。
- [x] 改名后组头显示新名，文件名与资产 JSON 不变。
- [x] 改成与既有组同名 → 提示合并，两组归为一组。
- [x] 清空/空输入被拒。
- [x] 筛选态下改名仍作用于全量组（不漏写）。

## 7. 不采用的方案

- **把组重命名也做成资产级别名的特例**：二者层级与归组语义不同（别名不参与归组），合并会重演 2026-10-14 的「组名盖住所有卡片名」故障。
- **改文件名来改组名**：ADR-0002 已宣布文件名与显示名解耦，重命名组永不改文件名。
