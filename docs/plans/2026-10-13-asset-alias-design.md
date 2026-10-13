# 资产别名（Asset Alias）— 设计方案

> 日期：2026-10-13 ｜ 状态：已实施
> 前置文档：`docs/adr/0002-asset-identity-and-update-semantics.md`（身份键与永不静默覆盖）、`docs/adr/0003-primary-asset-retired-for-per-car-latest.md`（每车最新版）、`2026-03-17-vehicle-display-label-design.md`（显示命名简化）、`2026-03-15-asset-card-unified-identity-design.md`（统一实例键）
> 领域术语见 `CONTEXT.md`（见「组名别名」条），关键决策见 `docs/adr/0002`。

## 1. 背景与问题

### 1.1 用户诉求

> 现在的资产名称有些太长了，最好能支持设置别名。因为现在很多导入的资产数据是按照系统的，所以特别长。

导入自系统的资产 `productName` 形如
`V8E 宁德时代新能源科技股份有限公司 50.23 DNC5037XXYBEVGR5 Ⅱ (ZR202509280007)`。
用户在对比表头、资产卡片、购物车、下拉里看到的都是这个长串，被 `truncate` 截断后既读不出关键信息（电量/公告号），同组的 V8E 多列也彼此无法区分。

### 1.2 现状缺口（实测）

| 能力 | 现状 |
|---|---|
| 资产显示名 | `getAssetDisplayName(fileName, productName)` = `productName \|\| 文件名去后缀`（`assetNaming.ts:5`） |
| 车型组显示名覆盖 | ✅ 已实现：`meta.groupName`，**参与归组**（同名组自动合并，`assetGovernance.ts:105`） |
| 资产**实例级**别名 | ❌ 不存在。`AssetFileFormat` 无别名字段；`AssetGovernanceMeta.note` 已声明但无 UI 读写 |
| 批量打标/改受控属性 | ✅ `AssetBatchTagBar` / `AssetBatchFacetEditor` |

**关键事实**：`CONTEXT.md` 的「组名别名 (Group Alias)」条目指的是**组级**覆盖，已实现；本设计补的是**资产实例级**别名，二者是不同层级（见 §4）。

## 2. 目标

- 每个资产可设一个**人工别名**，全站显示名优先用它。
- 别名为**显示层覆盖**：不改文件名、不改资产 JSON 本体、不参与身份键、不参与归组。
- 别名**参与搜索**（别名命中 + 原名命中双通）。
- 存量超长资产可**批量建议 + 人工确认**一次性设置。
- 别名在**版本演进（re-import 产生新文件）时自动继承**，不必重设。

## 3. 非目标

- 不改文件命名规范（`{车型}-{年款}-{电池厂商}kWh-{类型}-{公告号}`，`assetNaming.ts:18`）。
- 不改「重命名资产」行为（仍改文件名 + JSON 内 `productName`）。
- 不引入 `customName`（`FileManager.tsx:546`，那是**导入前**的文件名，与本功能无关）。

## 4. 决定记录

| # | 决定 | 理由 |
|---|---|---|
| D1 | 别名挂在**资产实例级**（每个 `fileName` 一个） | 用户截图中同组三列 V8E 靠 电量/公告号 区分，组级别名无法区分它们 |
| D2 | **手动为准**，编辑框预填**派生建议**（车型组+电量） | 纯自动缩短会静默损坏边界情况；预填降低手工成本 |
| D3 | 别名是**显示层只读覆盖**，不动文件名与 JSON | ADR-0002 已宣布文件名与身份解耦，别名触文件会重新耦合 |
| D4 | **全面接管 displayName**，原名保留在 tooltip + 检查器显式行 | 单一真相来源，避免「哪个名字是哪个」的困惑 |
| D5 | **不进身份键、不进归组**；**进搜索** | 身份/归组稳定不因改别名而变；但搜老名字必须仍能找到 |
| D6 | 存量走**一次性批量建议 + 人工勾选** | 逐个手动对上百条长名是苦役；批量直写会污染数据 |
| D7 | 存储键 = `fileName`；读取时**沿身份键版本链继承** | 存储与 `groupName`/`status` 一致（零迁移）；继承补齐 `fileName` 键在版本跃迁时会丢失别名的缺陷 |
| D8 | **不硬性唯一**，同上下文重名复用现有 `（N）` 编号软提示 | 三列 V8E 合法地靠公告号区分；用户想要同名应警告而非阻断 |
| D9 | 右键「设置别名…」+ 检查器可编辑，与「重命名资产」文案区分 | 保留文件重命名能力（ADR-0002 仍需），并说清两者差别 |
| D10 | 实例别名 > 组名 > 派生名，**只在对应层级生效** | 强制统一会逼组级重命名去改一堆实例 |
| D11 | 短名从**已解析受控属性**拼（车型组+电量），非正则啃长名 | 长名分隔符/字段顺序不保证一致 |
| D12 | 导出与手机端**都用别名**；导出**复用现有 `车型 N` + legend 机制** | `reportExport.ts:161` `VEHICLE_LABEL_MAX=14` 已发明「短标签 + 原名图例」，不另造约定 |
| D13 | **两态**，清空 = 未设置 → 回落 继承 → 组名 → 派生名 | 「没设」与「设成空」的区分会让继承链多出用户不可见的分支 |
| D14 | 批量建议中解析不出的资产**列出、建议列空、标黄、默认不勾** | 静默跳过会让人误以为「全处理了」；截断兜底会写入没人认可的名字 |

## 5. 三个硬约束（不可动摇）

1. **别名永不进 React key、永不进比较、永不进身份键。**
   当前 `productName` 是 `MultiVehicleView.tsx:158` 的 Map 键、`vehicleStore.ts:236` 的异源去重依据、无公告号时的身份键成分（`assetGovernance.ts:182`）。别名若污染这三处会**静默改变行为**。别名只出现在渲染文本里。
2. **与 `groupName` 的语义分界必须显性。**
   `groupName` **参与归组**（同名自动合并）；`alias` **不参与**。两者共处 `_asset_meta.json` 但语义正交。
3. **`customName` 不是本功能。** 它是导入前的文件名，不让两者合并。

## 6. 存储与解析

### 6.1 存储

`_asset_meta.json` 的 `AssetGovernanceMeta` 新增字段：

```ts
export interface AssetGovernanceMeta {
    status?: 'superseded' | 'deprecated';
    groupName?: string;   // 组级：参与归组
    alias?: string;       // 实例级：仅显示，不参与归组/身份（本设计新增）
    note?: string;
}
```

- 键 = `fileName`，与既有 `status`/`groupName`/`note` 同处、同键。
- 文件重命名经既有 `syncMetaOnRename`（`assetManager.ts:461`）自动迁移，别名一并跟随。

### 6.2 解析顺序

```
alias(自身) → alias(同身份键最新版) → groupName → getAssetDisplayName(info)
```

- **继承**（D7）：自身无别名时，沿身份键找到同一辆车的其他版本，取其中**最新版**的别名。
- 继承是**读取时**解析，不落盘——版本跃迁后新文件自动显示旧别名，用户设新别名则覆盖。

### 6.3 单一显示入口

新增 `resolveAssetDisplayName(info, ctx)`（`src/utils/assetAlias.ts`），作为全站唯一显示名来源，各组件替换直接调用 `getAssetDisplayName` 的位置。

## 7. 影响范围

| 层 | 落点 |
|---|---|
| 纯逻辑 | 新增 `src/utils/assetAlias.ts`（解析/建议/继承，全纯函数） |
| 存储 | `assetManager.ts` `AssetGovernanceMeta` + 别名读写（复用 `loadAssetMeta`/`saveAssetMeta`） |
| 显示 | `AssetCard`、`AssetSummaryCard`、`AssetGroupedView`、`DataSourcePanel`、`AssetInspector`、`VehicleListPanel`、`CompareView` 表头 |
| 交互 | 右键「设置别名…」（`useAssetActions`）+ 检查器可编辑 + 批量建议弹窗 |
| 导出 | 复用 `reportExport.ts` 的 `车型 N` + legend |
| 测试 | `src/utils/__tests__/assetAlias.test.ts` |

## 8. 验证标准

- [ ] 设别名后卡片/表头/下拉/购物车显示别名，tooltip 与检查器可见原名。
- [ ] 清空别名回落到 组名 / 派生名。
- [ ] 搜索框输入别名或原名都能命中。
- [ ] 改别名不改变 `deriveCarIdentityKey` 结果、不改变归组、不改变异源去重结果（回归测试）。
- [ ] re-import 产生新版本文件后，新文件显示继承来的别名。
- [ ] 批量建议：解析不出的资产列出、标黄、默认不勾选。
- [ ] 导出报告仍走 `车型 N` + legend，长名不炸表头。

## 9. 不采用的方案

- **别名直接改文件名/JSON**（等于重命名）：ADR-0002 已解耦文件名与身份，重新耦合会牵连标签/元数据键。
- **别名硬性唯一**：三列 V8E 合法地靠公告号区分，硬唯一会把正常数据判成冲突。
- **纯自动缩短**：长名字段不保证，会静默产生错误短名。
- **合并 `alias` 与 `groupName`**：二者层级与归组语义不同，合并会逼组级重命名批量改实例。
