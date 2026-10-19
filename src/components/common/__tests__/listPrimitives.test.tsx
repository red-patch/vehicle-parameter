import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeleteOutlined, EditOutlined, EyeOutlined, FilePdfOutlined } from '@ant-design/icons';
import RowActions, { type RowAction } from '../RowActions';
import StatusDot from '../StatusDot';
import CountLabel from '../CountLabel';
import ListToolbar from '../ListToolbar';
import {
    compactPagination,
    COMPACT_PAGE_SIZE,
    formatListCount,
    PAGE_SIZE,
    PAGE_SIZE_OPTIONS,
    pagePagination,
} from '../tablePresets';

/**
 * 列表区共享原语单测（设计：docs/plans/2026-10-17-列表区统一设计语言-design.md §5–§9）。
 * 这些构件的价值在「规格不是自由度」，所以测的是规格本身。
 */

afterEach(() => cleanup());

const act = (key: string, extra: Partial<RowAction> = {}): RowAction => ({
    key,
    label: key,
    icon: <EyeOutlined />,
    onClick: vi.fn(),
    ...extra,
});

describe('tablePresets（§6 分页只有两种）', () => {
    it('页面主列表：每页 50、20/50/100 切换器、显示总数', () => {
        const p = pagePagination();
        expect(p.defaultPageSize).toBe(PAGE_SIZE);
        expect(PAGE_SIZE).toBe(50);
        expect(p.showSizeChanger).toBe(true);
        expect(p.pageSizeOptions).toEqual(PAGE_SIZE_OPTIONS);
        expect(typeof p.showTotal).toBe('function');
        expect((p.showTotal as (t: number, r: [number, number]) => string)(26, [1, 26])).toContain('26');
    });

    it('弹窗 / 抽屉：每页 20、无切换器、单页隐藏', () => {
        const p = compactPagination();
        expect(p.defaultPageSize).toBe(COMPACT_PAGE_SIZE);
        expect(COMPACT_PAGE_SIZE).toBe(20);
        expect(p.showSizeChanger).toBe(false);
        expect(p.hideOnSinglePage).toBe(true);
    });

    it('overrides 只覆盖传入项', () => {
        const p = pagePagination({ current: 3 });
        expect(p.current).toBe(3);
        expect(p.defaultPageSize).toBe(PAGE_SIZE);
    });
});

describe('formatListCount（§5.2 计数是文字不是标签）', () => {
    it('未筛选只给总数', () => {
        expect(formatListCount(26).text).toBe('26');
        expect(formatListCount({ shown: 26, total: 26 }).text).toBe('26');
    });
    it('筛选后给「显示 / 总数」', () => {
        const r = formatListCount({ shown: 17, total: 26 });
        expect(r.text).toBe('17 / 26');
        expect(r.title).toContain('17');
        expect(r.title).toContain('26');
    });
});

describe('ListToolbar 标题 + 计数 + 副标题（§5.2）', () => {
    it('字符串标题由组件排版，计数紧随其后', () => {
        const { container } = render(<ListToolbar title="法规标准" count={{ shown: 3, total: 9 }} subtitle="D:/lib" />);
        const title = container.querySelector('[data-slot="list-title"]');
        expect(title?.textContent).toBe('法规标准');
        expect(container.querySelector('[data-slot="list-count"]')?.textContent).toBe('3 / 9');
        expect(container.querySelector('[data-slot="list-subtitle"]')?.textContent).toBe('D:/lib');
        // 统一壳：表格贴边的圆角由 .list-shell 接管
        expect(container.firstElementChild?.classList.contains('list-shell')).toBe(true);
    });

    it('不传 count 时不渲染计数位', () => {
        const { container } = render(<ListToolbar title="体检参数" />);
        expect(container.querySelector('[data-slot="list-count"]')).toBeNull();
    });
});

describe('RowActions（§8 行内操作）', () => {
    it('图标按钮必带 aria-label；不超过 maxVisible+1 时不折叠', () => {
        render(<RowActions actions={[act('查看'), act('编辑'), act('删除')]} />);
        expect(screen.getByRole('button', { name: '查看' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '更多操作' })).toBeNull();
    });

    it('超过 maxVisible+1 个时，其余收进「更多操作」且可触发', async () => {
        const last = act('导出PDF', { icon: <FilePdfOutlined /> });
        render(<RowActions actions={[act('查看'), act('编辑'), act('复制'), last]} />);
        expect(screen.queryByRole('button', { name: '复制' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
        const item = await screen.findByText('导出PDF');
        fireEvent.click(item);
        expect(last.onClick).toHaveBeenCalledTimes(1);
    });

    it('破坏性动作常态中性、悬停转红：只挂 row-action-danger，不用 antd danger 红', () => {
        render(<RowActions actions={[act('删除', { danger: true, icon: <DeleteOutlined /> })]} />);
        const btn = screen.getByRole('button', { name: '删除' });
        expect(btn.className).toContain('row-action-danger');
        expect(btn.className).not.toContain('ant-btn-dangerous');
    });

    it('confirm：先弹确认，确定后才执行', async () => {
        const del = act('删除', { danger: true, confirm: '确定删除此参数？' });
        render(<RowActions actions={[del]} />);
        fireEvent.click(screen.getByRole('button', { name: '删除' }));
        expect(del.onClick).not.toHaveBeenCalled();
        await screen.findByText('确定删除此参数？');
        fireEvent.click(screen.getByRole('button', { name: /确\s*定/ }));
        await waitFor(() => expect(del.onClick).toHaveBeenCalledTimes(1));
    });

    it('showLabel 显示文字；点击不冒泡到行', () => {
        const onRow = vi.fn();
        const edit = act('认领建档', { showLabel: true, icon: <EditOutlined /> });
        render(
            <div onClick={onRow}>
                <RowActions actions={[edit]} />
            </div>,
        );
        const btn = screen.getByRole('button', { name: '认领建档' });
        expect(btn.textContent).toContain('认领建档');
        fireEvent.click(btn);
        expect(edit.onClick).toHaveBeenCalledTimes(1);
        expect(onRow).not.toHaveBeenCalled();
    });

    it('禁用态保留占位（不隐藏）', () => {
        render(<RowActions actions={[act('编辑', { disabled: true, disabledReason: '只读' })]} />);
        expect(screen.getByRole('button', { name: '编辑' })).toBeDisabled();
    });
});

describe('StatusDot / CountLabel（§9 / §5.2）', () => {
    it('StatusDot = 6px 圆点 + 文字，tone 落到 data-tone 与语义色变量', () => {
        const { container } = render(<StatusDot tone="danger">废止</StatusDot>);
        const root = container.querySelector('[data-tone="danger"]') as HTMLElement;
        expect(root.textContent).toBe('废止');
        const dot = root.querySelector('[aria-hidden]') as HTMLElement;
        expect(dot.style.width).toBe('6px');
        expect(dot.style.backgroundColor).toContain('--danger');
    });

    it('neutral 档文字降为三级色，其余档保持正文色', () => {
        const { container } = render(
            <>
                <StatusDot tone="neutral">草案</StatusDot>
                <StatusDot tone="success">现行</StatusDot>
            </>,
        );
        expect(container.querySelector('[data-tone="neutral"]')?.className).toContain('text-3');
        expect(container.querySelector('[data-tone="success"]')?.className).toContain('text-1');
    });

    it('CountLabel：数字跟在文字后、无括号', () => {
        const { container } = render(<CountLabel label="全部" count={26} />);
        expect(container.textContent).toBe('全部26');
        expect(container.textContent).not.toMatch(/[()（）]/);
        expect(container.querySelector('.tabular-nums')?.textContent).toBe('26');
    });
});

describe('DataTable 长内容列（§3.4，真实数据回归）', () => {
    const rows = [{ key: '1', name: '外扩尺寸', a: '5920;5995;5945×1995;2000;2020;2050;2070×2300;2350;2800' }];

    it('有 ellipsis 列时强制 fixed 布局，横向宽度 = 列宽之和（不被长表头撑开）', async () => {
        const { default: DataTable } = await import('../DataTable');
        const { default: ColumnTitle } = await import('../ColumnTitle');
        const longName = '智云S300 宁德时代新能源科技股份有限公司 100.07 SX5047CCYBEV341N III1';
        const { container } = render(
            <DataTable
                dataSource={rows}
                columns={[
                    { title: '字段', dataIndex: 'name', width: 160, fixed: 'left', ellipsis: true },
                    { title: <ColumnTitle>{longName}</ColumnTitle>, dataIndex: 'a', width: 240, ellipsis: true },
                ]}
            />,
        );
        const table = container.querySelector('table') as HTMLTableElement;
        expect(table.style.tableLayout).toBe('fixed');
        expect(table.style.width).toBe('400px');
        // 表头单行截断（全名在 Tooltip 里）
        expect(container.querySelector('thead .truncate')?.textContent).toBe(longName);
    });

    it('没有 ellipsis 列时保持默认布局与 max-content', async () => {
        const { default: DataTable } = await import('../DataTable');
        const { container } = render(
            <DataTable dataSource={rows} columns={[{ title: '字段', dataIndex: 'name', width: 160 }]} />,
        );
        const table = container.querySelector('table') as HTMLTableElement;
        expect(table.style.tableLayout).not.toBe('fixed');
        expect(table.style.width).toBe('max-content');
    });
});
