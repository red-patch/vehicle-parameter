import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// zustand persist 依赖 localStorage；本环境 Node 的 --localstorage-file 桩缺 setItem，
// 且必须早于 store 的 import 生效 → 用 vi.hoisted 提升到 import 之前。
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
 * 快捷筛选可恢复（设计：docs/plans/2026-10-19-quick-filter-chips-design.md）。
 *
 * 回归的问题：选中「枚举异常」后没有任何可见的退路——再点同一个 chip 回传的仍是
 * 同一个值，表格停在 2 行；用户只能刷新页面。
 */

const ITEMS: MatchItem[] = [
    {
        id: 'r1',
        requirementName: '整备质量',
        matchedParam: { id: 'p1', name: '整备质量', value: '1500', group: '基本参数' },
        confidence: 1,
        isManual: false,
    },
    {
        id: 'r2',
        requirementName: '最高车速',
        matchedParam: { id: 'p2', name: '最高车速', value: '120', group: '基本参数' },
        confidence: 1,
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

describe('匹配结果 快捷筛选的退路', () => {
    it('「枚举异常」chip 可再点一次取消（不是原地不动）', () => {
        render(<MatchResultTable />);
        const chip = () => screen.getByText('枚举异常').closest('.ant-tag')!;

        fireEvent.click(chip());
        expect(chip().getAttribute('aria-pressed')).toBe('true');

        fireEvent.click(chip());
        expect(chip().getAttribute('aria-pressed')).toBe('false');
    });

    it('有筛选时出现「清除筛选」，点了回到全量', () => {
        render(<MatchResultTable />);
        expect(screen.queryByText('清除筛选')).toBeNull();

        fireEvent.click(screen.getByText('枚举异常'));
        const clear = screen.getByText('清除筛选');
        expect(clear).toBeInTheDocument();

        fireEvent.click(clear);
        expect(screen.queryByText('清除筛选')).toBeNull();
    });
});
