# Asset Upgrade Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an asset upgrade flow that compares an existing asset with a newly imported manufacturer file, classifies field changes, lets users review decisions, and saves the merged result safely.

**Architecture:** Build a dedicated asset-upgrade pipeline separate from normal import and normal save. Reuse the existing Excel parser and asset persistence layer, but introduce a focused upgrade draft model plus a review UI that handles automatic recommendations and manual conflict resolution.

**Tech Stack:** React 19, TypeScript, Ant Design 6, Zustand, Tauri file APIs, existing Excel parsing pipeline, existing asset JSON format.

---

### Task 1: Add Upgrade Domain Types

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add upgrade types**

Append these types:

```ts
export type UpgradeDecision = 'keep_old' | 'use_new' | 'pending';
export type AssetUpgradeCategory = 'same' | 'new_field' | 'fill_empty' | 'conflict' | 'old_only';

export interface AssetUpgradeItem {
  key: string;
  fieldName: string;
  group: string;
  oldValue: string;
  newValue: string;
  category: AssetUpgradeCategory;
  decision: UpgradeDecision;
  required: boolean;
}

export interface AssetUpgradeDraft {
  assetFileName: string;
  assetProductName: string;
  importedFileName: string;
  items: AssetUpgradeItem[];
  summary: {
    same: number;
    newField: number;
    fillEmpty: number;
    conflict: number;
    oldOnly: number;
  };
}
```

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add asset upgrade domain types"
```

### Task 2: Add Pure Upgrade Generator

**Files:**
- Create: `src/utils/assetUpgrade.ts`
- Create: `src/utils/__tests__/assetUpgrade.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildAssetUpgradeDraft } from '../assetUpgrade';

describe('buildAssetUpgradeDraft', () => {
  it('classifies new fields and conflicts', () => {
    const draft = buildAssetUpgradeDraft(
      { fileName: 'asset.json', rawHeaders: [], data: [
        { id: '1', group: '基础', name: '快充', value: '无', productName: '车型A' },
        { id: '2', group: '基础', name: '轮胎', value: '', productName: '车型A' },
      ]},
      { fileName: 'new.xlsx', rawHeaders: [], data: [
        { id: '3', group: '基础', name: '快充', value: '有', productName: '车型A' },
        { id: '4', group: '基础', name: '轮胎', value: '185/65R15', productName: '车型A' },
        { id: '5', group: '基础', name: '慢充', value: '支持', productName: '车型A' },
      ]}
    );

    expect(draft.summary.conflict).toBe(1);
    expect(draft.summary.fillEmpty).toBe(1);
    expect(draft.summary.newField).toBe(1);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npm run test -- src/utils/__tests__/assetUpgrade.test.ts`
Expected: FAIL because `assetUpgrade.ts` does not exist.

**Step 3: Write minimal implementation**

Create these helpers:

```ts
const normalizeValue = (value: unknown) => String(value ?? '').trim();
const buildFieldKey = (group: string, name: string) => `${group}::${name}`;
```

Main function skeleton:

```ts
export const buildAssetUpgradeDraft = (
  assetData: SheetData,
  importedData: SheetData
): AssetUpgradeDraft => {
  // build maps
  // compare field-by-field
  // assign category and default decision
  // return summary counts
}
```

Default decisions:
- `same` -> `keep_old`
- `new_field` -> `use_new`
- `fill_empty` -> `use_new`
- `conflict` -> `pending`
- `old_only` -> `keep_old`

**Step 4: Run the test to verify it passes**

Run: `npm run test -- src/utils/__tests__/assetUpgrade.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/assetUpgrade.ts src/utils/__tests__/assetUpgrade.test.ts
git commit -m "feat: add asset upgrade draft generator"
```

### Task 3: Add Upgrade Draft Merge Helper

**Files:**
- Modify: `src/utils/assetUpgrade.ts`
- Modify: `src/utils/__tests__/assetUpgrade.test.ts`

**Step 1: Write the failing tests**

```ts
import { applyAssetUpgradeDraft } from '../assetUpgrade';

it('applies selected decisions into merged parameters', () => {
  const merged = applyAssetUpgradeDraft(draft);
  expect(merged.some(p => p.name === '慢充' && p.value === '支持')).toBe(true);
  expect(merged.some(p => p.name === '快充' && p.value === '无')).toBe(true);
});
```

**Step 2: Run tests to verify failure**

Run: `npm run test -- src/utils/__tests__/assetUpgrade.test.ts`
Expected: FAIL because merge helper is missing.

**Step 3: Write minimal implementation**

Add:

```ts
export const applyAssetUpgradeDraft = (draft: AssetUpgradeDraft): VehicleParameter[] => {
  // return merged final parameter array based on decision per item
}
```

Rules:
- `use_new` => final value from new data
- `keep_old` => final value from old data
- `pending` => leave old value in place for safety, but caller should block save before this point

**Step 4: Run tests to verify pass**

Run: `npm run test -- src/utils/__tests__/assetUpgrade.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/assetUpgrade.ts src/utils/__tests__/assetUpgrade.test.ts
git commit -m "feat: add asset upgrade merge helper"
```

### Task 4: Add Upgrade State to Store

**Files:**
- Modify: `src/store/vehicleStore.ts`

**Step 1: Add store fields**

Add:

```ts
assetUpgradeDraft: AssetUpgradeDraft | null;
setAssetUpgradeDraft: (draft: AssetUpgradeDraft | null) => void;
```

Initialize with `null` and add the setter.

Do not persist this state in `partialize`.

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/store/vehicleStore.ts
git commit -m "feat: add asset upgrade draft store state"
```

### Implementation Notes

- In the concrete implementation, each `AssetUpgradeItem` should retain both display values and the original parameter objects (`oldParameter` / `newParameter`).
- Reason: save-time merge must preserve parameter metadata and stable identifiers instead of reconstructing rows from strings only.
- If an active asset is overwritten, the in-memory `assetFiles` cache should be refreshed immediately so analysis modules do not continue reading stale data.

### Task 5: Create Upgrade Import Modal

**Files:**
- Create: `src/components/AssetLibrary/AssetUpgradeModal.tsx`

**Step 1: Build a minimal modal shell**

Props:

```ts
interface AssetUpgradeModalProps {
  open: boolean;
  assetFileName: string | null;
  onClose: () => void;
}
```

Sections to render:
- baseline asset summary
- upload new file button
- review placeholder area
- footer save actions placeholder

**Step 2: Hook upload parsing**

Use `readFileAsWorkbook` + `parseWorkbook` or existing Excel import path to parse the new manufacturer file.

**Step 3: Generate draft after upload**

Use `loadAssetFile` for baseline asset and `buildAssetUpgradeDraft` for diff creation.

**Step 4: Run build**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/AssetLibrary/AssetUpgradeModal.tsx
git commit -m "feat: add asset upgrade modal scaffold"
```

### Task 6: Add Review Table for Upgrade Draft

**Files:**
- Modify: `src/components/AssetLibrary/AssetUpgradeModal.tsx`

**Step 1: Render category filters**

Use segmented options:
- 全部
- 新增字段
- 空值补全
- 冲突字段
- 仅旧资产存在

**Step 2: Render upgrade table**

Columns:
- 分组
- 字段名
- 旧值
- 新值
- 分类
- 决策

Decision column rules:
- non-conflict rows show readonly tag
- conflict rows show `Select` with:
  - 保留旧值
  - 使用新版
  - 稍后处理

**Step 3: Add pending-save guard**

Disable save actions if any `conflict` row still has `decision === 'pending'`.

**Step 4: Run build**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/AssetLibrary/AssetUpgradeModal.tsx
git commit -m "feat: add asset upgrade review table"
```

### Task 7: Add Final Save Options

**Files:**
- Modify: `src/components/AssetLibrary/AssetUpgradeModal.tsx`
- Modify: `src/utils/assetSourceTags.ts`

**Step 1: Add new source tags if needed**

Add:

```ts
upgrade: '资产升级',
vendorUpdate: '厂商更新',
```

Only if we want them shown in the source/tag ecosystem. Keep naming consistent.

**Step 2: Add two save actions**

Buttons:
- `另存为新版本`
- `覆盖原资产`

### Save-as-new
- default suggested name: `${assetProductName}_${YYYYMMDD}_升级版`
- save merged result via `saveAssetFile`
- write tags through `SaveAssetModal` or direct tag persistence

### Overwrite
- show confirmation modal
- reuse original file name
- save merged result via `saveAssetFile`

**Step 3: Use merged result**

Before save, call `applyAssetUpgradeDraft(draft)` and persist that parameter array.

**Step 4: Run build**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/AssetLibrary/AssetUpgradeModal.tsx src/utils/assetSourceTags.ts
git commit -m "feat: add asset upgrade save actions"
```

### Task 8: Add Entry Point in Asset Cards

**Files:**
- Modify: `src/components/ParameterWorkbench/DataSourcePanel.tsx`

**Step 1: Add upgrade action button**

On each asset card action row, add a new icon/button:
- tooltip: `升级导入`

**Step 2: Mount modal in DataSourcePanel**

Add local state:

```ts
const [upgradeTarget, setUpgradeTarget] = useState<string | null>(null)
```

Render:

```tsx
<AssetUpgradeModal
  open={!!upgradeTarget}
  assetFileName={upgradeTarget}
  onClose={() => setUpgradeTarget(null)}
/>
```

**Step 3: Run build**

Run: `npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/ParameterWorkbench/DataSourcePanel.tsx
git commit -m "feat: add asset upgrade entrypoint"
```

### Task 9: Document the Workflow

**Files:**
- Modify: `docs/User_Manual.md`
- Modify: `docs/User_Manual_Lite.md`

**Step 1: Add short workflow docs**

Add a section describing:
- pick baseline asset
- import new manufacturer file
- review categories
- resolve conflicts
- save as new or overwrite

Suggested text:

```md
当厂商提供新版整车文件时，可对已有资产执行“升级导入”。
系统会生成升级清单，将字段分为一致、新增、空值补全、冲突、仅旧资产存在五类。
用户审核后可选择覆盖原资产，或另存为新版本资产。
```

**Step 2: Run final validation**

Run: `npm run test -- src/utils/__tests__/assetUpgrade.test.ts`
Expected: PASS

Run: `npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add docs/User_Manual.md docs/User_Manual_Lite.md
git commit -m "docs: add asset upgrade workflow documentation"
```

### Notes for the Implementer

- Do not attempt semantic/fuzzy merge rules in v1.
- Do not silently overwrite conflicts.
- Keep this flow separate from normal import so users know they are upgrading an existing asset.
- Prefer save-as-new as the safer default.
- If the imported file resolves to multiple products, block the flow with a clear message in v1 rather than guessing.
