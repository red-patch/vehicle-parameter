# Data Pool Resizable Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a persisted resizable layout for the data-pool page and refresh asset-library readability.

**Architecture:** Introduce a small pure layout helper for defaults and clamping, persist two data-pool layout values in Zustand, and wire drag handles in the existing page shell and left panel. Keep the typography update inside the asset-library panel.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Tailwind utility classes.

---

### Task 1: Add Layout Helper Tests

**Files:**
- Create: `src/utils/__tests__/poolLayout.test.ts`
- Create: `src/utils/poolLayout.ts`

**Step 1: Write failing tests**

Test:

1. default sidebar width is wider than current legacy layout
2. sidebar width is clamped to min/max
3. workspace height is clamped to min/max

**Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/__tests__/poolLayout.test.ts`
Expected: FAIL because helper is missing.

### Task 2: Implement Layout Helper

**Files:**
- Create: `src/utils/poolLayout.ts`

**Step 1: Add defaults and clamp helpers**

Add:

1. `DEFAULT_POOL_SIDEBAR_WIDTH`
2. `DEFAULT_POOL_WORKSPACE_HEIGHT`
3. `clampPoolSidebarWidth`
4. `clampPoolWorkspaceHeight`

**Step 2: Run test to verify it passes**

Run: `npm test -- src/utils/__tests__/poolLayout.test.ts`
Expected: PASS

### Task 3: Persist Data-Pool Layout State

**Files:**
- Modify: `src/store/vehicleStore.ts`

**Step 1: Add state**

Add:

1. `poolSidebarWidth`
2. `poolWorkspaceHeight`
3. setters
4. `resetPoolLayout`

Persist these values.

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

### Task 4: Add Main Split Resize

**Files:**
- Modify: `src/components/ParameterWorkbench/ParameterWorkbench.tsx`

**Step 1: Replace static width with persisted width**

Add:

1. container ref
2. drag handle
3. runtime clamping against container width

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

### Task 5: Add Left Internal Split and Typography Refresh

**Files:**
- Modify: `src/components/ParameterWorkbench/DataSourcePanel.tsx`

**Step 1: Add top-bottom split**

Add:

1. container ref
2. drag handle
3. workspace section fixed height from persisted state
4. reset layout button

**Step 2: Refresh asset-library readability**

Adjust:

1. asset title size
2. secondary text size
3. tag size
4. card padding

**Step 3: Run build**

Run: `npm run build`
Expected: PASS

### Task 6: Update Docs and Verify

**Files:**
- Modify: `docs/User_Manual.md`
- Modify: `docs/User_Manual_Lite.md`

**Step 1: Document resize behavior**

Document:

1. drag-to-resize behavior
2. remembered layout
3. reset layout

**Step 2: Run full verification**

Run:

```bash
npm test
npm run build
```

Expected: PASS
