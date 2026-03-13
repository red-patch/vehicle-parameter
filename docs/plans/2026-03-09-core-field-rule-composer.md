# Core Field Rule Composer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current tag-only core field configuration UI with a search-driven rule composer that makes adding, reviewing, removing, and bulk importing rule fields fast and understandable.

**Architecture:** Keep the existing `ConfigManagerView` route and persistence format (`custom_fields.json`), but replace the current `Select mode="tags"` experience with a dedicated composer for the two rule sets: `systemRequired` and `qualityCheck`. Introduce a pure helper layer for token parsing, dedupe, and search ranking, then compose a focused React UI around those helpers so the behavior is testable without coupling everything to Ant Design internals.

**Tech Stack:** React 19, TypeScript, Ant Design 6, Zustand, Vitest, React Testing Library, jsdom, Vite.

---

### Task 1: Add Focused Frontend Test Harness

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/components/SmartFiller/__tests__/coreFieldRules.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { parseFieldBatchInput } from '../coreFieldRules';

describe('parseFieldBatchInput', () => {
  it('splits mixed separators and removes duplicates', () => {
    const result = parseFieldBatchInput('快充\n慢充, 快充，电池包');
    expect(result).toEqual(['快充', '慢充', '电池包']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SmartFiller/__tests__/coreFieldRules.test.ts`
Expected: FAIL with module not found for `../coreFieldRules` or missing `vitest` setup.

**Step 3: Write minimal implementation support**

Add the minimum tooling only:

```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "jsdom": "^25.0.1",
    "vitest": "^2.1.9"
  }
}
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom';
```

**Step 4: Run test to verify it still fails for the right reason**

Run: `npm run test -- src/components/SmartFiller/__tests__/coreFieldRules.test.ts`
Expected: FAIL only because `coreFieldRules.ts` does not exist yet.

**Step 5: Commit**

```bash
git add package.json vite.config.ts src/test/setup.ts src/components/SmartFiller/__tests__/coreFieldRules.test.ts
git commit -m "test: add frontend harness for config composer"
```

### Task 2: Build Pure Field Rule Helpers

**Files:**
- Create: `src/components/SmartFiller/coreFieldRules.ts`
- Modify: `src/components/SmartFiller/__tests__/coreFieldRules.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  parseFieldBatchInput,
  normalizeFieldName,
  buildFieldSearchResults,
} from '../coreFieldRules';

describe('normalizeFieldName', () => {
  it('trims whitespace and keeps visible text stable', () => {
    expect(normalizeFieldName('  快充  ')).toBe('快充');
  });
});

describe('buildFieldSearchResults', () => {
  it('orders exact, prefix, and fuzzy matches', () => {
    const result = buildFieldSearchResults('快', ['快充', '慢充', '快充接口'], ['快充']);
    expect(result.map(item => item.name)).toEqual(['快充', '快充接口']);
    expect(result[0].alreadySelected).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/SmartFiller/__tests__/coreFieldRules.test.ts`
Expected: FAIL because helpers are not implemented.

**Step 3: Write minimal implementation**

```ts
export interface FieldSearchResult {
  name: string;
  alreadySelected: boolean;
  score: number;
}

export const normalizeFieldName = (value: string) => value.trim();

export const parseFieldBatchInput = (input: string): string[] => {
  const seen = new Set<string>();
  return input
    .split(/[\n,，；;]+/)
    .map(normalizeFieldName)
    .filter(Boolean)
    .filter(name => {
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
};

export const buildFieldSearchResults = (
  keyword: string,
  candidates: string[],
  selected: string[]
): FieldSearchResult[] => {
  const normalizedKeyword = normalizeFieldName(keyword).toLowerCase();
  if (!normalizedKeyword) return [];

  return candidates
    .filter(name => name.toLowerCase().includes(normalizedKeyword))
    .map(name => ({
      name,
      alreadySelected: selected.includes(name),
      score: name === keyword ? 0 : name.startsWith(keyword) ? 1 : 2,
    }))
    .sort((left, right) => left.score - right.score || left.name.localeCompare(right.name, 'zh-CN'));
};
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/SmartFiller/__tests__/coreFieldRules.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/SmartFiller/coreFieldRules.ts src/components/SmartFiller/__tests__/coreFieldRules.test.ts
git commit -m "feat: add core field rule helper utilities"
```

### Task 3: Create Core Field Rule Composer Component

**Files:**
- Create: `src/components/SmartFiller/CoreFieldRuleComposer.tsx`
- Create: `src/components/SmartFiller/__tests__/CoreFieldRuleComposer.test.tsx`
- Modify: `src/components/SmartFiller/coreFieldRules.ts`

**Step 1: Write the failing component tests**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CoreFieldRuleComposer from '../CoreFieldRuleComposer';

describe('CoreFieldRuleComposer', () => {
  it('adds a suggested field into selected list', async () => {
    const onChange = vi.fn();
    render(
      <CoreFieldRuleComposer
        title="系统必填规则"
        description="desc"
        selectedFields={[]}
        candidateFields={['快充', '慢充']}
        recentFields={[]}
        onChange={onChange}
      />
    );

    await userEvent.type(screen.getByPlaceholderText('搜索字段并加入规则'), '快');
    await userEvent.click(screen.getByRole('button', { name: '加入 快充' }));

    expect(onChange).toHaveBeenCalledWith(['快充']);
  });

  it('imports fields from batch paste', async () => {
    const onChange = vi.fn();
    render(
      <CoreFieldRuleComposer
        title="质量验车规则"
        description="desc"
        selectedFields={['快充']}
        candidateFields={['快充', '慢充', '动力电池包厂商']}
        recentFields={[]}
        onChange={onChange}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '批量导入' }));
    await userEvent.type(screen.getByPlaceholderText('粘贴字段列表，支持换行、逗号、分号'), '慢充\n动力电池包厂商');
    await userEvent.click(screen.getByRole('button', { name: '导入并去重' }));

    expect(onChange).toHaveBeenCalledWith(['快充', '慢充', '动力电池包厂商']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/SmartFiller/__tests__/CoreFieldRuleComposer.test.tsx`
Expected: FAIL because component does not exist.

**Step 3: Write minimal implementation**

Create a focused component with four areas only:

```tsx
interface Props {
  title: string;
  description: string;
  selectedFields: string[];
  candidateFields: string[];
  recentFields: string[];
  onChange: (next: string[]) => void;
}
```

Implementation requirements:
- Search input with placeholder `搜索字段并加入规则`
- Search result list rendered as buttons with accessible labels like `加入 快充`
- Selected field chip area with remove buttons
- `批量导入` collapse section with a textarea and `导入并去重` button
- Utility actions: `去重`, `排序`, `清空`
- Empty state when no search keyword is entered and no recent fields exist

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/components/SmartFiller/__tests__/CoreFieldRuleComposer.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/SmartFiller/CoreFieldRuleComposer.tsx src/components/SmartFiller/__tests__/CoreFieldRuleComposer.test.tsx src/components/SmartFiller/coreFieldRules.ts
git commit -m "feat: add core field rule composer component"
```

### Task 4: Integrate Composer into Config Manager

**Files:**
- Modify: `src/components/SmartFiller/ConfigManagerView.tsx`
- Test: `src/components/SmartFiller/__tests__/ConfigManagerView.core-fields.test.tsx`

**Step 1: Write the failing integration test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConfigManagerView from '../ConfigManagerView';

vi.mock('../../store/vehicleStore', () => ({
  useVehicleStore: () => ({ assetLibraryPath: '/tmp/assets' })
}));

vi.mock('../../utils/fieldLists', () => ({
  getSystemRequiredFieldsSync: () => ['快充'],
  getQualityCheckFieldsSync: () => ['动力电池包厂商'],
  reloadCustomFields: vi.fn(),
}));

vi.mock('../../utils/attributeEnums', () => ({
  preloadEnumData: vi.fn().mockResolvedValue(undefined),
  getAllAttributeNames: () => ['快充', '慢充', '动力电池包厂商'],
  getEnumValuesSync: () => [],
  isEnumDataLoaded: () => true,
}));

describe('ConfigManagerView core fields tab', () => {
  it('renders the composer-driven core field layout', async () => {
    render(<ConfigManagerView />);
    await userEvent.click(screen.getByRole('tab', { name: '核心字段配置' }));
    expect(screen.getByPlaceholderText('搜索字段并加入规则')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存并应用' })).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/SmartFiller/__tests__/ConfigManagerView.core-fields.test.tsx`
Expected: FAIL because current core fields tab still renders `Select mode="tags"`.

**Step 3: Write minimal integration**

Replace only the `fields` tab body with:
- a segmented sub-switch or simple block split between `系统必填规则` and `质量验车规则`
- two instances of `CoreFieldRuleComposer`
- candidate field source built from `getAllAttributeNames()` plus current selected fields
- `recentFields` held in local state only for this screen
- footer button text changed to `保存并应用`

Minimal example shape:

```tsx
const candidateFields = useMemo(() => {
  const merged = new Set([...getAllAttributeNames(), ...editSysFields, ...editQualFields]);
  return Array.from(merged).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}, [editSysFields, editQualFields, loading]);
```

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/components/SmartFiller/__tests__/ConfigManagerView.core-fields.test.tsx`
Expected: PASS

Then run the focused suite:

Run: `npm run test -- src/components/SmartFiller/__tests__/coreFieldRules.test.ts src/components/SmartFiller/__tests__/CoreFieldRuleComposer.test.tsx src/components/SmartFiller/__tests__/ConfigManagerView.core-fields.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/SmartFiller/ConfigManagerView.tsx src/components/SmartFiller/__tests__/ConfigManagerView.core-fields.test.tsx
 git commit -m "feat: redesign core field configuration workflow"
```

### Task 5: Polish Search, Messaging, and Bulk Operations

**Files:**
- Modify: `src/components/SmartFiller/CoreFieldRuleComposer.tsx`
- Modify: `src/components/SmartFiller/__tests__/CoreFieldRuleComposer.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('shows duplicate and imported counts after batch import', async () => {
  render(/* composer with 快充 already selected */);
  await userEvent.click(screen.getByRole('button', { name: '批量导入' }));
  await userEvent.type(screen.getByPlaceholderText('粘贴字段列表，支持换行、逗号、分号'), '快充\n慢充');
  await userEvent.click(screen.getByRole('button', { name: '导入并去重' }));
  expect(screen.getByText('新增 1 项，重复 1 项')).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/SmartFiller/__tests__/CoreFieldRuleComposer.test.tsx`
Expected: FAIL because import summary message is missing.

**Step 3: Write minimal implementation**

Add only these UX refinements:
- batch import summary text: `新增 X 项，重复 Y 项`
- `未找到结果` empty state for search
- `已选字段数` count badge
- keep the last search keyword after add, do not clear unexpectedly

**Step 4: Run tests to verify they pass**

Run: `npm run test -- src/components/SmartFiller/__tests__/CoreFieldRuleComposer.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/SmartFiller/CoreFieldRuleComposer.tsx src/components/SmartFiller/__tests__/CoreFieldRuleComposer.test.tsx
git commit -m "feat: polish core field composer interactions"
```

### Task 6: Final Validation and Docs Touch-Up

**Files:**
- Modify: `docs/User_Manual.md`
- Modify: `docs/User_Manual_Lite.md`

**Step 1: Write the documentation change**

Update the `系统配置 > 核心字段配置` section to describe:
- search-driven field adding
- batch paste import
- sorting and dedupe tools
- save/apply workflow

Suggested replacement snippet:

```md
系统配置中的核心字段配置采用搜索驱动模式：
1. 在搜索框输入字段名
2. 从候选结果中点击加入规则
3. 或通过批量导入一次性粘贴字段列表
4. 使用去重、排序、清空工具整理字段池
5. 点击“保存并应用”立即生效
```

**Step 2: Run validation commands**

Run: `npm run test -- src/components/SmartFiller/__tests__/coreFieldRules.test.ts src/components/SmartFiller/__tests__/CoreFieldRuleComposer.test.tsx src/components/SmartFiller/__tests__/ConfigManagerView.core-fields.test.tsx`
Expected: PASS

Run: `npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add docs/User_Manual.md docs/User_Manual_Lite.md
git commit -m "docs: update config workflow documentation"
```

### Notes for the Implementer

- Do not redesign the `枚举字典配置` tab in this plan. Keep scope limited to `核心字段配置`.
- Do not change the persisted file shape of `custom_fields.json`.
- Do not add drag-and-drop ordering unless the user asks for it later.
- Keep the component language consistent with the existing UI: Chinese labels, English internal identifiers.
- Prefer pure helper functions for parsing and search so they can be tested without rendering the whole screen.
- Reuse Ant Design primitives already present in the codebase; do not introduce a new UI framework.
