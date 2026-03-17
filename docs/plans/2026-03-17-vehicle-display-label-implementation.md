# 车型显示命名简化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 统一工作台与后续流程中的车型显示命名，让默认文案只保留车型名，并在重名时自动稳定编号。

**Architecture:** 在 `vehicleInstance` 工具层抽取“完整来源名”和“上下文显示名”两套命名函数。业务组件只负责传入当前上下文中的实例 key 列表，并消费统一的短文案/完整文案，避免各组件各自拼接文件名。

**Tech Stack:** React 19、TypeScript、Zustand、Vitest、Testing Library、Ant Design 6

---

### Task 1: 为稳定编号命名补测试

**Files:**
- Modify: `src/utils/__tests__/vehicleInstance.test.ts`
- Modify: `src/store/__tests__/vehicleSelectors.instance.test.ts`
- Modify: `src/components/ParameterWorkbench/__tests__/VehicleListPanel.instance.test.tsx`

**Step 1: Write the failing test**

写测试验证：
- 两个同名实例在同一上下文中显示为 `车型名（1）`、`车型名（2）`
- 唯一实例只显示 `车型名`
- 工作区卡片标题使用统一短文案，不直接把完整文件名拼在标题中

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/utils/__tests__/vehicleInstance.test.ts src/store/__tests__/vehicleSelectors.instance.test.ts src/components/ParameterWorkbench/__tests__/VehicleListPanel.instance.test.tsx`
Expected: FAIL

**Step 3: Write minimal implementation**

在 `vehicleInstance` 中增加稳定排序和上下文显示名工具，并替换工作区与下拉相关显示逻辑。

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/utils/__tests__/vehicleInstance.test.ts src/store/__tests__/vehicleSelectors.instance.test.ts src/components/ParameterWorkbench/__tests__/VehicleListPanel.instance.test.tsx`
Expected: PASS

### Task 2: 推广到主要显示入口

**Files:**
- Modify: `src/store/vehicleSelectors.ts`
- Modify: `src/components/ParameterWorkbench/ProductSourceSelector.tsx`
- Modify: `src/components/ParameterWorkbench/VehicleListPanel.tsx`
- Modify: `src/components/ParameterWorkbench/CompareView.tsx`
- Modify: `src/components/DataPurify/DataPurifyView.tsx`

**Step 1: Replace display labels**

将默认显示文案切到统一短命名；需要完整来源的地方仍保留 Tooltip/说明文本。

**Step 2: Run focused regression tests**

Run: `npm test -- --run src/store/__tests__/vehicleSelectors.instance.test.ts src/components/ParameterWorkbench/__tests__/ProductSourceSelector.tagLabel.test.tsx src/components/ParameterWorkbench/__tests__/CompareView.assetSync.test.tsx src/components/ParameterWorkbench/__tests__/VehicleListPanel.instance.test.tsx`

**Step 3: Run build verification**

Run: `npm run build`
