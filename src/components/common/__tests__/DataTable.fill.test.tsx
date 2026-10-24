import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DataTable from '../DataTable';
import ListToolbar from '../ListToolbar';

/**
 * 表头固定（设计：docs/plans/2026-10-23-列表页表头固定-design.md §2）。
 *
 * 机制：`DataTable fill` 量包裹层高度 → 交给 antd 的 `scroll.y`，antd 据此把表头
 * 拆成独立节点（`.ant-table-header`）并给表体加 `max-height`。表头留在原地、只有
 * 表体滚动，就是「锁定表头」本身。
 *
 * jsdom 不做布局，所以这里直接给包裹层与表头/分页桩上尺寸，断言「量出来的高度
 * 确实交给了 scroll.y」——这是唯一能在单测里锁住的不变量；真机效果在浏览器预览里核对。
 */

const COLUMNS = [
    { title: '名称', dataIndex: 'name' },
    { title: '值', dataIndex: 'value' },
];

const ROWS = Array.from({ length: 30 }, (_, i) => ({ key: `r${i}`, name: `参数${i}`, value: `值${i}` }));

/** 给元素桩 clientHeight / offsetHeight（jsdom 默认全 0） */
const stubSize = (el: Element, height: number) => {
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: height });
    Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height });
};

beforeEach(() => {
    // 页签可见性：没有 Provider 时默认可见（见 hooks/useModuleActive）
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body);
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('DataTable fill（撑满外层、表头固定）', () => {
    it('未量到高度前不传 scroll.y：表格按内容自然高', () => {
        const { container } = render(<DataTable columns={COLUMNS} dataSource={ROWS} fill />);
        // 没有 scroll.y 就没有固定表头节点
        expect(container.querySelector('.ant-table-header')).toBeNull();
        // 包裹层是「吃掉剩余高度」的那层：flex-1 + min-h-0 + overflow-hidden
        const wrap = container.querySelector('.ant-table-wrapper')!.parentElement!;
        expect(wrap.className).toContain('flex-1');
        expect(wrap.className).toContain('min-h-0');
        expect(wrap.className).toContain('overflow-hidden');
    });

    it('量到包裹层高度后交给 scroll.y（表体得到 max-height，表头被拆成固定节点）', async () => {
        const { container, rerender } = render(<DataTable columns={COLUMNS} dataSource={ROWS} fill />);
        const wrap = container.querySelector('.ant-table-wrapper')!.parentElement!;
        stubSize(wrap, 400);
        window.dispatchEvent(new Event('resize'));

        await waitFor(() => {
            const body = container.querySelector<HTMLElement>('.ant-table-body');
            expect(body?.getAttribute('style') ?? '').toContain('max-height');
        });
        // 表体上限 = 包裹层 400 − 表头 − 分页（jsdom 里都没有布局盒，故只剩 400 减去 0）
        const limit = Number(
            /max-height:\s*(\d+)px/.exec(
                container.querySelector<HTMLElement>('.ant-table-body')!.getAttribute('style') ?? '',
            )?.[1],
        );
        expect(limit).toBeGreaterThan(0);
        expect(limit).toBeLessThanOrEqual(400);
        // scroll.y 一到位，antd 就把表头拆成独立节点——这就是「锁定表头」
        expect(container.querySelector('.ant-table-header')).not.toBeNull();

        // 再给一个显式 scrollY 覆盖，行为回到旧口径
        rerender(<DataTable columns={COLUMNS} dataSource={ROWS} fill scrollY={200} />);
        await waitFor(() => {
            expect(
                container.querySelector<HTMLElement>('.ant-table-body')!.getAttribute('style') ?? '',
            ).toContain('max-height: 200px');
        });
    });

    it('不传 fill 时不介入：没有包裹层，也不写 scroll.y', () => {
        const { container } = render(<DataTable columns={COLUMNS} dataSource={ROWS} />);
        const wrap = container.querySelector('.ant-table-wrapper')!.parentElement!;
        expect(wrap.className).not.toContain('flex-1');
        expect(container.querySelector('.ant-table-header')).toBeNull();
    });

    it('显式 scrollY 优先于实测值（存量调用点行为不变）', () => {
        const { container } = render(
            <DataTable columns={COLUMNS} dataSource={ROWS} fill scrollY={222} />,
        );
        const body = container.querySelector<HTMLElement>('.ant-table-body');
        expect(body?.getAttribute('style')).toContain('max-height: 222px');
    });
});

describe('ListToolbar fill', () => {
    it('fill 时外壳吃掉外层剩余高度，主体层也带 min-h-0/overflow-hidden', () => {
        const { container } = render(
            <ListToolbar fill title="列表" filters={<span>筛选</span>}>
                <div>表格</div>
            </ListToolbar>,
        );
        const shell = container.firstElementChild as HTMLElement;
        expect(shell.className).toContain('flex-1');
        expect(shell.className).toContain('min-h-0');
        expect(shell.className).toContain('overflow-hidden');
        const body = shell.lastElementChild as HTMLElement;
        expect(body.className).toContain('flex-1');
        expect(body.className).toContain('min-h-0');
        expect(body.className).toContain('overflow-hidden');
    });

    it('不传 fill 时外壳随内容增高（整页滚动的页面行为不变）', () => {
        const { container } = render(
            <ListToolbar title="列表">
                <div>表格</div>
            </ListToolbar>,
        );
        const shell = container.firstElementChild as HTMLElement;
        expect(shell.className).not.toContain('flex-1');
    });
});
