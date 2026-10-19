import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// zustand persist 依赖 localStorage；本环境 Node 的 --localstorage-file 桩缺 setItem，
// 且必须早于 store 的 import 生效 → 用 vi.hoisted 提升到 import 之前。
vi.hoisted(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
            setItem: (k: string, v: string) => { store.set(k, String(v)); },
            removeItem: (k: string) => { store.delete(k); },
            clear: () => { store.clear(); },
            key: (i: number) => Array.from(store.keys())[i] ?? null,
            get length() { return store.size; },
        },
    });
});

import DataPurifyView from '../DataPurifyView';
import { useVehicleStore } from '../../../store/vehicleStore';

/**
 * 批次 5（设计：docs/plans/2026-10-16-列表页设计语言-design.md §7）：
 * 数据体检是 FilterBar 的最后一个外壳消费方。
 *
 * 结构契约：外壳走 ListToolbar 三段、搜索走 SearchInput、
 * 快捷筛选由变色主按钮改 FacetChips、保存按钮不再硬编码调色板色。
 */

afterEach(() => {
    cleanup();
    useVehicleStore.setState({ selectedProductNames: [], assetLibraryPath: null });
});

describe('数据体检 工具条（批次 5）', () => {
    const renderIt = () => {
        useVehicleStore.setState({ assetLibraryPath: '/tmp/lib' } as never);
        return render(<DataPurifyView />);
    };

    it('外壳是 ListToolbar，不再是 FilterBar', () => {
        const { container } = renderIt();
        const bar = container.querySelector('.surface-container.border.rounded-lg');
        expect(bar).not.toBeNull();
        expect(screen.getByText('体检参数')).toBeInTheDocument();
    });

    it('搜索走 SearchInput（固定带搜索图标），不带「搜索：」标签（列表区设计语言 §5.3）', () => {
        const { container } = renderIt();
        expect(screen.queryByText('搜索：')).toBeNull();
        expect(screen.getByPlaceholderText('搜索参数名、分组或参数值')).toBeInTheDocument();
        expect(container.querySelector('.ant-input-affix-wrapper .anticon-search')).not.toBeNull();
    });

    it('快捷筛选是 chip，不再是变色主按钮', () => {
        const { container } = renderIt();
        expect(screen.getByText('快捷：')).toBeInTheDocument();
        // FacetChips 渲染 chip-md 的 Tag
        expect(container.querySelectorAll('.ant-tag.chip-md').length).toBeGreaterThan(0);
        // 异常状态以 chip 呈现，而非默认选中态的实心主按钮。
        // 测试环境无资产目录 → 词表为空 → 不判字段名，chip 显示「未配置词表」且不可点
        const chip = screen.getByText('未配置词表').closest('.ant-tag')!;
        expect(chip.getAttribute('aria-disabled')).toBe('true');
        expect(screen.queryByText('发现异常')).toBeNull();
    });

    it('保存按钮不再硬编码 Tailwind 调色板色（绕过 token）', () => {
        const { container } = renderIt();
        const html = container.innerHTML;
        expect(html).not.toContain('bg-orange-');
        expect(html).not.toContain('bg-green-');
        expect(screen.getByText('保存至资产库')).toBeInTheDocument();
    });

    it('三段成段：标题行 + 筛选行 + 显示选项行', () => {
        const { container } = renderIt();
        const bar = container.querySelector('.surface-container.border.rounded-lg')!;
        // 三段 + 主体（表格）相邻 → 3 条分隔线
        expect(bar.querySelectorAll('.border-b')).toHaveLength(3);
        // 显示选项段含分组/字段组/快捷
        const rows = [...bar.children];
        const displayRow = rows[2];
        expect(displayRow.textContent).toContain('分组');
        expect(displayRow.textContent).toContain('快捷');
    });
});
