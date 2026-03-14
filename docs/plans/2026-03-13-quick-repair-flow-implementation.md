# Quick Repair Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a quick-repair workflow that lets users jump from analysis modules into `数据体检与修复`, auto-focus the target asset field, repair it using the existing editing controls, and optionally return to the original module.

**Architecture:** Reuse the existing `数据体检与修复` page as the only editing surface. Add a small `repairContext` object in `vehicleStore`, wire entry points from the analysis modules, then make the repair page react to that context with a banner, auto-selection, and target-row highlighting.

**Tech Stack:** React 19, TypeScript, Zustand, Ant Design 6, existing workbench tabs and store state.

---

### Task 1: Add Repair Context to Store

**Files:**
- Modify: `src/store/vehicleStore.ts`
- Test: none in this task

**Step 1: Add the new types and store actions**

Add this interface near the top-level store types:

```ts
interface RepairContext {
  productName: string
  fieldName?: string
  sourceModule: 'compare' | 'smart_fill' | 'multi_vehicle'
  reason: 'diff' | 'unmatched' | 'enum_mismatch' | 'empty' | 'manual'
  sourceLabel: string
}
```

Add store fields and actions:

```ts
repairContext: RepairContext | null
setRepairContext: (context: RepairContext | null) => void
clearRepairContext: () => void
```

**Step 2: Wire default values**

In the `persist` initializer block, add:

```ts
repairContext: null,
setRepairContext: (context) => set({ repairContext: context }),
clearRepairContext: () => set({ repairContext: null }),
```

**Step 3: Keep persistence minimal**

Do not add `repairContext` to `partialize`. It should be session-scoped only.

**Step 4: Run build to verify it compiles**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add src/store/vehicleStore.ts
git commit -m "feat: add quick repair context store state"
```

### Task 2: Add Purify Tab Switching from Workbench

**Files:**
- Modify: `src/components/ParameterWorkbench/ParameterWorkbench.tsx`

**Step 1: Add focused repair navigation callback**

Introduce a helper that switches to the repair tab:

```ts
const goPurify = () => setActiveTab('purify')
```

Pass it into the relevant child modules:

```tsx
<CompareView onGoRepair={goPurify} />
<SmartFillView onGoRepair={goPurify} />
<MultiVehicleView onGoRepair={goPurify} />
```

Do not alter compare/fill/multi behavior otherwise.

**Step 2: Update prop types only where needed**

No new business logic in this file beyond tab switching.

**Step 3: Run build to verify it fails for missing props downstream**

Run: `npm run build`
Expected: FAIL in the child modules because the new prop is not handled yet.

**Step 4: Commit after downstream work only**

No commit in this task yet; combine with Task 3 after all prop chains compile.

### Task 3: Add Quick Repair Entry in Version Compare

**Files:**
- Modify: `src/components/ParameterWorkbench/CompareView.tsx`
- Modify: `src/store/vehicleSelectors.ts` only if a helper is needed

**Step 1: Add the new prop**

In `CompareView` props:

```ts
interface CompareViewProps {
  onGoRepair?: () => void
}
```

**Step 2: Add asset-backed detection helper**

Inside the component, build a set of product names that are present in `assetFiles`.

```ts
const assetBackedProducts = useMemo(() => {
  const set = new Set<string>()
  assetFiles.forEach(file => {
    file.data.forEach(param => set.add(param.productName || file.fileName))
  })
  return set
}, [assetFiles])
```

**Step 3: Add quick repair CTA to compare table cells or row actions**

For diff rows, render a small action only when the current product is asset-backed.

Suggested handler:

```ts
const triggerRepair = (productName: string, fieldName: string, reason: 'diff') => {
  useVehicleStore.getState().setRepairContext({
    productName,
    fieldName,
    sourceModule: 'compare',
    reason,
    sourceLabel: '版本对比',
  })
  useVehicleStore.getState().setPurifyProduct(productName)
  onGoRepair?.()
}
```

Use it from the UI in the most direct place where the user sees a mismatch.

**Step 4: Run build**

Run: `npm run build`
Expected: PASS for compare changes, or FAIL only because other modules still need their new props.

**Step 5: Commit after Task 5**

Hold commit until compare + smart fill + multi all compile.

### Task 4: Add Quick Repair Entry in Smart Fill

**Files:**
- Modify: `src/components/ParameterWorkbench/SmartFillView.tsx`
- Modify: `src/components/SmartFiller/MatchResultTable.tsx`

**Step 1: Thread the repair callback down**

Add prop to `SmartFillView`:

```ts
interface SmartFillViewProps {
  onGoRepair?: () => void
}
```

Pass it to `MatchResultTable`.

**Step 2: Add CTA in match result rows**

Only show `快捷修复` when:
- there is a selected source product
- the source product is asset-backed
- the row is an enum mismatch, or an unmatched item, or other obvious repair-worthy case

Suggested trigger:

```ts
const triggerRepair = (fieldName: string, reason: 'unmatched' | 'enum_mismatch') => {
  if (!productName) return
  useVehicleStore.getState().setRepairContext({
    productName,
    fieldName,
    sourceModule: 'smart_fill',
    reason,
    sourceLabel: '智能填报',
  })
  useVehicleStore.getState().setPurifyProduct(productName)
  onGoRepair?.()
}
```

**Step 3: Keep current edit controls unchanged**

Do not remove manual value editing from smart fill. Quick repair is an additional path, not a replacement.

**Step 4: Run build**

Run: `npm run build`
Expected: PASS for this module or fail only because multi-vehicle prop is not added yet.

### Task 5: Add Quick Repair Entry in Multi Vehicle

**Files:**
- Modify: `src/components/ParameterWorkbench/MultiVehicleView.tsx`

**Step 1: Add the new prop**

```ts
interface MultiVehicleViewProps {
  onGoRepair?: () => void
}
```

**Step 2: Mark repairable missing values**

When a field does not resolve for a selected vehicle, and that vehicle is asset-backed, render a `快捷修复` affordance for that cell or row.

Suggested trigger:

```ts
const triggerRepair = (productName: string, fieldName: string) => {
  useVehicleStore.getState().setRepairContext({
    productName,
    fieldName,
    sourceModule: 'multi_vehicle',
    reason: 'empty',
    sourceLabel: '多车型管理',
  })
  useVehicleStore.getState().setPurifyProduct(productName)
  onGoRepair?.()
}
```

**Step 3: Keep export behavior unchanged**

Do not change CSV export schema in this task.

**Step 4: Run build**

Run: `npm run build`
Expected: PASS

**Step 5: Commit compare/fill/multi navigation as one unit**

```bash
git add src/components/ParameterWorkbench/ParameterWorkbench.tsx src/components/ParameterWorkbench/CompareView.tsx src/components/ParameterWorkbench/SmartFillView.tsx src/components/SmartFiller/MatchResultTable.tsx src/components/ParameterWorkbench/MultiVehicleView.tsx
git commit -m "feat: add quick repair entrypoints from analysis modules"
```

### Task 6: Make Data Purify React to Repair Context

**Files:**
- Modify: `src/components/DataPurify/DataPurifyView.tsx`

**Step 1: Read repair context from store**

Extend the selector:

```ts
repairContext: state.repairContext,
clearRepairContext: state.clearRepairContext,
```

**Step 2: Add top repair banner**

Render a banner block when `repairContext` exists:

```tsx
<div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
  <div className="text-sm font-bold text-blue-700">来自{repairContext.sourceLabel}的修复任务</div>
  <div className="text-xs text-slate-500">
    正在修复：{repairContext.productName}{repairContext.fieldName ? ` / ${repairContext.fieldName}` : ''}
  </div>
</div>
```

**Step 3: Auto-focus target field**

If `repairContext.fieldName` exists, derive a filtered or highlighted list:
- keep existing group/value filters working
- add a `targetFieldName` concept and move matching rows to the top
- set `rowClassName` for the target row if using `Table`

Suggested minimal matching rule:

```ts
const isTargetRow = repairContext?.fieldName && record.name === repairContext.fieldName
```

**Step 4: Add return actions**

Add buttons near save controls:
- `保存并留在体检页`
- `保存后返回来源页面`
- `取消本次修复`

Returning can be implemented by mapping modules to tab keys:

```ts
const targetTabMap = {
  compare: 'compare',
  smart_fill: 'fill',
  multi_vehicle: 'multi',
}
```

Reuse the existing parent tab setter through store or prop wiring if available. If not, add a lightweight workbench navigation state in store.

**Step 5: Clear repair context appropriately**

- `取消本次修复` => clear immediately
- `保存后返回来源页面` => clear after successful save
- `保存并留在体检页` => keep the banner until user clears or switches task, if that feels useful; otherwise clear on save for v1 simplicity

**Step 6: Run build**

Run: `npm run build`
Expected: PASS

**Step 7: Commit**

```bash
git add src/components/DataPurify/DataPurifyView.tsx
git commit -m "feat: make data purify consume quick repair context"
```

### Task 7: Add Focused Tests for Quick Repair Context Helpers

**Files:**
- Create: `src/components/ParameterWorkbench/__tests__/quickRepairContext.test.ts`
- Optional Modify: `src/store/vehicleStore.ts` if helper extraction is needed

**Step 1: Write helper-level failing tests**

If you extract a small pure helper like `buildRepairContext`, test it directly:

```ts
import { describe, expect, it } from 'vitest'
import { buildRepairContext } from '../quickRepairContext'

describe('buildRepairContext', () => {
  it('creates compare repair payload', () => {
    expect(buildRepairContext('compare', '车型A', '快充', 'diff')).toEqual({
      productName: '车型A',
      fieldName: '快充',
      sourceModule: 'compare',
      reason: 'diff',
      sourceLabel: '版本对比',
    })
  })
})
```

**Step 2: Run the test to verify it fails**

Run: `npm run test -- src/components/ParameterWorkbench/__tests__/quickRepairContext.test.ts`
Expected: FAIL because helper does not exist.

**Step 3: Add minimal helper implementation**

Only if extracted. Keep it tiny and pure.

**Step 4: Run the test to verify it passes**

Run: `npm run test -- src/components/ParameterWorkbench/__tests__/quickRepairContext.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ParameterWorkbench/__tests__/quickRepairContext.test.ts src/components/ParameterWorkbench/quickRepairContext.ts
git commit -m "test: cover quick repair context mapping"
```

### Task 8: Update Documentation

**Files:**
- Modify: `docs/User_Manual.md`
- Modify: `docs/User_Manual_Lite.md`

**Step 1: Document the workflow**

Add a short section describing:
- quick repair is available from analysis pages for asset-backed data
- clicking it jumps to the repair page with field context
- save and return behavior

Suggested text:

```md
当版本对比、智能填报、多车型管理中发现问题时，若该车型来自资产库，可直接点击“快捷修复”。
系统会自动跳转到“数据体检与修复”并定位到对应车型与字段。
修复后可选择继续停留在体检页，或返回原分析页面。
```

**Step 2: Run final validation**

Run: `npm run build`
Expected: PASS

If helper tests were added, also run:

Run: `npm run test -- src/components/SmartFiller/__tests__/coreFieldRules.test.ts src/components/SmartFiller/__tests__/CoreFieldRuleComposer.test.tsx src/components/SmartFiller/__tests__/ConfigManagerView.core-fields.test.tsx src/components/ParameterWorkbench/__tests__/quickRepairContext.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add docs/User_Manual.md docs/User_Manual_Lite.md
git commit -m "docs: describe quick repair workflow"
```

### Notes for the Implementer

- Keep the first release asset-backed only. Do not fake repair flows for transient workbook rows.
- Do not duplicate repair forms inside compare/fill/multi pages.
- Prefer button labels that are consistent across modules: always use `快捷修复`.
- Do not attempt exact table scroll restoration to the origin page in v1.
- If returning to the source module needs shared tab navigation state, add the minimum state necessary rather than inventing a larger routing layer.
