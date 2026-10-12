# 整车设计器迁移计划（vehicle-config → vehicle-parameter 方案 A）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 vehicle-config 项目的「L4 整车参数化设计 + 2D/3D 可视化」功能整体迁入 vehicle-parameter，作为独立自洽的「整车设计器」模块挂进现有导航。

**Architecture:** 保留 vehicle-config 已重构好的组件结构（`components/configurator/` 拆分成 `ParameterPanel`/`Canvas`/`TopBar`/`BottomBar`/`ResultPanel`/`modals`），迁入主项目 `src/components/VehicleDesigner/`；纯逻辑（参数推导、文本解析）抽成纯函数便于测试；UI 控件从 lucide-react + 手写 Tailwind 改写为 Ant Design v6 + @ant-design/icons；3D（Three.js/R3F）与 2D SVG 图形层保持原样只做 TS 化。**不建数据桥接**——3D 配置器用自己的 L4 参数体系自洽运行。

**Tech Stack:** React 19 + TypeScript(strict) + Ant Design v6 + Tailwind 3 + Three.js/R3F/drei + Zustand（主项目已装）

---

## 决策记录（已与用户确认）

1. **数据关系：独立自洽**。不把资产库字段映射进 L4 参数，3D 配置器自成体系，桥接留二期。
2. **UI 风格：改造为 Ant Design**。不引入 lucide-react，全部交互控件（按钮/输入/滑块/折叠/分段/下拉/弹窗/标签）用 antd + @ant-design/icons 重写；2D SVG 与 3D 图形渲染层是数据可视化，非 UI 控件，保持原样仅 TS 化。
3. **命名**：模块目录 `src/components/VehicleDesigner/`，导航 key `designer`、label `整车设计`。

---

## 迁移源 → 目标映射

| 源（vehicle-config） | 目标（vehicle-parameter） | 处理 |
|---|---|---|
| `src/lib/deriveParams.js` | `src/components/VehicleDesigner/deriveParams.ts` | TS 化 + 类型 |
| `src/hooks/useVehicleParams.js` | `src/components/VehicleDesigner/useVehicleParams.ts` | TS 化，解析逻辑抽到 parseParams.ts |
| `src/hooks/useSavedConfigs.js` | `src/components/VehicleDesigner/useSavedConfigs.ts` | TS 化 |
| `src/hooks/useResponsiveCanvas.js` | `src/components/VehicleDesigner/useResponsiveCanvas.ts` | TS 化 |
| `src/Vehicle3D.jsx` | `src/components/VehicleDesigner/Vehicle3D.tsx` | TS 化 + 删死代码 |
| `src/components/configurator/VehicleConfigurator.jsx` | `src/components/VehicleDesigner/VehicleDesigner.tsx` | TS 化 + antd |
| `src/components/configurator/Canvas/*` | `src/components/VehicleDesigner/Canvas/*` | TS 化 |
| `src/components/configurator/ParameterPanel/*` | `src/components/VehicleDesigner/ParameterPanel/*` | antd 重写 |
| `src/components/configurator/TopBar.jsx` | `src/components/VehicleDesigner/TopBar.tsx` | antd 重写 |
| `src/components/configurator/BottomBar.jsx` | `src/components/VehicleDesigner/BottomBar.tsx` | antd 重写 |
| `src/components/configurator/ResultPanel.jsx` | `src/components/VehicleDesigner/ResultPanel.tsx` | antd 重写 |
| `src/components/configurator/modals/*` | `src/components/VehicleDesigner/modals/*` | antd 重写 |
| `public/fonts/Roboto-Regular.woff` | `public/fonts/Roboto-Regular.woff` | 复制 |
| `src/L4VehicleConfigurator.jsx`（1043 行死代码） | — | **不迁移**（V3.8 重构后已无引用） |
| `src/App.css`、`src/assets/react.svg` | — | **不迁移**（Vite 模板残留） |

---

## 文件结构（迁移后）

```
src/components/VehicleDesigner/
├── VehicleDesigner.tsx        # 主容器（三段式布局，等价原 VehicleConfigurator.jsx）
├── types.ts                   # VehicleParams 接口（唯一权威类型）
├── deriveParams.ts            # 纯函数：参数推导 + INITIAL_PARAMS + toRad/toDeg
├── parseParams.ts             # 纯函数：轮胎解析 + 文本指令解析（可单测）
├── useVehicleParams.ts        # 状态 + 历史栈 hook
├── useSavedConfigs.ts         # localStorage 配置保存/槽位 hook
├── useResponsiveCanvas.ts     # ResizeObserver 画布尺寸 hook
├── Vehicle3D.tsx              # 3D 渲染（R3F，懒加载边界）
├── ParameterPanel/
│   ├── index.tsx              # 左栏参数面板（antd Collapse 分区）
│   ├── InputGroup.tsx         # 数字输入 + 滑块（antd InputNumber + Slider）
│   ├── Section.tsx            # antd Collapse.Panel 封装（或被 Collapse items 取代）
│   └── LinkedPair.tsx         # 主/从联动参数对
├── Canvas/
│   ├── index.ts               # 导出桶
│   ├── SideView.tsx           # 侧视 SVG（保持原样，TS 化）
│   ├── FrontView.tsx          # 前视 SVG（保持原样，TS 化）
│   └── DimensionLine.tsx      # 尺寸标注线 SVG
├── TopBar.tsx                 # 顶栏（antd Segmented + Dropdown + Popconfirm）
├── BottomBar.tsx              # 底栏（antd Button + Tag + Drawer）
├── ResultPanel.tsx            # 右栏计算摘要（antd Card + Statistic）
├── modals/
│   ├── SaveConfigModal.tsx    # antd Modal
│   └── ImportText.tsx         # antd Input.TextArea + Alert
└── __tests__/
    ├── deriveParams.test.ts
    └── parseParams.test.ts
```

---

## Task 1: 安装 3D 依赖 + 复制字体文件

**Files:**
- Modify: `package.json`（npm 自动）
- Copy: `public/fonts/Roboto-Regular.woff`（从 vehicle-config/public/fonts/）

- [ ] **Step 1: 安装 three 全家桶**

Run:
```bash
npm install three@^0.182.0 @react-three/fiber@^9.5.0 @react-three/drei@^10.7.7 troika-three-text
npm install -D @types/three@^0.182.0
```

说明：`troika-three-text` 显式安装（Vehicle3D.tsx 顶层直接 `import { configureTextBuilder }`，必须落在 node_modules 顶层供 typecheck/lint 解析）；`@types/three` 提供 three 的类型（vehicle-config 原版就有）。

- [ ] **Step 2: 复制字体文件**

Run:
```bash
cp /Users/ethan/code/软件开发/vehicle-config/public/fonts/Roboto-Regular.woff public/fonts/Roboto-Regular.woff
```

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json public/fonts/Roboto-Regular.woff
git commit -m "chore: 引入 three/R3F/drei 依赖与本地标注字体，为整车设计器打地基

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2: 类型定义 + 参数推导纯函数（TDD）

**Files:**
- Create: `src/components/VehicleDesigner/types.ts`
- Create: `src/components/VehicleDesigner/deriveParams.ts`
- Test: `src/components/VehicleDesigner/__tests__/deriveParams.test.ts`

- [ ] **Step 1: 写类型定义 `types.ts`**

```typescript
// 整车设计器参数：L4 底盘/上装参数体系的唯一权威类型。
// 派生字段（cargoHeight 等）由 deriveParams 计算，输入侧为完整 VehicleParams。
export interface VehicleParams {
  // 输入参数
  chassisLength: number;
  overallLength: number;
  overallWidth: number;
  overallHeight: number;
  sensorTopHeight: number;
  frontModuleLength: number;
  wheelbase: number;
  trackWidth: number;
  wheelRadius: number;
  chassisGroundClearance: number;
  platformHeight: number;
  chassisOverhangFront: number;
  chassisWidth: number;
  tireSpec: string;
  cargoLength: number;
  cargoWidth: number;
  cargoWallThickness: number;
  frontMinGroundClearance: number;
  rearMinGroundClearance: number;
  cargoGap: number;
  // 姿态角（既作输入也作派生，双向驱动）
  approachAngle: number;
  departureAngle: number;
  // 派生参数
  cargoHeight: number;
  frontModuleHeight: number;
  chassisOverhangRear: number;
  cargoRearOverhang: number;
  innerCargoLength: number;
  innerCargoWidth: number;
  innerCargoHeight: number;
  innerCargoVolume: number;
  actualOverallLength: number;
  // 可选：前视 SVG 读取，INITIAL_PARAMS 未定义
  frontModuleWidth?: number;
  chassisHeight?: number;
}
```

- [ ] **Step 2: 写失败测试 `deriveParams.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { deriveParams, toRad, toDeg, INITIAL_PARAMS } from '../deriveParams';

describe('toRad/toDeg', () => {
  it('角度弧度互转', () => {
    expect(toRad(180)).toBeCloseTo(Math.PI);
    expect(toDeg(Math.PI)).toBeCloseTo(180);
  });
});

describe('deriveParams', () => {
  it('货厢内空体积 = (长-2壁厚)×(宽-2壁厚)×(高-2壁厚)/1e9', () => {
    const p = deriveParams({
      ...INITIAL_PARAMS,
      cargoLength: 4050,
      cargoWidth: 1600,
      overallHeight: 2200,
      platformHeight: 700,
      cargoWallThickness: 30,
    });
    // 内空高 = (2200-700) - 2*30 = 1440
    expect(p.cargoHeight).toBe(1500);
    expect(p.innerCargoHeight).toBe(1440);
    expect(p.innerCargoLength).toBe(4050 - 60);
    expect(p.innerCargoWidth).toBe(1600 - 60);
    // 体积 (3990 * 1540 * 1440) / 1e9，四舍五入两位
    const vol = (3990 * 1540 * 1440) / 1e9;
    expect(p.innerCargoVolume).toBe(parseFloat(vol.toFixed(2)));
  });

  it('整车长 = max(底盘端, 货厢端)', () => {
    const p = deriveParams({
      ...INITIAL_PARAMS,
      chassisLength: 3700,
      frontModuleLength: 250,
      cargoGap: 10,
      cargoLength: 4050,
    });
    // 货厢端 = 250 + 10 + 4050 = 4310 > 底盘 3700
    expect(p.actualOverallLength).toBe(4310);
    expect(p.cargoRearOverhang).toBe(4310 - 3700);
  });

  it('后悬 = 底盘长 - 前悬 - 轴距', () => {
    const p = deriveParams({
      ...INITIAL_PARAMS,
      chassisLength: 3700,
      chassisOverhangFront: 800,
      wheelbase: 2200,
    });
    expect(p.chassisOverhangRear).toBe(700);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run src/components/VehicleDesigner/__tests__/deriveParams.test.ts`
Expected: FAIL（模块不存在 / deriveParams 未定义）

- [ ] **Step 4: 实现 `deriveParams.ts`（从 vehicle-config/src/lib/deriveParams.js 迁移，仅加类型）**

```typescript
import type { VehicleParams } from './types';

export const toRad = (deg: number): number => (deg * Math.PI) / 180;
export const toDeg = (rad: number): number => (rad * 180) / Math.PI;

export const deriveParams = (baseParams: VehicleParams): VehicleParams => {
  const overallWidth = Math.max(baseParams.cargoWidth, baseParams.chassisWidth || baseParams.overallWidth);
  const cargoHeight = baseParams.overallHeight - baseParams.platformHeight;
  const frontModuleHeight = baseParams.sensorTopHeight - baseParams.platformHeight;
  const chassisOverhangRear = baseParams.chassisLength - baseParams.chassisOverhangFront - baseParams.wheelbase;
  const chassisEndPos = baseParams.chassisLength;
  const cargoEndPos = baseParams.frontModuleLength + baseParams.cargoGap + baseParams.cargoLength;
  const cargoRearOverhang = Math.max(0, cargoEndPos - chassisEndPos);
  const overallLength = Math.max(chassisEndPos, cargoEndPos);
  const innerCargoLength = Math.max(0, baseParams.cargoLength - 2 * baseParams.cargoWallThickness);
  const innerCargoWidth = Math.max(0, baseParams.cargoWidth - 2 * baseParams.cargoWallThickness);
  const innerCargoHeight = Math.max(0, cargoHeight - 2 * baseParams.cargoWallThickness);
  const innerCargoVolume = parseFloat(((innerCargoLength * innerCargoWidth * innerCargoHeight) / 1e9).toFixed(2));

  return {
    ...baseParams,
    overallWidth,
    overallLength,
    actualOverallLength: overallLength,
    cargoHeight,
    frontModuleHeight,
    chassisOverhangRear,
    cargoRearOverhang,
    innerCargoLength,
    innerCargoWidth,
    innerCargoHeight,
    innerCargoVolume,
  };
};

export const INITIAL_PARAMS: VehicleParams = deriveParams({
  chassisLength: 3700,
  overallLength: 3700,
  overallWidth: 1500,
  overallHeight: 2200,
  sensorTopHeight: 2000,
  frontModuleLength: 250,
  wheelbase: 2200,
  trackWidth: 1300,
  wheelRadius: 364,
  chassisGroundClearance: 250,
  platformHeight: 700,
  chassisOverhangFront: 800,
  chassisWidth: 1400,
  tireSpec: '215/75R16LT',
  cargoLength: 4050,
  cargoWidth: 1600,
  chassisOverhangRear: 1300,
  approachAngle: 28,
  departureAngle: 18,
  cargoWallThickness: 30,
  frontMinGroundClearance: 450,
  rearMinGroundClearance: 450,
  innerCargoVolume: 0,
  innerCargoLength: 0,
  innerCargoWidth: 0,
  innerCargoHeight: 0,
  cargoRearOverhang: 0,
  cargoGap: 10,
  cargoHeight: 0,
  frontModuleHeight: 0,
  actualOverallLength: 0,
});
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/components/VehicleDesigner/__tests__/deriveParams.test.ts`
Expected: PASS（4 个用例全绿）

- [ ] **Step 6: 提交**

```bash
git add src/components/VehicleDesigner/types.ts src/components/VehicleDesigner/deriveParams.ts src/components/VehicleDesigner/__tests__/deriveParams.test.ts
git commit -m "feat(designer): 参数推导纯函数与类型定义

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3: 文本解析纯函数（TDD）

从 `useVehicleParams.js` 提取轮胎规格解析与文本指令解析为纯函数，便于单测。

**Files:**
- Create: `src/components/VehicleDesigner/parseParams.ts`
- Test: `src/components/VehicleDesigner/__tests__/parseParams.test.ts`

- [ ] **Step 1: 写失败测试 `parseParams.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { parseTireSpec, validateImportLines, parseConfigText } from '../parseParams';

describe('parseTireSpec', () => {
  it('解析 215/75R16LT → 半径', () => {
    // 轮径 = 16*25.4 + 2*215*0.75 = 406.4 + 322.5 = 728.9 → 半径 364
    expect(parseTireSpec('215/75R16LT')).toBe(364);
  });
  it('非法规格返回 null', () => {
    expect(parseTireSpec('invalid')).toBeNull();
    expect(parseTireSpec('')).toBeNull();
  });
});

describe('validateImportLines', () => {
  it('识别有效行，标记无效行', () => {
    const { validLines, errorLines } = validateImportLines('整车=4600*1500*2200\n轴距:2200\n这不是参数\n');
    expect(validLines.has(0)).toBe(true);
    expect(validLines.has(1)).toBe(true);
    expect(errorLines.has(2)).toBe(true);
  });
});

describe('parseConfigText', () => {
  it('整车尺寸 → chassisLength + overallHeight', () => {
    const { updates } = parseConfigText('整车=4600*1500*2200');
    expect(updates.chassisLength).toBe(4600);
    expect(updates.overallHeight).toBe(2200);
  });
  it('轮胎规格联动轮径', () => {
    const { updates } = parseConfigText('轮胎=215/75R16LT');
    expect(updates.tireSpec).toBe('215/75R16LT');
    expect(updates.wheelRadius).toBe(364);
  });
  it('无有效内容返回空 updates', () => {
    const { updates } = parseConfigText('hello world');
    expect(Object.keys(updates).length).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/VehicleDesigner/__tests__/parseParams.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 `parseParams.ts`（逻辑逐字节搬自 useVehicleParams.js，仅加类型）**

```typescript
import type { VehicleParams } from './types';

export const parseTireSpec = (spec: string): number | null => {
  try {
    const match = spec.match(/(\d{3})\/(\d{2})[R|r](\d{2})/);
    if (match) {
      const width = parseInt(match[1]);
      const ratio = parseInt(match[2]);
      const rim = parseInt(match[3]);
      const diameter = rim * 25.4 + 2 * width * (ratio / 100);
      return Math.round(diameter / 2);
    }
  } catch { /* ignore */ }
  return null;
};

const PATTERNS = [
  { regex: /整车[=:：]\s*\d{3,5}\s*\*\s*\d{3,5}\s*\*\s*\d{3,5}/ },
  { regex: /底盘[=:：]\s*\d{3,5}\s*\*\s*\d{3,5}/ },
  { regex: /货箱[=:：]\s*\d{3,5}\s*\*\s*\d{3,5}\s*\*\s*\d{3,5}/ },
  { regex: /智驾[=:：]\s*\d{2,5}\s*\*\s*\d{3,5}/ },
  { regex: /轴距[=:：]\s*\d{3,5}/i },
  { regex: /轮距[=:：]\s*\d{3,5}/i },
  { regex: /前悬[=:：]\s*\d{2,5}/i },
  { regex: /后悬[=:：]\s*\d{2,5}/i },
  { regex: /货台高[=:：]\s*\d{2,5}/i },
  { regex: /离地[=:：]\s*\d{2,5}/i },
  { regex: /接近角[=:：]\s*\d{1,2}(?:\.\d)?/i },
  { regex: /离去角[=:：]\s*\d{1,2}(?:\.\d)?/i },
  { regex: /壁厚[=:：]\s*\d{1,3}/i },
  { regex: /间隙[=:：]\s*\d{1,3}/i },
  { regex: /轮胎[=:：]\s*[0-9]{3}\/[0-9]{2}[R|r][0-9]{2}[A-Za-z]*/i },
];

export const validateImportLines = (text: string): { validLines: Set<number>; errorLines: Set<number> } => {
  if (!text.trim()) return { validLines: new Set(), errorLines: new Set() };
  const validLines = new Set<number>();
  const errorLines = new Set<number>();
  text.split('\n').forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (PATTERNS.some(({ regex }) => regex.test(trimmed))) validLines.add(idx);
    else errorLines.add(idx);
  });
  return { validLines, errorLines };
};

export const parseConfigText = (text: string): { updates: Partial<VehicleParams>; errorLines: Set<number> } => {
  if (!text.trim()) return { updates: {}, errorLines: new Set() };
  const { errorLines } = validateImportLines(text);
  const updates: Partial<VehicleParams> = {};

  const vehicleMatch = text.match(/整车[=:：]\s*(\d{3,5})\s*\*\s*(\d{3,5})\s*\*\s*(\d{3,5})/);
  if (vehicleMatch) {
    updates.chassisLength = parseFloat(vehicleMatch[1]);
    updates.overallHeight = parseFloat(vehicleMatch[3]);
  }
  const chassisMatch = text.match(/底盘[=:：]\s*(\d{3,5})\s*\*\s*(\d{3,5})/);
  if (chassisMatch) {
    updates.chassisLength = parseFloat(chassisMatch[1]);
    updates.chassisWidth = parseFloat(chassisMatch[2]);
  }
  const cargoMatch = text.match(/货箱[=:：]\s*(\d{3,5})\s*\*\s*(\d{3,5})\s*\*\s*(\d{3,5})/);
  if (cargoMatch) {
    updates.cargoLength = parseFloat(cargoMatch[1]);
    updates.cargoWidth = parseFloat(cargoMatch[2]);
  }
  const sensorMatch = text.match(/智驾[=:：]\s*(\d{2,5})\s*\*\s*(\d{3,5})/);
  if (sensorMatch) {
    updates.frontModuleLength = parseFloat(sensorMatch[1]);
    updates.sensorTopHeight = parseFloat(sensorMatch[2]);
  }

  const kvPatterns: Array<{ key: keyof VehicleParams; regex: RegExp }> = [
    { key: 'wheelbase', regex: /轴距[=:：]\s*(\d{3,5})/i },
    { key: 'trackWidth', regex: /轮距[=:：]\s*(\d{3,5})/i },
    { key: 'chassisOverhangFront', regex: /前悬[=:：]\s*(\d{2,5})/i },
    { key: 'chassisOverhangRear', regex: /后悬[=:：]\s*(\d{2,5})/i },
    { key: 'platformHeight', regex: /货台高[=:：]\s*(\d{2,5})/i },
    { key: 'chassisGroundClearance', regex: /离地[=:：]\s*(\d{2,5})/i },
    { key: 'approachAngle', regex: /接近角[=:：]\s*(\d{1,2}(?:\.\d)?)/i },
    { key: 'departureAngle', regex: /离去角[=:：]\s*(\d{1,2}(?:\.\d)?)/i },
    { key: 'cargoWallThickness', regex: /壁厚[=:：]\s*(\d{1,3})/i },
    { key: 'cargoGap', regex: /间隙[=:：]\s*(\d{1,3})/i },
  ];
  kvPatterns.forEach(({ key, regex }) => {
    const match = text.match(regex);
    if (match) {
      const val = parseFloat(match[1]);
      if (!isNaN(val)) (updates as Record<string, unknown>)[key] = val;
    }
  });

  const tireMatch = text.match(/轮胎[=:：]\s*([0-9]{3}\/[0-9]{2}[R|r][0-9]{2}[A-Za-z]*)/i);
  if (tireMatch) {
    updates.tireSpec = tireMatch[1];
    const r = parseTireSpec(tireMatch[1]);
    if (r) updates.wheelRadius = r;
  }

  if (Object.keys(updates).length === 0) {
    const dimsMatch = text.match(/(\d{3,5})\s*[\*xX]\s*(\d{3,5})\s*[\*xX]\s*(\d{3,5})/);
    if (dimsMatch) {
      updates.chassisLength = parseFloat(dimsMatch[1]);
      updates.cargoWidth = parseFloat(dimsMatch[2]);
      updates.overallHeight = parseFloat(dimsMatch[3]);
    }
  }

  return { updates, errorLines };
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/components/VehicleDesigner/__tests__/parseParams.test.ts`
Expected: PASS（7 个用例全绿）

- [ ] **Step 5: 提交**

```bash
git add src/components/VehicleDesigner/parseParams.ts src/components/VehicleDesigner/__tests__/parseParams.test.ts
git commit -m "feat(designer): 轮胎与文本指令解析纯函数

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4: 3D 渲染组件 TS 化

纯迁移 + TS 化，**不改渲染逻辑**。这是懒加载边界文件，保持独立 chunk。

**Files:**
- Create: `src/components/VehicleDesigner/Vehicle3D.tsx`（源：vehicle-config/src/Vehicle3D.jsx，704 行）

- [ ] **Step 1: 复制源文件并改扩展名**

Run:
```bash
cp /Users/ethan/code/软件开发/vehicle-config/src/Vehicle3D.jsx src/components/VehicleDesigner/Vehicle3D.tsx
```

- [ ] **Step 2: 按清单 TS 化 + 清理**

对 `Vehicle3D.tsx` 做以下改动（源文件逐字节保留渲染逻辑，仅以下项）：

1. 顶部 import 加类型：`import type { VehicleParams } from './types';`
2. 给所有接收 params 的组件补 props 类型。核心签名：
   - `const VehicleModel = ({ params, isGhost, annotationSettings }: { params: VehicleParams; isGhost: boolean; annotationSettings: Record<string, unknown> }) => {`
   - `const VehicleScene = ({ configs, annotationSettings }: { configs: VehicleParams[]; annotationSettings: Record<string, unknown> }) => {`
   - `const Vehicle3D = ({ params, selectedSlots = [] }: { params: VehicleParams; selectedSlots: Array<{ id: number; params: VehicleParams }> }) => {`
3. 纯函数补返回类型：
   - `const mm2m = (mm: number): number => mm / 1000;`
   - `const Wheel = ({ position, isGhost }: { position: [number, number, number]; isGhost: boolean }) => {`
   - `const DimensionLine3D = ({ start, end, label, offset = [0,0,0], color = '#64748b' }: { start: [number,number,number]; end: [number,number,number]; label: string; offset?: [number,number,number]; color?: string }) => {`
4. **删除死代码 `ModuleBox` 组件**（性能审计 #8a：从未引用，含 `<Html>` label），并删除随之未用的 `Html` import。
5. 检查 `Billboard`、`Lightformer`、`Line`、`ContactShadows`、`Grid`、`Edges`、`Text`、`OrbitControls`、`PerspectiveCamera`、`Environment` 是否都在 JSX 中用到；未用的一律从 import 移除（主项目 `noUnusedLocals` 会让残留 import 直接 typecheck 失败）。
6. `useState` 等 hook 的 state 若能从初值推断则不加显式泛型；`annotationSettings` 状态若为对象字面量，保持原结构。

- [ ] **Step 3: 单独类型检查本文件**

Run: `npm run typecheck`
Expected: 无 Vehicle3D.tsx 相关报错（其他文件报错见后续 Task 统一处理；若本文件有报错则在此修完）

- [ ] **Step 4: 提交**

```bash
git add src/components/VehicleDesigner/Vehicle3D.tsx
git commit -m "feat(designer): 迁移 3D 渲染组件并 TS 化

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5: 2D SVG 画布组件 TS 化

**Files:**
- Create: `src/components/VehicleDesigner/Canvas/DimensionLine.tsx`（源 DimensionLine.jsx）
- Create: `src/components/VehicleDesigner/Canvas/SideView.tsx`（源 SideView.jsx）
- Create: `src/components/VehicleDesigner/Canvas/FrontView.tsx`（源 FrontView.jsx）
- Create: `src/components/VehicleDesigner/Canvas/index.ts`

- [ ] **Step 1: 复制三个源文件并改扩展名**

Run:
```bash
mkdir -p src/components/VehicleDesigner/Canvas
cp /Users/ethan/code/软件开发/vehicle-config/src/components/configurator/Canvas/DimensionLine.jsx src/components/VehicleDesigner/Canvas/DimensionLine.tsx
cp /Users/ethan/code/软件开发/vehicle-config/src/components/configurator/Canvas/SideView.jsx src/components/VehicleDesigner/Canvas/SideView.tsx
cp /Users/ethan/code/软件开发/vehicle-config/src/components/configurator/Canvas/FrontView.jsx src/components/VehicleDesigner/Canvas/FrontView.tsx
```

- [ ] **Step 2: TS 化清单**

1. **DimensionLine.tsx** props 类型：
```typescript
interface DimensionLineProps {
  x1: number; y1: number; x2: number; y2: number;
  text?: string; offset?: number; vertical?: boolean;
  color?: string; isOverall?: boolean; showDimensions?: boolean;
}
const DimensionLine = ({ x1, y1, x2, y2, text, offset = 20, vertical = false, color = 'gray-400', isOverall = false, showDimensions = true }: DimensionLineProps) => {
```
2. **SideView.tsx**：顶部 `import type { VehicleParams } from '../types';`；`safeVal` 加类型 `(v: number): number`；`VehicleSVGContent` 补 props 类型（含 `p: VehicleParams; isGhost: boolean; viewType: 'side' | 'front'; viewDimensions: { width: number; height: number }; groundY: number; slotIndex?: number`）；`SideView` 补 props 类型（含 `selectedSlots: Array<{ id: number; params: VehicleParams }>`）；`getAngleLine` 补参数/返回类型。
3. **FrontView.tsx**：同 SideView 处理，`import { VehicleSVGContent } from './SideView'` 保持不变。
4. **index.ts**：
```typescript
export { default as SideView } from './SideView';
export { default as FrontView } from './FrontView';
export { default as DimensionLine } from './DimensionLine';
```
5. 删除 JS 时因文件内 `export { VehicleSVGContent, safeVal }` 产生的类型导出问题：SideView.tsx 末尾保留 `export { VehicleSVGContent, safeVal };` 但需确保其类型已定义。

- [ ] **Step 3: 类型检查**

Run: `npm run typecheck`
Expected: 无 Canvas/* 报错

- [ ] **Step 4: 提交**

```bash
git add src/components/VehicleDesigner/Canvas/
git commit -m "feat(designer): 迁移 2D SVG 画布组件并 TS 化

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 6: 三个 hooks TS 化

**Files:**
- Create: `src/components/VehicleDesigner/useResponsiveCanvas.ts`（源 useResponsiveCanvas.js）
- Create: `src/components/VehicleDesigner/useSavedConfigs.ts`（源 useSavedConfigs.js）
- Create: `src/components/VehicleDesigner/useVehicleParams.ts`（源 useVehicleParams.js，重构为调用 parseParams）

- [ ] **Step 1: 复制两个简单 hook 并 TS 化**

Run:
```bash
cp /Users/ethan/code/软件开发/vehicle-config/src/hooks/useResponsiveCanvas.js src/components/VehicleDesigner/useResponsiveCanvas.ts
cp /Users/ethan/code/软件开发/vehicle-config/src/hooks/useSavedConfigs.js src/components/VehicleDesigner/useSavedConfigs.ts
```

TS 化要点：
- `useResponsiveCanvas.ts`：`containerRef` 用 `useRef<HTMLDivElement | null>(null)`；`viewDimensions` 状态类型 `{ width: number; height: number }`。
- `useSavedConfigs.ts`：定义 `interface SavedConfig { id: number; name: string; timestamp: string; params: VehicleParams }`；`selectedSlots` 类型 `SavedConfig[]`；所有 `useCallback`/`useState` 补泛型；`import type { VehicleParams } from './types'`；`import { deriveParams } from './deriveParams'`（替换原 `../lib/deriveParams`）。

- [ ] **Step 2: 写 useVehicleParams.ts（重构版）**

不直接复制，而是重写为调用 Task 3 的 `parseParams.ts`。保留 history 栈与 handleChange 的双向驱动逻辑（这些逻辑来自源 useVehicleParams.js，逐字节保留）。

```typescript
import { useState, useMemo, useCallback, useRef } from 'react';
import { deriveParams, INITIAL_PARAMS, toRad, toDeg } from './deriveParams';
import { parseTireSpec, validateImportLines, parseConfigText } from './parseParams';
import type { VehicleParams } from './types';

const MAX_HISTORY = 50;

export const useVehicleParams = () => {
  const [params, setParams] = useState<VehicleParams>(INITIAL_PARAMS);
  const [lastEditedKey, setLastEditedKey] = useState('approachAngle');
  const [historyVersion, setHistoryVersion] = useState(0);
  const historyRef = useRef({ past: [] as VehicleParams[], future: [] as VehicleParams[] });
  const paramsRef = useRef<VehicleParams>(params);
  paramsRef.current = params;

  const pushHistory = useCallback((snapshot: VehicleParams) => {
    const hist = historyRef.current;
    hist.past = [...hist.past, snapshot].slice(-MAX_HISTORY);
    hist.future = [];
    setHistoryVersion(v => v + 1);
  }, []);

  const undo = useCallback(() => {
    const hist = historyRef.current;
    if (hist.past.length === 0) return;
    const prevSnapshot = hist.past[hist.past.length - 1];
    hist.past = hist.past.slice(0, -1);
    hist.future = [params, ...hist.future];
    setHistoryVersion(v => v + 1);
    setParams(deriveParams(prevSnapshot));
  }, [params]);

  const redo = useCallback(() => {
    const hist = historyRef.current;
    if (hist.future.length === 0) return;
    const nextSnapshot = hist.future[0];
    hist.future = hist.future.slice(1);
    hist.past = [...hist.past, params];
    setHistoryVersion(v => v + 1);
    setParams(deriveParams(nextSnapshot));
  }, [params]);

  const canUndo = useMemo(() => historyRef.current.past.length > 0, [historyVersion]);
  const canRedo = useMemo(() => historyRef.current.future.length > 0, [historyVersion]);

  const handleChange = useCallback((key: keyof VehicleParams, value: number) => {
    const val = value;
    setLastEditedKey(key);
    pushHistory(paramsRef.current);
    setParams(prev => {
      const nextBase = { ...prev, [key]: val };
      const updates: Partial<VehicleParams> = { [key]: val };
      const chassisOverhangRear = nextBase.chassisLength - nextBase.chassisOverhangFront - nextBase.wheelbase;

      if (key === 'approachAngle' && val > 0) {
        updates.frontMinGroundClearance = Math.round(nextBase.chassisOverhangFront * Math.tan(toRad(val)));
      } else if (key === 'departureAngle' && val > 0) {
        updates.rearMinGroundClearance = Math.round(chassisOverhangRear * Math.tan(toRad(val)));
      } else if (key === 'frontMinGroundClearance') {
        const angle = toDeg(Math.atan(val / nextBase.chassisOverhangFront));
        updates.approachAngle = parseFloat(angle.toFixed(1));
      } else if (key === 'rearMinGroundClearance') {
        const angle = toDeg(Math.atan(val / chassisOverhangRear));
        updates.departureAngle = parseFloat(angle.toFixed(1));
      } else if (key === 'chassisOverhangFront') {
        const angle = toDeg(Math.atan(prev.frontMinGroundClearance / val));
        updates.approachAngle = parseFloat(angle.toFixed(1));
      } else if (key === 'chassisLength') {
        // 派生尺寸在下方 deriveParams 统一计算
      } else if (key === 'cargoRearOverhang') {
        updates.cargoLength = nextBase.chassisLength - nextBase.frontModuleLength - nextBase.cargoGap + val;
      }

      return deriveParams({ ...prev, ...updates });
    });
  }, [pushHistory]);

  const handleTireChange = useCallback((val: string) => {
    const newRadius = parseTireSpec(val);
    pushHistory(paramsRef.current);
    setParams(prev => deriveParams({ ...prev, tireSpec: val, wheelRadius: newRadius ?? prev.wheelRadius }));
  }, [pushHistory]);

  const parseAndApplyConfig = useCallback((importText: string) => {
    if (!importText.trim()) return { count: 0, errorLines: new Set<number>() };
    const { updates, errorLines } = parseConfigText(importText);
    if (Object.keys(updates).length > 0) {
      pushHistory(paramsRef.current);
      setParams(prev => deriveParams({ ...prev, ...updates }));
      return { count: Object.keys(updates).length, errorLines };
    }
    return { count: 0, errorLines };
  }, [pushHistory]);

  const ratioInfo = useMemo(() => {
    const ratio = params.wheelbase / (params.trackWidth || 1);
    if (ratio < 1.4) return { ratio: ratio.toFixed(2), status: 'warning', msg: '轴轮比 < 1.4 (偏小)' };
    if (ratio > 2.0) return { ratio: ratio.toFixed(2), status: 'warning', msg: '轴轮比 > 2.0 (偏大)' };
    return { ratio: ratio.toFixed(2), status: 'normal', msg: `工程比例合理 (${ratio.toFixed(2)})` };
  }, [params.trackWidth, params.wheelbase]);

  const hasWheelConflict = params.platformHeight < (params.wheelRadius * 2 + 80);
  const isRearOverhangTooShort = params.chassisOverhangRear < 300;

  const copyToClipboard = useCallback(() => {
    const text = `L4无人车配置\n整车=${Math.round(params.overallLength)}*${Math.round(params.overallWidth)}*${params.overallHeight}\n底盘=${params.chassisLength}*${params.chassisWidth}\n货箱=${Math.round(params.cargoLength)}*${params.cargoWidth}*${params.cargoHeight}\n货箱内空=${Math.round(params.innerCargoLength)}*${Math.round(params.innerCargoWidth)}*${Math.round(params.innerCargoHeight)}=${params.innerCargoVolume}m³\n轴距=${params.wheelbase} 轮距=${params.trackWidth}\n前悬=${Math.round(params.chassisOverhangFront)} 后悬=${Math.round(params.chassisOverhangRear)}\n货台高=${params.platformHeight} 离地=${params.chassisGroundClearance}\n接近角=${params.approachAngle}° 离去角=${params.departureAngle}°\n智驾=${params.frontModuleLength}*${params.sensorTopHeight}\n壁厚=${params.cargoWallThickness} 间隙=${params.cargoGap}\n轮胎=${params.tireSpec}`;
    navigator.clipboard.writeText(text).then(() => {
      alert('配置已复制！');
    }).catch(() => {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      alert('配置已复制！');
    });
  }, [params]);

  const resetParams = useCallback(() => {
    pushHistory(paramsRef.current);
    setParams(INITIAL_PARAMS);
    setLastEditedKey('approachAngle');
  }, [pushHistory]);

  return {
    params, setParams, handleChange, handleTireChange,
    parseAndApplyConfig, validateImportLines,
    ratioInfo, hasWheelConflict, isRearOverhangTooShort,
    copyToClipboard, resetParams, lastEditedKey,
    undo, redo, canUndo, canRedo, pushHistory, MAX_HISTORY,
  };
};
```

注意：`ratioInfo.status` 类型会被推断为 `string`。若后续 ResultPanel 需要联合类型，可在本文件导出类型别名 `export type RatioStatus = 'warning' | 'normal';` 并显式标注。

- [ ] **Step 3: 类型检查**

Run: `npm run typecheck`
Expected: 无 VehicleDesigner 目录下 hook 报错

- [ ] **Step 4: 提交**

```bash
git add src/components/VehicleDesigner/useResponsiveCanvas.ts src/components/VehicleDesigner/useSavedConfigs.ts src/components/VehicleDesigner/useVehicleParams.ts
git commit -m "feat(designer): 迁移三个 hooks 并 TS 化

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 7: 输入类组件 antd 化（InputGroup / Section / LinkedPair）

把左栏参数面板的基础输入原子从原生 input/range + 手写样式改写为 antd 组件。

**Files:**
- Create: `src/components/VehicleDesigner/ParameterPanel/InputGroup.tsx`
- Create: `src/components/VehicleDesigner/ParameterPanel/Section.tsx`
- Create: `src/components/VehicleDesigner/ParameterPanel/LinkedPair.tsx`

- [ ] **Step 1: 写 InputGroup.tsx（antd InputNumber + Slider）**

```typescript
import { memo, useState, useEffect } from 'react';
import { InputNumber, Slider, Space, Typography } from 'antd';

interface InputGroupProps {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  alert?: boolean;
  highlight?: boolean;
}

const InputGroup = memo(({ label, value, unit = 'mm', min, max, step = 1, onChange, alert, highlight }: InputGroupProps) => {
  const [localValue, setLocalValue] = useState<number | null>(Math.round(value));

  useEffect(() => { setLocalValue(Math.round(value)); }, [value]);

  return (
    <div
      style={{
        padding: 8, borderRadius: 8, marginBottom: 8, border: '1px solid',
        borderColor: alert ? '#fca5a5' : highlight ? '#93c5fd' : '#e2e8f0',
        background: alert ? '#fef2f2' : highlight ? '#eff6ff' : '#fff',
      }}
    >
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
        <Typography.Text type={alert ? 'danger' : highlight ? undefined : 'secondary'} style={{ fontSize: 12, fontWeight: 500 }}>
          {label}
        </Typography.Text>
        <Space.Compact>
          <InputNumber
            size="small" value={localValue} min={min} max={max} step={step}
            onChange={(v) => setLocalValue(v)}
            onBlur={() => {
              const val = localValue == null ? NaN : localValue;
              if (!isNaN(val)) { const clamped = Math.max(min, Math.min(max, val)); onChange(clamped); setLocalValue(Math.round(clamped)); }
              else setLocalValue(Math.round(value));
            }}
            onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
            style={{ width: 64 }}
          />
          <Typography.Text type={alert ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>{unit}</Typography.Text>
        </Space.Compact>
      </Space>
      <Slider min={min} max={max} step={step} value={value} onChange={(v) => onChange(v)} />
    </div>
  );
});

InputGroup.displayName = 'InputGroup';
export default InputGroup;
```

- [ ] **Step 2: 写 Section.tsx（antd Collapse.Panel 封装）**

```typescript
import { useState, type ReactNode } from 'react';
import { Collapse } from 'antd';

interface SectionProps {
  title: string;
  defaultExpanded?: boolean;
  valueSummary?: string;
  icon?: ReactNode;
  children: ReactNode;
}

const Section = ({ title, defaultExpanded = false, valueSummary, icon, children }: SectionProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <Collapse
      ghost
      activeKey={expanded ? ['1'] : []}
      onChange={() => setExpanded(!expanded)}
      items={[{
        key: '1',
        label: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            {icon}
            <span>{title}</span>
            {!expanded && valueSummary && (
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{valueSummary}</span>
            )}
          </span>
        ),
        children,
      }]}
    />
  );
};

export default Section;
```

- [ ] **Step 3: 写 LinkedPair.tsx（保留逻辑，antd Tooltip + InputGroup）**

```typescript
import { Tooltip } from 'antd';
import InputGroup from './InputGroup';

interface LinkedPairProps {
  primaryLabel: string;
  primaryKey: string;
  primaryValue: number;
  secondaryLabel: string;
  secondaryKey: string;
  secondaryValue: number;
  onChange: (key: string, value: number) => void;
  lastEditedKey: string;
  overhangKey: string;
  overhangValue: number;
}

const LinkedPair = ({ primaryLabel, primaryKey, primaryValue, secondaryLabel, secondaryKey, secondaryValue, onChange, lastEditedKey, overhangValue }: LinkedPairProps) => {
  const isPrimaryMaster = lastEditedKey === primaryKey;
  const isSecondaryMaster = lastEditedKey === secondaryKey;
  const primaryTooltip = isPrimaryMaster ? `${primaryLabel} 为主参数（最后编辑）` : `推导公式: atan(${secondaryLabel} / ${overhangValue}mm)`;
  const secondaryTooltip = isSecondaryMaster ? `${secondaryLabel} 为主参数（最后编辑）` : `推导公式: ${overhangValue}mm × tan(${primaryLabel})`;

  const badge = (isMaster: boolean) => (
    <span style={{ fontSize: 9, fontWeight: 700, color: isMaster ? '#2563eb' : '#f97316', background: isMaster ? '#dbeafe' : '#ffedd5', padding: '0 4px', borderRadius: 4, marginRight: 4 }}>
      {isMaster ? '主' : '从'}
    </span>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <Tooltip title={primaryTooltip}>
        <div style={{ opacity: isPrimaryMaster ? 1 : 0.6 }}>
          {badge(isPrimaryMaster)}
          <InputGroup label={primaryLabel} value={primaryValue} unit="°" min={10} max={60} step={0.1} onChange={(v) => onChange(primaryKey, v)} highlight />
        </div>
      </Tooltip>
      <Tooltip title={secondaryTooltip}>
        <div style={{ opacity: isSecondaryMaster ? 1 : 0.6 }}>
          {badge(isSecondaryMaster)}
          <InputGroup label={secondaryLabel} value={secondaryValue} unit="mm" min={100} max={1000} onChange={(v) => onChange(secondaryKey, v)} />
        </div>
      </Tooltip>
    </div>
  );
};

export default LinkedPair;
```

说明：`handleChange` 签名已在 Task 6 定为 `(key: keyof VehicleParams, value: number)`，但此处的 `onChange` 传的是字符串 key。为保证与 useVehicleParams 对接，本组件 `onChange` 用 `(key: string, value: number) => void`，调用方在 index.tsx 里 `handleChange(key as keyof VehicleParams, value)` 适配。

- [ ] **Step 4: 类型检查 + lint**

Run: `npm run typecheck && npm run lint`
Expected: 通过

- [ ] **Step 5: 提交**

```bash
git add src/components/VehicleDesigner/ParameterPanel/
git commit -m "feat(designer): 输入类组件 antd 化

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 8: 面板组件 antd 化（ParameterPanel / ResultPanel）

**Files:**
- Create: `src/components/VehicleDesigner/ParameterPanel/index.tsx`
- Create: `src/components/VehicleDesigner/ResultPanel.tsx`

- [ ] **Step 1: 写 ParameterPanel/index.tsx**

保留分区结构与参数项（逐项照搬源文件），图标从 lucide 换成 @ant-design/icons：

```typescript
import { RulerOutlined, ThunderboltOutlined, InboxOutlined } from '@ant-design/icons';
import { Alert } from 'antd';
import Section from './Section';
import InputGroup from './InputGroup';
import LinkedPair from './LinkedPair';
import type { VehicleParams } from '../types';

interface ParameterPanelProps {
  params: VehicleParams;
  handleChange: (key: string, value: number) => void;
  handleTireChange: (val: string) => void;
  hasWheelConflict: boolean;
  ratioInfo: { ratio: string; status: string; msg: string };
  isRearOverhangTooShort: boolean;
  lastEditedKey: string;
}

const ParameterPanel = ({ params, handleChange, handleTireChange, hasWheelConflict, ratioInfo, isRearOverhangTooShort, lastEditedKey }: ParameterPanelProps) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 分区 1-5 逐项照搬源 ParameterPanel/index.jsx 的 InputGroup 配置 */}
      {/* 每处 handleChange('xxx', v) 改为 handleChange('xxx', v)，key 保持源文件的字符串 */}
      {/* 轮胎输入框改用 antd Input */}
      {/* hasWheelConflict / ratioInfo 警告改用 antd Alert */}
    </div>
  );
};
export default ParameterPanel;
```

> 实现提示：本组件是纯声明式分区组装，逐项从源文件（vehicle-config/src/components/configurator/ParameterPanel/index.jsx，165 行）复制每个 `Section` 的分区内容，替换图标 import 与 `<input>` 为 antd `<Input>`，`hasWheelConflict`/`ratioInfo` 的红色/黄色提示条改用 `<Alert type="warning" showIcon />`。分区项完整清单：①整车定义（底盘长度/整车高度高亮）②姿态角（两个 LinkedPair）③货厢与智驾（货箱长宽/尾超/间隙/智驾长高/轮胎规格）④底盘配置（轮距/底盘宽/轴距/前悬/离地/货台高 + 轴轮比）⑤货厢壁厚。**不要遗漏任何一个参数项**——以源文件为准逐行对照。

- [ ] **Step 2: 写 ResultPanel.tsx（antd Card + Statistic）**

保留 6 个计算卡片（货厢内空、内空体积、实际总长、后悬、轴轮比、货厢外廓）+ 轮包干涉警示，结构改为 antd `Card` + `Statistic`，图标换 @ant-design/icons（`InboxOutlined`/`RulerOutlined`/`ThunderboltOutlined`/`InfoCircleOutlined`）。`hasWheelConflict` 警示用 `<Alert type="error" showIcon />`。数值与配色逻辑照搬源 ResultPanel.jsx（228 行）。

- [ ] **Step 3: 类型检查 + lint**

Run: `npm run typecheck && npm run lint`
Expected: 通过

- [ ] **Step 4: 提交**

```bash
git add src/components/VehicleDesigner/ParameterPanel/index.tsx src/components/VehicleDesigner/ResultPanel.tsx
git commit -m "feat(designer): 参数面板与结果摘要 antd 化

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 9: 顶栏 / 底栏 / 弹窗 antd 化

**Files:**
- Create: `src/components/VehicleDesigner/TopBar.tsx`
- Create: `src/components/VehicleDesigner/BottomBar.tsx`
- Create: `src/components/VehicleDesigner/modals/SaveConfigModal.tsx`
- Create: `src/components/VehicleDesigner/modals/ImportText.tsx`

- [ ] **Step 1: 写 TopBar.tsx（Segmented + Dropdown + Popconfirm）**

视图切换用 antd `Segmented`（侧视/前视/3D），撤销/重做用 `Button`（icon `UndoOutlined`/`RedoOutlined`），重置用 `Popconfirm` 包裹 `Button`，导出用 `Dropdown` 菜单（复制参数/导出 CSV/导出 PDF 禁用）。

```typescript
import { Segmented, Button, Dropdown, Popconfirm, Space } from 'antd';
import { UndoOutlined, RedoOutlined, ReloadOutlined, DownloadOutlined, CopyOutlined, FileTextOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';

interface TopBarProps {
  activeView: string;
  onViewChange: (v: string) => void;
  onReset: () => void;
  onCopy: () => void;
  onExportCSV: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const TopBar = ({ activeView, onViewChange, onReset, onCopy, onExportCSV, onUndo, onRedo, canUndo, canRedo }: TopBarProps) => {
  const items: MenuProps['items'] = [
    { key: 'copy', icon: <CopyOutlined />, label: '复制格式化参数' },
    { key: 'csv', icon: <FileTextOutlined />, label: '导出 CSV' },
    { key: 'pdf', icon: <DownloadOutlined />, label: '导出 PDF', disabled: true },
  ];
  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'copy') onCopy();
    if (key === 'csv') onExportCSV();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#0f172a', color: '#fff' }}>
      <Space size={12}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em' }}>整车设计器</span>
      </Space>
      <Segmented
        options={[{ label: '侧视', value: 'side' }, { label: '前视', value: 'front' }, { label: '3D', value: '3d' }]}
        value={activeView}
        onChange={(v) => onViewChange(v as string)}
      />
      <Space size={8}>
        <Button size="small" ghost icon={<UndoOutlined />} onClick={onUndo} disabled={!canUndo} title="撤销 (⌘Z)" />
        <Button size="small" ghost icon={<RedoOutlined />} onClick={onRedo} disabled={!canRedo} title="重做 (⌘⇧Z)" />
        <Popconfirm title="确认重置所有参数？" description="所有参数将恢复为默认值。" onConfirm={onReset}>
          <Button size="small" danger icon={<ReloadOutlined />} />
        </Popconfirm>
        <Dropdown menu={{ items, onClick: onMenuClick }} trigger={['click']}>
          <Button size="small" ghost icon={<DownloadOutlined />}>导出</Button>
        </Dropdown>
      </Space>
    </div>
  );
};

export default TopBar;
```

- [ ] **Step 2: 写 modals/SaveConfigModal.tsx（antd Modal）**

```typescript
import { Modal, Input } from 'antd';

interface SaveConfigModalProps {
  show: boolean;
  onClose: () => void;
  saveName: string;
  onSaveNameChange: (v: string) => void;
  onSave: () => void;
}

const SaveConfigModal = ({ show, onClose, saveName, onSaveNameChange, onSave }: SaveConfigModalProps) => {
  return (
    <Modal title="保存当前参数" open={show} onOk={onSave} onCancel={onClose} okText="保存" cancelText="取消">
      <Input placeholder="输入配置名称（可选）" value={saveName} onChange={(e) => onSaveNameChange(e.target.value)} autoFocus />
    </Modal>
  );
};

export default SaveConfigModal;
```

- [ ] **Step 3: 写 modals/ImportText.tsx（antd Input.TextArea + Alert）**

文本导入区改为 antd `Input.TextArea`，解析失败行用 `<Alert>` 或 `<Tag color="error">` 提示（保留源 ImportText.jsx 的逐行验证逻辑与 Enter 触发解析）。源文件 41 行，逻辑照搬，UI 换 antd。

- [ ] **Step 4: 写 BottomBar.tsx（antd Button + Tag + Drawer）**

保留源 BottomBar.jsx（178 行）的槽位逻辑（保存当前、槽位条、勾选叠加、⋯ 菜单删除、加载确认 popover），UI 换 antd：
- 「保存当前」→ `<Button type="primary" icon={<PlusOutlined />}>`
- 槽位条 → `<Tag>` 或小 `Button` 组
- 勾选叠加 → `Checkbox`
- ⋯ 菜单 → `Dropdown`（删除项 danger）
- 加载确认 → `Popconfirm`
- 文本导入展开区 → `Drawer`（右侧滑出）替代原来的内联展开

- [ ] **Step 5: 类型检查 + lint**

Run: `npm run typecheck && npm run lint`
Expected: 通过

- [ ] **Step 6: 提交**

```bash
git add src/components/VehicleDesigner/TopBar.tsx src/components/VehicleDesigner/BottomBar.tsx src/components/VehicleDesigner/modals/
git commit -m "feat(designer): 顶栏底栏与弹窗 antd 化

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 10: 主容器 VehicleDesigner.tsx

把三段式布局主容器 TS 化，替换 lucide 依赖，保留 3D 懒加载 + 节流 + 常驻挂载三个性能修复。

**Files:**
- Create: `src/components/VehicleDesigner/VehicleDesigner.tsx`（源 VehicleConfigurator.jsx，251 行）

- [ ] **Step 1: 写 VehicleDesigner.tsx**

结构照搬源文件，改动点：
1. `const Vehicle3D = lazy(() => import('./Vehicle3D'));` 保持不变（懒加载边界）。
2. 删除 `lucide-react` 相关 import（原顶部 `import { Truck, Boxes } from 'lucide-react'` 不再需要，图标已下沉到各子组件）。
3. 底部版权水印「Design By 计皓琛 2025.12」保留（`<Typography.Text type="secondary">`）。
4. 三段式布局：左栏（`ParameterPanel`，宽 384px 滚动）、中栏（画布，`ref={containerRef}`）、右栏（`ResultPanel`）——用 antd `Layout` 或 `Flex` 承载，原 Tailwind 布局类（`flex flex-1 overflow-hidden` 等）可保留（主项目 Tailwind 已含这些类）。
5. 三个视图（side/front/3d）用 `display: none` 常驻切换，**保留 `hasVisited3D` + `params3D` 节流逻辑**（性能修复，不可删）。
6. props 类型补全：`selectedSlots` 为 `Array<{ id: number; params: VehicleParams }>`。

关键片段（节流 + 常驻，照搬源文件逻辑加类型）：

```typescript
const [params3D, setParams3D] = useState<VehicleParams>(params);
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
useEffect(() => {
  timerRef.current = setTimeout(() => setParams3D(params), 100);
  return () => { if (timerRef.current) clearTimeout(timerRef.current); };
}, [params]);
useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
```

- [ ] **Step 2: 类型检查 + lint**

Run: `npm run typecheck && npm run lint`
Expected: 通过

- [ ] **Step 3: 提交**

```bash
git add src/components/VehicleDesigner/VehicleDesigner.tsx
git commit -m "feat(designer): 主容器三段式布局与性能修复保留

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 11: 接入导航与懒加载区块

**Files:**
- Modify: `src/components/Layout/MainLayout.tsx:4,24-57`
- Modify: `src/App.tsx:14-19,117-131`

- [ ] **Step 1: MainLayout 加导航项**

在 `MainLayout.tsx` 顶部 import 加 `CarOutlined`，`items` 数组末尾（`dict` 之后）加一项：

```typescript
{
    key: 'designer',
    icon: <CarOutlined />,
    label: '整车设计',
},
```

import 行改为：
```typescript
import { DatabaseOutlined, DiffOutlined, FormOutlined, SafetyCertificateOutlined, GlobalOutlined, BookOutlined, SunOutlined, MoonOutlined, SettingOutlined, DeleteOutlined, CarOutlined } from '@ant-design/icons';
```

- [ ] **Step 2: App.tsx 加懒加载 import 与区块**

在 `App.tsx` 其他懒加载 import 旁加：

```typescript
const VehicleDesigner = React.lazy(() => import('./components/VehicleDesigner/VehicleDesigner'));
```

在 `MemoConfigManager` 区块之后、`</MainLayout>` 之前加（沿用现有 display:none 常驻模式）：

```tsx
<React.Suspense fallback={<Skeleton active />}>
  <div className="vp-fade-in" style={{ display: activeTab === 'designer' ? undefined : 'none' }}>
    <VehicleDesigner />
  </div>
</React.Suspense>
```

（`VehicleDesigner` 内部有独立的 full-height 布局，故不额外包 memo；若需优化可后续 `React.memo` 包裹。）

- [ ] **Step 3: 更新导航测试**

现有 `src/components/Layout/__tests__/MainLayout.navigation.test.tsx` 可能断言导航项数量或顺序。先读它，若它枚举了所有 tab，则补 `designer` 断言；若仅测特定项则无需改。

- [ ] **Step 4: 类型检查 + lint + 该测试**

Run: `npm run typecheck && npm run lint && npx vitest run src/components/Layout/__tests__/MainLayout.navigation.test.tsx`
Expected: 通过

- [ ] **Step 5: 提交**

```bash
git add src/components/Layout/MainLayout.tsx src/App.tsx src/components/Layout/__tests__/MainLayout.navigation.test.tsx
git commit -m "feat(designer): 整车设计器接入导航与懒加载

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 12: 全量验证与收尾

**Files:** 无（仅验证）

- [ ] **Step 1: 跑完整四连**

Run:
```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: 全部通过。`npm run build` 产物中应看到独立的 `VehicleDesigner` chunk（含 three 链，~1.1MB），入口 chunk 体积不应因本次迁移显著变化（three 走懒加载边界）。

- [ ] **Step 2: 生产构建下人工验证（可选但推荐）**

Run: `npm run build && npm run preview`
检查点：
1. 点「整车设计」导航 → 首次进入显示「正在加载 3D 预览...」，随后侧视 SVG 正常渲染。
2. 切「3D」→ 3D 场景离线可用（字体本地化已生效，无 CDN 请求）。
3. 拖滑杆 → 2D/3D 均流畅（节流生效）。
4. 复制参数 / 导出 CSV / 保存配置 / 文本导入 均可用。

- [ ] **Step 3: 收尾报告**

对照 AGENTS.md 收尾纪律，2-3 行说明：选了什么（独立自洽 + antd 改造 + 保留性能修复）、放弃什么（数据桥接、lucide 风格）、为什么（一期压风险、观感统一）。

---

## Self-Review 备注

- **Spec 覆盖**：用户「评估整合」→ 已落成迁移计划；用户「方案 A」→ 独立自洽 + antd 改造，全 plan 覆盖；性能与包大小关切 → Task 4/10 明确保留懒加载 + 节流 + 常驻，Task 12 验证 chunk 边界。
- **性能坑**：原审计报告 P0#1/#3/#5、P1#4/#6 在 vehicle-config V3.8 已全部修复，本计划**不再重做**，仅在 Task 10 显式标注「不可删」防止迁移中回退。
- **类型一致性**：`handleChange` 统一为 `(key, value)`，Task 7 已注明字符串 key → keyof 的适配点；`selectedSlots` 统一为 `Array<{ id: number; params: VehicleParams }>`；`VehicleParams` 只在 `types.ts` 定义一次。
