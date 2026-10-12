// 回归：新建 / 复制方案后，下拉选中不能被外部取数面板的「方案被删」兜底效果弹回
// 用真实 store（上一版测试 mock 了 store，正是漏掉这个 bug 的原因）
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultBidScheme } from '../../../utils/bidFieldMapping';

// 本环境里 Node 的 --localstorage-file 留了个没有 setItem 的空壳 localStorage，
// 真实 store 的 persist 写盘会抛错。zustand 的 createJSONStorage(() => localStorage)
// 在 store 创建时就解析并存下了该对象，所以必须在 import 之前替换——用 vi.hoisted。
vi.hoisted(() => {
    if (typeof (globalThis.localStorage as Storage | undefined)?.setItem !== 'function') {
        const memory = new Map<string, string>();
        const fakeStorage: Storage = {
            getItem: (k) => memory.get(k) ?? null,
            setItem: (k, v) => void memory.set(k, String(v)),
            removeItem: (k) => void memory.delete(k),
            clear: () => memory.clear(),
            key: (i) => Array.from(memory.keys())[i] ?? null,
            get length() {
                return memory.size;
            },
        };
        Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: fakeStorage });
        Object.defineProperty(window, 'localStorage', { configurable: true, writable: true, value: fakeStorage });
    }
});

const { default: BidPullView } = await import('../BidPullView');
const { useVehicleStore } = await import('../../../store/vehicleStore');

/** 磁盘/缓存里已持久化的方案：只有这一个（新建/复制出来的都还没保存） */
const persistedScheme = createDefaultBidScheme();

vi.mock('../../../utils/bidFieldMapping', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../utils/bidFieldMapping')>();
    return {
        ...actual,
        getBidSchemesSync: () => [persistedScheme],
        saveBidMappingsConfig: vi.fn(async () => true),
        reloadBidMappings: vi.fn(async () => undefined),
    };
});

// 注意：这里刻意不用 getByRole —— 可访问名计算会走 jsdom 的 getComputedStyle 级联，
// 页面里的 Tailwind 任意值类（如 `flex-[1.4]`）会把它带进一个非法选择器而抛错。
// 属于测试环境的坑，与被测行为无关，故按文本找按钮。
const clickButtonByText = (text: string) => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
    if (!btn) throw new Error(`未找到按钮：${text}`);
    fireEvent.click(btn);
};

/** 抽屉里的方案下拉当前显示项（antd 把选中文本写进 title；v6 类名是 content-value） */
const drawerSchemeTitle = (): string | null =>
    document.querySelector('.ant-drawer .ant-select-content-value')?.getAttribute('title') ?? null;

const openDrawer = async () => {
    clickButtonByText('管理方案');
    await waitFor(() => expect(drawerSchemeTitle()).not.toBeNull());
};

describe('BidMappingDrawer 新建/复制方案', () => {
    beforeEach(() => {
        useVehicleStore.setState({ bidPullSchemeId: persistedScheme.id });
    });

    afterEach(() => {
        cleanup();
        useVehicleStore.setState({ bidPullSchemeId: null });
    });

    it('新建方案后下拉停留在新方案上（不被兜底效果弹回）', async () => {
        render(<BidPullView />);
        await openDrawer();
        expect(drawerSchemeTitle()).toBe(`${persistedScheme.name}（13 项）`);

        clickButtonByText('新建');

        await waitFor(() => expect(drawerSchemeTitle()).toBe('投标方案 2（0 项）'));
        expect(screen.getByText('暂无字段规则，可批量添加或在下方逐条新增')).toBeTruthy();
    });

    it('复制方案后下拉停留在副本上', async () => {
        render(<BidPullView />);
        await openDrawer();

        clickButtonByText('复制');

        await waitFor(() => expect(drawerSchemeTitle()).toBe(`${persistedScheme.name} 副本（13 项）`));
    });
});
