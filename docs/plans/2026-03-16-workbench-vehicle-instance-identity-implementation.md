# 工作台车型实例身份修复 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让工作台对同名但不同文件来源的车型按独立实例管理，避免列表显示和数据读取被错误合并。

**Architecture:** 在工作台内部引入统一的实例键 `source::fileName::productName`。store、selector、列表组件都按实例键流转，显示层继续展示原始车型名。通过最小侵入方式修复核心路径，先覆盖 Excel 工作台，再兼容资产来源。

**Tech Stack:** React 19、TypeScript、Zustand、Vitest、Testing Library

---

### Task 1: 建立实例键工具与失败测试

**Files:**
- Create: `src/utils/vehicleInstance.ts`
- Create: `src/utils/__tests__/vehicleInstance.test.ts`
- Test: `src/utils/__tests__/vehicleInstance.test.ts`

**Step 1: Write the failing test**

写测试覆盖实例键生成与同名车型跨文件不冲突。

**Step 2: Run test to verify it fails**

Run: `npm test -- src/utils/__tests__/vehicleInstance.test.ts`
Expected: FAIL，因为实例键工具尚不存在。

**Step 3: Write minimal implementation**

实现实例键生成、解析与从参数/文件派生实例键的工具函数。

**Step 4: Run test to verify it passes**

Run: `npm test -- src/utils/__tests__/vehicleInstance.test.ts`
Expected: PASS

### Task 2: 修复 selector 层索引冲突

**Files:**
- Modify: `src/store/vehicleSelectors.ts`
- Modify: `src/types/index.ts`
- Create: `src/store/__tests__/vehicleSelectors.instance.test.ts`
- Test: `src/store/__tests__/vehicleSelectors.instance.test.ts`

**Step 1: Write the failing test**

写测试证明两个文件同名车型在 `getProductData` 中不能再合并。

**Step 2: Run test to verify it fails**

Run: `npm test -- src/store/__tests__/vehicleSelectors.instance.test.ts`
Expected: FAIL，当前索引只按 `productName` 建桶。

**Step 3: Write minimal implementation**

让 `vehicleSelectors` 按实例键建索引并返回实例级参数。

**Step 4: Run test to verify it passes**

Run: `npm test -- src/store/__tests__/vehicleSelectors.instance.test.ts`
Expected: PASS

### Task 3: 修复工作台与车型选择展示

**Files:**
- Modify: `src/components/ParameterWorkbench/VehicleListPanel.tsx`
- Modify: `src/components/ParameterWorkbench/ProductSelector.tsx`
- Modify: `src/components/ParameterWorkbench/ProductSourceSelector.tsx`

**Step 1: Write the failing test**

补测试验证同名车型来自不同文件时会显示为两项。

**Step 2: Run test to verify it fails**

Run: `npm test -- src/components/ParameterWorkbench`
Expected: FAIL，当前列表会被合并。

**Step 3: Write minimal implementation**

组件中统一以实例键作为 `value/key/selected state`，显示名保留车型名并补充文件名说明。

**Step 4: Run test to verify it passes**

Run: `npm test -- src/components/ParameterWorkbench`
Expected: PASS

### Task 4: 修复 store 选择链路与回归验证

**Files:**
- Modify: `src/store/vehicleStore.ts`
- Modify: `src/components/ParameterWorkbench/CompareView.tsx`
- Modify: `src/components/DataPurify/DataPurifyView.tsx`
- Modify: `src/components/ParameterWorkbench/SmartFillView.tsx`

**Step 1: Write the failing test**

补最小状态测试，验证选择链路不会因纯车型名冲突而串选。

**Step 2: Run test to verify it fails**

Run: `npm test -- src/store`
Expected: FAIL

**Step 3: Write minimal implementation**

让 store 中的选中项、当前对比项、当前净化项、当前参考项都按实例键流转。

**Step 4: Run test to verify it passes**

Run: `npm test -- src/store`
Expected: PASS

### Task 5: 完整验证

**Files:**
- Modify: `src/components/ParameterWorkbench/VehicleListPanel.tsx`
- Modify: `src/components/ParameterWorkbench/ProductSelector.tsx`
- Modify: `src/store/vehicleSelectors.ts`
- Modify: `src/store/vehicleStore.ts`

**Step 1: Run focused tests**

Run: `npm test -- src/utils/__tests__/vehicleInstance.test.ts src/store/__tests__/vehicleSelectors.instance.test.ts`

**Step 2: Run affected UI/store tests**

Run: `npm test -- src/components/ParameterWorkbench src/store`

**Step 3: Run broader regression checks**

Run: `npm test`

**Step 4: Review diff**

Run: `git diff --stat`
