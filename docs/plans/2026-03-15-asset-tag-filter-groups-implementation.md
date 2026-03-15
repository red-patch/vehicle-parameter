# Asset Tag Filter Groups Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate mutually exclusive asset tags into explicit filter groups for better filtering UX.

**Architecture:** Add a small pure utility that classifies tags into `车型族群`, `厂商`, and `其他标签`, plus a pure filter helper for applying grouped selections. Then refactor the asset-library filter area to render and use those groups.

**Tech Stack:** React 19, TypeScript, Vitest, Zustand-backed component state.

---

### Task 1: Add Filter Group Tests

**Files:**
- Create: `src/utils/__tests__/assetTagFilters.test.ts`
- Create: `src/utils/assetTagFilters.ts`

**Step 1: Write failing tests**

Test:

1. classify tags into vehicle family / manufacturer / other
2. filter assets using single-select family + single-select manufacturer + other-tag intersection

**Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/__tests__/assetTagFilters.test.ts`
Expected: FAIL because helper is missing.

### Task 2: Implement Filter Group Helper

**Files:**
- Create: `src/utils/assetTagFilters.ts`

**Step 1: Add group rules and helper functions**

Add:

1. in-code mutual exclusion lists for `车型族群` and `厂商`
2. tag classification helper
3. asset filtering helper

**Step 2: Run test to verify it passes**

Run: `npm test -- src/utils/__tests__/assetTagFilters.test.ts`
Expected: PASS

### Task 3: Refactor DataSourcePanel Filter State and UI

**Files:**
- Modify: `src/components/ParameterWorkbench/DataSourcePanel.tsx`

**Step 1: Replace generic tag filter state**

Add:

1. `selectedVehicleFamilyTag`
2. `selectedManufacturerTag`
3. `selectedOtherFilterTags`

**Step 2: Render grouped filter sections**

Render:

1. source
2. vehicle family
3. manufacturer
4. other tags

**Step 3: Apply grouped filter helper**

Keep keyword filtering as the last layer.

**Step 4: Run build**

Run: `npm run build`
Expected: PASS

### Task 4: Update Docs and Verify

**Files:**
- Modify: `docs/User_Manual.md`
- Modify: `docs/User_Manual_Lite.md`

**Step 1: Document grouped filter behavior**

**Step 2: Run full verification**

Run:

```bash
npm test
npm run build
```

Expected: PASS
