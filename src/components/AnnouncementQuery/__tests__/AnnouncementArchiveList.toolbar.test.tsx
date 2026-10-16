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

import AnnouncementArchiveList from '../AnnouncementArchiveList';

/**
 * 批次 2（设计：docs/plans/2026-10-16-列表页设计语言-design.md §7）：
 * 公告归档是「最简单的对照组」——已用 ListToolbar，只需按 §5.1 收敛按钮。
 *
 * 未设资产库路径时组件渲染 Empty，工具条本身仍会渲染，足够断言结构。
 */

afterEach(() => cleanup());

describe('公告归档 工具条', () => {
    it('用 ListToolbar 作外壳，不套 Card（§4.3）', () => {
        const { container } = render(<AnnouncementArchiveList />);
        expect(container.querySelector('.ant-card')).toBeNull();
        expect(screen.getByText('公告归档')).toBeInTheDocument();
    });

    it('导航不出现 0 行骨架（无资产库时给 Empty 而非空白）', () => {
        render(<AnnouncementArchiveList />);
        expect(screen.getByText('请先在数据源面板设置资产库目录')).toBeInTheDocument();
    });

    it('导入类动作收进下拉，标题行不抢 primary（§5.1 / Q19）', () => {
        const { container } = render(<AnnouncementArchiveList />);
        const bar = container.querySelector('.surface-container.border.rounded-lg');
        expect(bar).not.toBeNull();
        const head = bar!.children[0];
        // primary 只给「产出/终点动作」；本页主任务是浏览治理，导入属过程动作，
        // 故标题行 0 个 primary——「页面没有 primary」是合法状态（规范 §5.1 Q19）
        expect(head.querySelectorAll('.ant-btn-primary')).toHaveLength(0);
        expect(head.textContent).toContain('导入');
        // 三个导入动作不再平铺
        expect(head.textContent).not.toContain('批量导入 PDF');
        expect(head.textContent).not.toContain('从资产库迁移公告数据');
    });

    it('刷新按钮为图标 + Tooltip，不是带文字的按钮', () => {
        const { container } = render(<AnnouncementArchiveList />);
        const bar = container.querySelector('.surface-container.border.rounded-lg');
        const head = bar!.children[0];
        const iconBtn = head.querySelector('.anticon-reload')?.closest('button');
        expect(iconBtn).not.toBeNull();
        // 纯图标：按钮文字里不含「刷新」
        expect(iconBtn!.textContent ?? '').not.toContain('刷新');
    });

    it('筛选段的视图切换与 chips 就位（控件唯一形态）', () => {
        render(<AnnouncementArchiveList />);
        expect(screen.getByText('分组')).toBeInTheDocument();
        expect(screen.getByText('平铺')).toBeInTheDocument();
        expect(screen.getByText('全部')).toBeInTheDocument();
        expect(screen.getByText('有关联资产')).toBeInTheDocument();
    });

    it('三段结构：标题行 + 筛选行（两条分隔线）', () => {
        const { container } = render(<AnnouncementArchiveList />);
        const bar = container.querySelector('.surface-container.border.rounded-lg');
        expect(bar!.querySelectorAll('.border-b')).toHaveLength(2);
    });
});
