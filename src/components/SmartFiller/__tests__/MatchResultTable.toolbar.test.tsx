import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// zustand persist 依赖 localStorage；本环境 Node 的 --localstorage-file 桩缺 setItem，
// 且必须早于 vehicleStore 的 import 生效 → 用 vi.hoisted 提升到 import 之前。
vi.hoisted(() => {
    const store = new Map<string, string>();
    const impl = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() { return store.size; },
    };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: impl });
});

import MatchResultTable from '../MatchResultTable';
import { useVehicleStore } from '../../../store/vehicleStore';
import type { MatchItem } from '../../../types';

/**
 * 批次 1（设计：docs/plans/2026-10-16-列表页设计语言-design.md §7）：
 * 智能填报的工具栏外壳统一走 ListToolbar——此前是「手写 <h3> 标题行 +
 * ListToolbar 只当筛选行」两套壳并存，R7 首次运行即抓到。
 *
 * 这些用例锁住结构契约：标题/计数在 ListToolbar 的 title 段、导出收进下拉、
 * 标题行只留 1 个 primary。
 */

const ITEMS: MatchItem[] = [
    {
        id: 'r1',
        requirementName: '车身颜色',
        matchedParam: { id: 'p1', name: '车身颜色', value: '白色', group: '车身' },
        confidence: 1,
        isManual: false,
    },
    {
        id: 'r2',
        requirementName: '侧门帘',
        matchedParam: { id: 'p2', name: '车身（货厢）侧门', value: '右侧滑门', group: '车身' },
        confidence: 0.67,
        isManual: false,
    },
    {
        id: 'r3',
        requirementName: '未匹配项',
        matchedParam: null,
        confidence: 0,
        isManual: false,
    },
];

beforeEach(() => {
    useVehicleStore.setState({ matchResults: ITEMS });
});

afterEach(() => {
    cleanup();
    useVehicleStore.setState({ matchResults: [] });
});

describe('MatchResultTable 工具条外壳', () => {
    it('不再有手写 <h3> 标题行（R7 的信号）', () => {
        const { container } = render(<MatchResultTable />);
        expect(container.querySelector('h3')).toBeNull();
    });

    it('标题与计数落在 ListToolbar 的 title 段（计数是文字不是标签，§5.2）', () => {
        const { container } = render(<MatchResultTable />);
        expect(container.querySelector('[data-slot="list-title"]')?.textContent).toBe('匹配结果');
        // 未筛选时只给总数
        expect(container.querySelector('[data-slot="list-count"]')?.textContent).toBe('3');
    });

    it('导出按钮收进下拉，标题行只剩 1 个 primary（§5.1）', () => {
        const { container } = render(<MatchResultTable />);
        const bar = container.querySelector('.surface-container.border.rounded-lg');
        expect(bar).not.toBeNull();
        // 标题行（第一段）内 primary 恰好 1 个：车上云模板导出
        const head = bar!.children[0];
        expect(head.querySelectorAll('.ant-btn-primary')).toHaveLength(1);
        expect(head.textContent).toContain('车上云系统模板导出');
        // 导出动作收进下拉，平铺按钮里不再直接出现
        expect(screen.getByText('导出')).toBeInTheDocument();
    });

    it('筛选段的三个控件都在（维度带标签、搜索靠右不带标签，§5.3）', () => {
        render(<MatchResultTable />);
        expect(screen.queryByText('搜索：')).toBeNull();
        expect(screen.getByPlaceholderText(/^搜索参数名、匹配名或值/)).toBeInTheDocument();
        expect(screen.getByText('匹配度：')).toBeInTheDocument();
        expect(screen.getByText('状态：')).toBeInTheDocument();
    });

    it('三段结构：标题行 + 筛选行 + 表格（两条分隔线）', () => {
        const { container } = render(<MatchResultTable />);
        const bar = container.querySelector('.surface-container.border.rounded-lg');
        expect(bar!.querySelectorAll('.border-b')).toHaveLength(2);
    });
});
