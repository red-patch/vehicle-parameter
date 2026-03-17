# 顶部菜单可见性修复 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复顶部导航在窄窗口下挤掉“系统配置”菜单的问题，并保持菜单结构不变。

**Architecture:** 调整 `MainLayout` 头部的横向布局，让标题区允许收缩截断，菜单区拥有独立的横向滚动容器，右侧操作区维持固定紧凑布局。通过导航测试锁定这两个关键布局契约，避免后续回归。

**Tech Stack:** React 19、TypeScript、Ant Design 6、Vitest、Testing Library、Tailwind CSS

---

### Task 1: 为菜单可见性补回归测试

**Files:**
- Modify: `src/components/Layout/__tests__/MainLayout.navigation.test.tsx`
- Test: `src/components/Layout/__tests__/MainLayout.navigation.test.tsx`

**Step 1: Write the failing test**

新增断言，验证顶部标题具备截断类名，且菜单位于独立的可横向滚动容器中。

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/Layout/__tests__/MainLayout.navigation.test.tsx`
Expected: FAIL，因为当前实现没有这些布局契约。

**Step 3: Write minimal implementation**

调整 `MainLayout` 头部布局，补充测试标识与必要的收缩/滚动类名。

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/Layout/__tests__/MainLayout.navigation.test.tsx`
Expected: PASS

### Task 2: 验证整体未被破坏

**Files:**
- Modify: `src/components/Layout/MainLayout.tsx`
- Test: `src/components/Layout/__tests__/MainLayout.navigation.test.tsx`

**Step 1: Run focused test**

Run: `npm test -- --run src/components/Layout/__tests__/MainLayout.navigation.test.tsx`

**Step 2: Run build verification**

Run: `npm run build`

**Step 3: Review diff**

Run: `git diff --stat`
