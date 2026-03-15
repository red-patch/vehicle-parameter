# Workbench Top Nav Flattening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Flatten workbench navigation by promoting the five workbench modules to top-level navigation.

**Architecture:** Keep a shared workbench shell for synchronized state and repair jumps, but remove the nested workbench tab chrome from the top-level user flow. The app shell becomes the primary module switcher.

**Tech Stack:** React 19, TypeScript, Ant Design 6, Zustand, Vitest.

---

### Task 1: Add Navigation Test

**Files:**
- Create: `src/components/Layout/__tests__/MainLayout.navigation.test.tsx`

**Step 1: Write failing test**

Verify the top navigation shows:

1. 数据池
2. 版本对比
3. 智能填报
4. 多车型管理
5. 数据体检与修复
6. 公告号查询
7. 系统配置

And does not show:

1. 参数工作台
2. 属性去重

**Step 2: Run test to verify it fails**

Run: `npm test -- src/components/Layout/__tests__/MainLayout.navigation.test.tsx`
Expected: FAIL before nav refactor.

### Task 2: Flatten Main Navigation

**Files:**
- Modify: `src/components/Layout/MainLayout.tsx`
- Modify: `src/App.tsx`

**Step 1: Promote workbench modules to top-level nav**

**Step 2: Remove attribute-dedup from main nav**

**Step 3: Run targeted test**

Run: `npm test -- src/components/Layout/__tests__/MainLayout.navigation.test.tsx`
Expected: PASS

### Task 3: Preserve Shared Workbench Shell

**Files:**
- Modify: `src/components/ParameterWorkbench/ParameterWorkbench.tsx`

**Step 1: Let workbench render a single active module without nested top tabs when driven by top-level nav**

**Step 2: Keep quick-repair return mapping working**

**Step 3: Run build**

Run: `npm run build`
Expected: PASS

### Task 4: Update Docs and Verify

**Files:**
- Modify: `docs/User_Manual.md`
- Modify: `docs/User_Manual_Lite.md`

**Step 1: Update navigation descriptions**

**Step 2: Run full verification**

Run:

```bash
npm test
npm run build
```

Expected: PASS
