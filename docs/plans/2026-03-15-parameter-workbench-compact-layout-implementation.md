# Parameter Workbench Compact Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove redundant header and spacing inside the parameter workbench so more operational content fits on screen.

**Architecture:** Make targeted layout reductions inside existing workbench components. Do not change workflows, only spacing, padding, and empty-state sizing. Add one regression test to keep the old subtitle block from returning.

**Tech Stack:** React 19, TypeScript, Ant Design 6, Vitest, Tailwind utility classes.

---

### Task 1: Add Header Regression Test

**Files:**
- Create: `src/components/ParameterWorkbench/__tests__/ParameterWorkbench.compactHeader.test.tsx`

**Step 1: Write failing test**

Verify:

1. the main title still renders
2. the old English subtitle no longer renders

**Step 2: Run test to verify it fails**

Run: `npm test -- src/components/ParameterWorkbench/__tests__/ParameterWorkbench.compactHeader.test.tsx`
Expected: FAIL before the layout change.

### Task 2: Compact Workbench Shell

**Files:**
- Modify: `src/components/ParameterWorkbench/ParameterWorkbench.tsx`

**Step 1: Remove decorative subtitle block and tighten shell spacing**

**Step 2: Run targeted test**

Run: `npm test -- src/components/ParameterWorkbench/__tests__/ParameterWorkbench.compactHeader.test.tsx`
Expected: PASS

### Task 3: Compact Child Views

**Files:**
- Modify: `src/components/ParameterWorkbench/DataSourcePanel.tsx`
- Modify: `src/components/ParameterWorkbench/VehicleListPanel.tsx`
- Modify: `src/components/ParameterWorkbench/CompareView.tsx`
- Modify: `src/components/ParameterWorkbench/SmartFillView.tsx`
- Modify: `src/components/ParameterWorkbench/MultiVehicleView.tsx`
- Modify: `src/components/DataPurify/DataPurifyView.tsx`

**Step 1: Reduce non-functional spacing**

Adjust:

1. outer gaps
2. top card padding
3. textarea rows where safe
4. empty-state vertical space

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

### Task 4: Update Docs and Verify

**Files:**
- Modify: `docs/User_Manual.md`
- Modify: `docs/User_Manual_Lite.md`

**Step 1: Note the compact layout behavior**

**Step 2: Run full verification**

Run:

```bash
npm test
npm run build
```

Expected: PASS
