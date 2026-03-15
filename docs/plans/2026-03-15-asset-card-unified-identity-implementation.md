# Asset Card Unified Identity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify asset file rename and product rename into one action and flatten asset cards.

**Architecture:** Add a small pure naming helper for asset display/base-name logic, then use a single asset-identity rename path in the asset manager and simplify the card layout in the data source panel.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Tauri fs APIs.

---

### Task 1: Add Asset Naming Helper Tests

**Files:**
- Create: `src/utils/__tests__/assetNaming.test.ts`
- Create: `src/utils/assetNaming.ts`

**Step 1: Write failing tests**

Test:

1. strip `.json` suffix for display
2. prefer product name when present
3. normalize rename input to a base name

**Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/__tests__/assetNaming.test.ts`
Expected: FAIL because helper is missing.

### Task 2: Implement Asset Naming Helper

**Files:**
- Create: `src/utils/assetNaming.ts`

**Step 1: Add helper functions**

Add:

1. `getAssetBaseName`
2. `getAssetDisplayName`
3. `toAssetFileName`

**Step 2: Run test to verify it passes**

Run: `npm test -- src/utils/__tests__/assetNaming.test.ts`
Expected: PASS

### Task 3: Add Unified Rename Operation

**Files:**
- Modify: `src/utils/assetManager.ts`

**Step 1: Add rename helper**

Add a single operation that:

1. renames the file to `baseName.json`
2. rewrites `productName` to `baseName`
3. rewrites parameter product names
4. keeps tags in sync

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

### Task 4: Simplify Asset Card UI

**Files:**
- Modify: `src/components/ParameterWorkbench/DataSourcePanel.tsx`

**Step 1: Remove duplicate rename action and duplicate name line**

Adjust:

1. single rename action
2. flatter card layout
3. display title without `.json`

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

### Task 5: Update Docs and Verify

**Files:**
- Modify: `docs/User_Manual.md`
- Modify: `docs/User_Manual_Lite.md`

**Step 1: Document unified rename behavior**

**Step 2: Run full verification**

Run:

```bash
npm test
npm run build
```

Expected: PASS
