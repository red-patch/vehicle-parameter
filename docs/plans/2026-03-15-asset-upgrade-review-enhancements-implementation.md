# Asset Upgrade Review Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add final-merge preview and PDF review export to the asset-upgrade flow.

**Architecture:** Reuse the existing upgrade draft as the single source of truth. Add a pure preview builder in the upgrade utility layer, then consume it in the modal for on-screen preview and export the same result as a PDF review document.

**Tech Stack:** React 19, TypeScript, Ant Design 6, Vitest, html2canvas, jsPDF.

---

### Task 1: Add Preview Builder Tests

**Files:**
- Modify: `src/utils/__tests__/assetUpgrade.test.ts`

**Step 1: Write failing tests**

Add tests for:

1. `buildAssetUpgradePreview` returns correct summary counts
2. detail rows exclude `same`
3. pending conflicts remain visible and use old value as final preview value

**Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/__tests__/assetUpgrade.test.ts`
Expected: FAIL because preview helper is missing.

### Task 2: Implement Preview Builder

**Files:**
- Modify: `src/utils/assetUpgrade.ts`

**Step 1: Add helper**

Add:

```ts
export const buildAssetUpgradePreview = (draft: AssetUpgradeDraft) => { ... }
```

The helper must:

1. derive final value using existing merge semantics
2. count decision and category summary values
3. exclude `same` rows from preview details

**Step 2: Run test to verify it passes**

Run: `npm test -- src/utils/__tests__/assetUpgrade.test.ts`
Expected: PASS

### Task 3: Add PDF Export Helper

**Files:**
- Create: `src/utils/assetUpgradeReport.ts`

**Step 1: Implement export helper**

Add:

```ts
export const exportAssetUpgradeReviewPdf = async (...) => { ... }
```

Behavior:

1. build a temporary review DOM
2. render with `html2canvas`
3. export with `jsPDF`
4. include summary and pending warning

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

### Task 4: Add Preview UI and Export Action

**Files:**
- Modify: `src/components/AssetLibrary/AssetUpgradeModal.tsx`

**Step 1: Render preview**

Add:

1. preview summary cards
2. expandable detail panel
3. export button in save area

**Step 2: Wire export**

Hook the PDF export button to the helper and show success/failure messages.

**Step 3: Run build**

Run: `npm run build`
Expected: PASS

### Task 5: Update Docs and Verify

**Files:**
- Modify: `docs/User_Manual.md`
- Modify: `docs/User_Manual_Lite.md`

**Step 1: Document preview/export behavior**

Document:

1. save-before-preview
2. pending conflict export warning
3. PDF review export entry

**Step 2: Run full verification**

Run:

```bash
npm test
npm run build
```

Expected: PASS
