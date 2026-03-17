# 待分析车型同步架构收口 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 Compare、SmartFill、DataPurify、MultiVehicle 四个模块只继承待分析车型工作集，并统一处理资产数据同步中的中间态。

**Architecture:** 用 `selectedProductNames` 作为 4 个模块唯一候选来源，拆分 Compare/MultiVehicle 的局部选择状态，新增统一的实例数据状态工具用于判断 `ready/pending/missing`。同时把资产面板中残留的纯车型名判断迁回实例键语义。

**Tech Stack:** React 19、TypeScript、Zustand、Vitest、Testing Library、Ant Design 6

---

### Task 1: 为状态边界补失败测试

**Files:**
- Modify: `src/store/__tests__/vehicleStore.instance-selection.test.ts`
- Create: `src/utils/__tests__/vehicleSelectionState.test.ts`
- Test: `src/store/__tests__/vehicleStore.instance-selection.test.ts`
- Test: `src/utils/__tests__/vehicleSelectionState.test.ts`

**Step 1: Write the failing test**

写测试验证：
- Compare 与 MultiVehicle 的局部选择互不串状态
- `selectedProductNames` 变化时会同时剪枝两个模块的局部选择
- 已选资产实例在 `assetFiles` 未同步时会被判定为 `pending`

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/store/__tests__/vehicleStore.instance-selection.test.ts src/utils/__tests__/vehicleSelectionState.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

在 store 中新增 `currentMultiVehicleProducts` 与 `setMultiVehicleProducts`，并实现统一的实例同步状态工具。

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/store/__tests__/vehicleStore.instance-selection.test.ts src/utils/__tests__/vehicleSelectionState.test.ts`
Expected: PASS

### Task 2: 收口下游模块

**Files:**
- Modify: `src/components/ParameterWorkbench/DataSourcePanel.tsx`
- Modify: `src/components/ParameterWorkbench/CompareView.tsx`
- Modify: `src/components/ParameterWorkbench/SmartFillView.tsx`
- Modify: `src/components/DataPurify/DataPurifyView.tsx`
- Modify: `src/components/ParameterWorkbench/MultiVehicleView.tsx`
- Create: `src/utils/vehicleSelectionState.ts`

**Step 1: Replace shared selection state**

让 MultiVehicle 使用独立的 `currentMultiVehicleProducts`。

**Step 2: Replace old activation checks**

让 DataSourcePanel 用实例键而不是纯车型名判断资产是否已激活。

**Step 3: Add unified pending-state UX**

让 4 个模块统一识别待同步实例，并显示明确的同步提示。

**Step 4: Run focused regression tests**

Run: `npm test -- --run src/store/__tests__/vehicleStore.instance-selection.test.ts src/utils/__tests__/vehicleSelectionState.test.ts src/components/ParameterWorkbench/__tests__/CompareView.assetSync.test.tsx`

**Step 5: Run build verification**

Run: `npm run build`
