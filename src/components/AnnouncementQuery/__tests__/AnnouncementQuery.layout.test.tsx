import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

import AnnouncementQuery from '../AnnouncementQuery';

// jsdom 没有 Tauri 运行时（window.__TAURI_INTERNALS__ 不存在），组件挂载时的窗口事件监听
// 会失败——生产代码已 .catch 兜住；这里再拦一道，免得测试输出里尽是噪音。
vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({ listen: async () => () => {} }),
}));

/**
 * 布局（设计：docs/plans/2026-10-23-列表页表头固定-design.md §3）：
 *
 * 此前顶部是 Steps + 「查询公告号」「粘贴导入」两张常驻 Card，约 290px；
 * 800px 高的窗口里被吃掉四成，而主体（公告归档）只剩半屏且没有固定表头。
 * 现压成一行：查询留在行内，粘贴导入 / 提取工具进抽屉。
 *
 * 这些断言锁的是「别再长回去」，不是像素。
 */

afterEach(() => cleanup());

describe('公告中心 顶部操作区', () => {
    it('顶部不再有 Card 与 Steps，查询入口留在行内', () => {
        const { container } = render(<AnnouncementQuery />);
        expect(container.querySelector('.ant-card')).toBeNull();
        expect(container.querySelector('.ant-steps')).toBeNull();
        // 查询入口仍是一等公民：输入框 + 查询按钮同行
        expect(screen.getByPlaceholderText('输入车辆公告号，本地优先')).toBeInTheDocument();
        // antd 默认按钮自动插空格（「查 询」），故用宽松匹配
        expect(screen.getByRole('button', { name: /查\s*询/ })).toBeInTheDocument();
    });

    it('粘贴导入是抽屉入口：点开才出现文本框与分流说明', async () => {
        render(<AnnouncementQuery />);
        expect(screen.queryByPlaceholderText('粘贴书签脚本复制的JSON数据...')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /粘贴导入/ }));

        const drawer = await screen.findByRole('dialog');
        expect(within(drawer).getByPlaceholderText('粘贴书签脚本复制的JSON数据...')).toBeInTheDocument();
        // 三步流程说明随入口一起搬进抽屉（需要时能看到，不需要时不占版面）
        expect(drawer.textContent).toContain('打开工信部公告详情页');
        expect(drawer.textContent).toContain('提取工具');
    });

    it('提取工具是独立抽屉入口，不在顶部平铺书签代码', () => {
        render(<AnnouncementQuery />);
        expect(screen.queryByText('方法一：拖拽安装')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /提取工具/ }));
        expect(screen.getByText('方法一：拖拽安装')).toBeInTheDocument();
    });
});
