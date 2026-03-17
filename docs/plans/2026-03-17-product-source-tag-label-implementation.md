# 车型选择标签文案优化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 优化车型选择器已选标签文案，避免把完整文件名直接塞进标签正文，同时保留同名实例的区分能力。

**Architecture:** 保持下拉选项仍使用 `车型名 · 文件名` 作为完整选择文案，只调整 `ProductSourceSelector` 已选标签区域的展示逻辑。新增一条回归测试锁定“同名实例显示短序号，不直接显示完整文件名”的行为。

**Tech Stack:** React 19、TypeScript、Ant Design 6、Vitest、Testing Library

---

### Task 1: 为已选标签短文案补回归测试

**Files:**
- Create: `src/components/ParameterWorkbench/__tests__/ProductSourceSelector.tagLabel.test.tsx`
- Test: `src/components/ParameterWorkbench/__tests__/ProductSourceSelector.tagLabel.test.tsx`

**Step 1: Write the failing test**

写测试验证：当两个同名车型实例同时被选中时，已选标签显示 `车型名（1）`、`车型名（2）`，且页面正文不直接出现完整文件名。

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/ParameterWorkbench/__tests__/ProductSourceSelector.tagLabel.test.tsx`
Expected: FAIL，因为当前实现直接展示 `车型名 · 文件名`。

**Step 3: Write minimal implementation**

在 `ProductSourceSelector` 中为已选值计算短标签文案，并通过 Tooltip 保留完整来源文案。

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/ParameterWorkbench/__tests__/ProductSourceSelector.tagLabel.test.tsx`
Expected: PASS

### Task 2: 验证整体未被破坏

**Files:**
- Modify: `src/components/ParameterWorkbench/ProductSourceSelector.tsx`
- Test: `src/components/ParameterWorkbench/__tests__/ProductSourceSelector.tagLabel.test.tsx`

**Step 1: Run focused test**

Run: `npm test -- --run src/components/ParameterWorkbench/__tests__/ProductSourceSelector.tagLabel.test.tsx`

**Step 2: Review diff**

Run: `git diff --stat`
