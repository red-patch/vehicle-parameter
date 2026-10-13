# 批量字段维护（参数行 + 受控属性）— 设计方案

> 日期：2026-10-13 ｜ 状态：待实施
> 前置文档：`2026-09-30-asset-facets-lifecycle-design.md`（受控属性分层与批量补录出处）、`2026-10-01-asset-panel-layout-redesign.md`（V1 布局）、`2026-10-13-asset-panel-redesign-v2-design.md`（V2 面板重设计，同分支待实施）
> 领域术语见 `CONTEXT.md`，关键决策见 `docs/adr/0001`（受控属性与标签分层）、`docs/adr/0002`（身份键与永不静默覆盖）、`docs/adr/0003`（每车最新版替代主文件）。

## 1. 背景与问题

### 1.1 用户诉求

> 有时候需要维护字段的正确性，有些车型资产也没有填。我的需求是：找到目标车型对应的相关资产，并更新相关字段。比如 V6e 车型，它有好多个资产数据，更新指定的字段的值。

拆成两个动作：

1. **定位**：给定车型组（如 V6E），拿到它的全部资产文件；
2. **批量改值**：选定一个字段，把若干资产的该字段改成同一个值。

第 2 个动作有两种动机，落点在不同的数据层：
- **补全**：字段为空 → 填上（如某资产没填主机厂）；
- **纠错**：字段写错了 → 覆盖（如"上海大通"应为"上汽大通"）。

### 1.2 现状缺口（实测）

| 能力 | 现状 |
|---|---|
| 定位车型组全部资产 | ✅ `buildGovernanceReport().groups.find(g => g.groupKey === 'V6E')`（`assetGovernance.ts:274`） |
| 多选资产 | ✅ 批量模式 + `selectedFileNames`（`DataSourcePanel.tsx:153`）+ `AssetBatchTagBar` |
| 批量改**受控属性** | ✅ `AssetBatchFacetEditor` → `_facet_values.json`（4 维，`AssetLibrary/AssetBatchFacetEditor.tsx`） |
| 批量改**参数值** | ❌ **不存在**。参数层唯一写入路径 `saveAssetFile()` 只被 DataPurify（单台）和 AssetUpgradeModal（单台）调用 |
| 字段级审计/撤销 | ❌ 不存在（`docs/交互优化设计方案.md` 提到的批量撤销未实现） |

**核心缺口**：没有「按字段名批量改参数值」的 API 或 UI。本方案补上，并把已存在的 facet 批量编辑收敛进同一个面，终结两套批量编辑入口。

### 1.3 已确认的交互裁定（brainstorming 2026-10-13）

- 目标资产**由用户自己勾选**（批量选择模型），预设（仅最新版/仅此字段为空/全选）只做加速，不代替用户决定；
- **先预览再落盘**：确认前必看逐台「当前值 → 新值」和判定，符合 ADR-0002 永不静默覆盖；
- 字段来源**限受控词表**（`getAllAttributeNames()`），不允许任意字段名——避免"整备质量/整车整备质量"造出重复参数行；
- 受控属性 4 维**并入**同一个字段选择器；
- 旧 `AssetBatchFacetEditor` **直接退役删除**。

## 2. 设计目标

1. 一次操作内完成「定位车型组 → 勾选资产 → 选字段 → 填值 → 预览 → 落盘」；
2. 参数层与受控属性层用**同一个字段选择器**，用户不必知道值存在哪；
3. 每一次覆盖都经过人眼确认，逐台标注判定；
4. 逻辑与 UI 分离：判定逻辑为纯函数，独立可测；
5. 新逻辑独立成文件，不往热点文件 `DataSourcePanel.tsx` 堆逻辑。

## 3. 总体架构

### 3.1 两个入口，一个抽屉

| 入口 | 场景 | 初始选择集 |
|---|---|---|
| 批量模式 → 批量栏「批量改字段」按钮 | "我自己勾"：列表里筛选 + 勾选 | `selectedFileNames` |
| 治理体检弹窗 → 车型组「批量字段维护」 | "找 V6E 的相关资产" | 该组全部文件（可用预设收窄） |

两个入口都开同一个 `AssetBatchFieldEditor` 抽屉，差异仅在传入的行集与初始勾选。

### 3.2 抽屉布局

```
┌ 批量字段维护 ────────────────────────────────── [预览并保存(N)] ┐
│ 字段 ▾  [受控属性 ▸ 主机厂 | 电池品牌 | 电量 | 准入等级]         │
│         [参数 ▸ 整备质量、轴距、…（受控词表，可搜索）]            │
│ 新值   [ AutoComplete / InputNumber / 文本 ]                     │
│ 范围   [✓]仅最新版  [ ]仅此字段为空     已勾选 12 / 组内 25      │
├─────────────────────────────────────────────────────────────────┤
│ ☑ 资产（V6E 客运版）      当前值       新值       判定          │
│ ☑ V6E_2024_宁德时代       —（空）      上汽大通    补全          │
│ ☑ V6E_2024_国轩高科       上汽大通     上汽大通    一致（跳过）   │
│ ☑ V6E_2023_宁德时代       上海大通     上汽大通    覆盖 ⚠         │
│ ☐ V6E_2022_…             —           上汽大通    补全（未勾）   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 数据流

```
DataSourcePanel (宿主)
  ├─ 已有：assets / assetMeta / assetTags / facetVocab / facetValues / latestSet
  ├─ 新增 state：fieldEditorOpen、fieldEditorSeed(fileNames|groupKey)
  ├─ buildAssetFieldRows(...)  ← 纯函数，供两个入口复用
  └─ onSave → 分派：
       参数目标 → 逐文件 loadAssetFile → 改 parameters[] → saveAssetFile
       属性目标 → setAssetFacetOverride × N → saveFacetValues（一次写盘）
     二者收尾均 bumpAssetVersion()
```

## 4. 字段目标模型

```ts
/** 字段目标：受控属性维度，或参数层某个受控字段名 */
export type FieldTarget =
  | { layer: 'facet'; dim: FacetDimKey }          // manufacturer | batteryBrand | capacityKwh | admissionLevel
  | { layer: 'param'; name: string; group?: string }; // 参数名（来自受控词表）
```

- **受控属性 4 维**：值域来自 `facetVocab`；`capacityKwh` 为数值型；编辑器内渲染对应的 AutoComplete/InputNumber。
- **参数字段**：候选来自 `getAllAttributeNames()`（`attributeEnums.ts:133`），带分组；值是字符串（`VehicleParameter.value` 允许 `string | number`，编辑面统一按字符串处理并按需回落类型）。

`vehicleFamily`（车型族群）是**组级专属**（`assetFacets.ts:287` 的 `resolveAssetFacets` 里只有 `groupValue.vehicleFamily`，无资产级覆盖），不在本抽屉的资产级批量范围内；维持由「组属性编辑」维护。

## 5. 判定逻辑（纯函数，独立可测）

新文件 `src/utils/assetFieldEdit.ts`，**零 IO**：

```ts
export type FieldEditVerdict = 'fill' | 'overwrite' | 'same' | 'addRow';

export interface FieldEditRow {
  fileName: string;
  productName: string;
  isLatest: boolean;
  currentValue: string | number | null;
  verdict: FieldEditVerdict | null;   // 未填新值时 null
  nextValue: string | number | null;
}

export function readParamField(params: VehicleParameter[], name: string): VehicleParameter | null;
export function buildFieldEditPlan(rows, target: FieldTarget, newValue): FieldEditRow[];
export function applyFieldEdit(params: VehicleParameter[], name: string, value, group?: string): VehicleParameter[];
```

判定规则：

| 判定 | 条件 | 落盘行为 |
|---|---|---|
| `fill` | 当前值为空（`''` / `undefined` / `null`） | 写入 |
| `overwrite` | 当前值非空且 ≠ 新值 | 写入（UI 标红） |
| `same` | 当前值 === 新值 | **跳过**（不写、不计入 diff） |
| `addRow` | 参数层找不到该 `name` | 新增 `VehicleParameter` 行 |

- 匹配参数行用 `name` 精确匹配（与 `assetUpgrade.ts:34` 的 `buildFieldKey` 语义一致）；同名多行时全部更新，并在预览里标注"命中 N 行"。
- `applyFieldEdit` 保留原有行的 `group`/`id`/`rowCheck`，只改 `value` 与 `updatedAt`；`same` 时返回原引用（避免无谓写盘）。
- `updatedAt` 用 **ISO 字符串**（不沿用 DataPurify 的 zh-CN 显示串——`DataPurifyView.tsx:134` 那个不可排序，是既有缺陷，本方案不复制）。

## 6. 落盘

### 6.1 参数层

**先补一个能力**：`SheetData` 目前是 `{ fileName, data, rawHeaders }`，**不携带文件级 `productName` / `createdAt`**——`loadAssetFile` 把它们丢掉了（`assetManager.ts:370`）。而 `saveAssetFile` 需要 `productName`，且要保 `createdAt`（§6.3）。故给 `SheetData` 追加两个可选字段并由 `loadAssetFile` 回填：

```ts
export interface SheetData {
    fileName: string;
    data: VehicleParameter[];
    rawHeaders: string[];
    productName?: string;   // 新增：文件级产品名（params 级 productName 的同源）
    createdAt?: string;     // 新增：文件创建时间（保真用）
}
```

逐文件（无批量参数写入 API）：

```ts
const sheet = await loadAssetFile(libraryPath, fileName);
if (!sheet) { failed.push(fileName); continue; }
const params = applyFieldEdit(sheet.data, target.name, value, target.group);
if (params === sheet.data) continue;               // same，跳过
await saveAssetFile(
  libraryPath, fileName,
  sheet.productName || fileName.replace(/\.json$/i, ''),
  params,
  sheet.createdAt,                                  // 透传旧值保真
);
```

部分失败（某文件读/写失败）时：继续处理其余文件，收尾汇总「成功 N 台 / 失败 M 台」，失败的列出文件名，**不整批回滚**（文件之间本就独立）。

### 6.2 受控属性层

复用现有一次性写盘与就地收词（`DataSourcePanel.tsx:414` `handleSaveFacetOverrides` 的逻辑上提为共用 handler）：

```ts
let vocab = facetVocab, next = facetValues;
for (const fileName of targets) {
  const r = addVocabValue(vocab, dim, value);   // 词表外新值就地收入
  vocab = r.vocab;
  next = setAssetFacetOverride(next, fileName, { [dim]: r.value });
}
await saveFacetVocab(libraryPath, vocab);
await saveFacetValues(libraryPath, next);
```

### 6.3 顺带修两个真 bug（不修会污染数据）

1. `saveAssetFile` 每次保存把 `createdAt` 重置为当前时间（`assetManager.ts:42`），**原创建时间永久丢失**。批量改写会放大。修法：签名追加可选 `createdAt?: string`，编辑器把 `loadAssetFile` 读到的旧值透传回去；未传时维持现状（不改变既有两处调用的行为）。
2. `loadAssetFile` 丢弃文件级 `productName` 与 `createdAt`（只返回 `data`），使「读-改-写」无法保真。修法见 §6.1 的 `SheetData` 扩展；回填不改既有调用者行为（可选字段）。

两处改动配套，缺一则参数层落盘要么改名（`productName` 丢失导致产品名回退成文件名）要么丢创建时间。

## 7. 模块划分

| 文件 | 变更 | 说明 |
|---|---|---|
| `src/utils/assetFieldEdit.ts` | **新建** | `FieldTarget` / `buildFieldEditPlan` / `applyFieldEdit` / `buildAssetFieldRows`，纯函数 |
| `src/components/AssetLibrary/AssetBatchFieldEditor.tsx` | **新建** | 抽屉 UI，结构照 `AssetBatchFacetEditor`（表格 + 勾选 + 批量设值 + 预览判定） |
| `src/components/ParameterWorkbench/AssetBatchTagBar.tsx` | 改 | 新增 `onOpenFieldEditor?` 按钮（约 10 行） |
| `src/components/ParameterWorkbench/DataSourcePanel.tsx` | 改 | 新增 state + 挂载 + 落盘 handler（约 40–60 行，仅接线，逻辑在纯函数里） |
| `src/utils/assetManager.ts` | 改 | `saveAssetFile` 保 `createdAt`；`loadAssetFile` 回填 `productName`/`createdAt` |
| `src/types/index.ts` | 改 | `SheetData` +`productName?` +`createdAt?`（可选，向后兼容） |
| `src/components/AssetLibrary/AssetBatchFacetEditor.tsx` | **删除** | 能力被新抽屉覆盖 |
| `GovernanceReportModal` 的「批量补录」入口 | 改 | 改指新抽屉 |
| `docs/交互优化设计方案.md` | 改（可选） | 移除已实现项，或标注 |

> 保留 `GroupFacetEditor.tsx`（组级属性编辑）不动——那是组级，与本抽屉的资产级语义不同。

## 8. 测试

| 测试 | 覆盖 |
|---|---|
| `src/utils/__tests__/assetFieldEdit.test.ts` | 判定全覆盖：补全/覆盖/一致/新增行/清空值/字段不存在/同名多行；`applyFieldEdit` 保留 id+group |
| `src/components/AssetLibrary/__tests__/AssetBatchFieldEditor.test.tsx` | 行渲染、填写新值后判定更新、无改动/无值时保存禁用、批量设值 |
| `src/utils/__tests__/assetManager.cache.test.ts` 增补 | **回退测试**：保存到已存在文件后断言 `createdAt` 不变——旧代码上必须真挂 |
| `src/utils/__tests__/assetManager.test.ts`（或增补） | `loadAssetFile` 回填 `productName`/`createdAt`（读-改-写保真链路） |

验证命令（改了逻辑/落盘，四条全跑）：`npm run lint` + `npm run typecheck` + `npm run test` + `npm run build`。

## 9. 明确不做（Scope Out）

- ❌ **字段级审计/撤销链**：本期以"预览即确认"保证可预期；撤销是独立功能（`docs/交互优化设计方案.md` 曾规划，未实现）；
- ❌ **任意字段名**：限受控词表；
- ❌ **跨车型组批量**：一次只服务一个组或一份勾选集；
- ❌ **改文件名/身份键**：字段维护只碰值；
- ❌ **组级属性（车型族群）的资产级批量**：维持组属性编辑。

## 10. 风险

| 风险 | 缓解 |
|---|---|
| 覆盖行误改 | 预览逐台标红 `覆盖 ⚠`，未勾选行不落盘，保存按钮显式 `预览并保存(N)` |
| `saveAssetFile` 整文件覆盖丢字段 | `loadAssetFile` 原样读回、只改目标行；`parameters` 里未知字段随 JSON 保留 |
| 热点文件膨胀 | 逻辑全在 `assetFieldEdit.ts`，`DataSourcePanel.tsx` 只新增接线 |
| 并行会话同改 `DataSourcePanel.tsx` | 动手前重读现状（AGENTS.md 执行纪律）；改动小且集中在批量栏附近 |
