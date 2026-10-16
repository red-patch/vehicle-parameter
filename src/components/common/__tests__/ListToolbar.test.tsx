import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ListToolbar from '../ListToolbar';
import { FilterItem } from '../FilterBar';
import SearchInput from '../SearchInput';
import FacetChips from '../FacetChips';

/**
 * ListToolbar 单测（设计：docs/plans/2026-10-15-ui-构件规范-design.md §4.4）。
 * 它是「标题行 + 筛选行」的布局壳，只规定三段怎么摆，不管控件长相。
 */

afterEach(() => cleanup());

describe('ListToolbar 三段槽位（设计语言 §4.1）', () => {
    it('display 段独立于 filters 段渲染（②③ 必须分开）', () => {
        const { container } = render(
            <ListToolbar
                filters={<span>筛选内容</span>}
                display={<span>显示选项</span>}
            />,
        );
        expect(screen.getByText('筛选内容')).toBeInTheDocument();
        expect(screen.getByText('显示选项')).toBeInTheDocument();
        // 两段各自一层，之间有分隔线
        expect(container.querySelectorAll('.border-b')).toHaveLength(1);
    });

    it('三段齐全时是三条带（标题/筛选/显示）两条分隔线', () => {
        const { container } = render(
            <ListToolbar title="标题" filters={<span>F</span>} display={<span>D</span>} />,
        );
        const bar = container.firstElementChild!;
        expect(bar.children).toHaveLength(3);
        expect(bar.querySelectorAll('.border-b')).toHaveLength(2);
    });

    it('省略 display 段时不残留空行（向后兼容）', () => {
        const { container } = render(<ListToolbar title="T" filters={<span>F</span>} />);
        expect(container.firstElementChild!.children).toHaveLength(2);
    });

    it('省略 filters 但有 display 时，display 仍独立成段', () => {
        const { container } = render(<ListToolbar title="T" display={<span>D</span>} />);
        expect(screen.getByText('D')).toBeInTheDocument();
        // 标题 + 显示 = 两条带
        expect(container.firstElementChild!.children).toHaveLength(2);
    });
});

describe('ListToolbar', () => {
    it('只有筛选时渲染单行（等价于旧 FilterBar 的无标题形态）', () => {
        const { container } = render(
            <ListToolbar
                filters={
                    <FilterItem label="搜索">
                        <SearchInput value="" onChange={() => {}} placeholder="搜索" />
                    </FilterItem>
                }
            />,
        );
        expect(screen.getByText('搜索：')).toBeInTheDocument();
        // 无标题行 → 只有一层内容区
        expect(container.querySelectorAll('.border-b')).toHaveLength(0);
    });

    it('标题与操作同处一行且分列两端', () => {
        render(
            <ListToolbar
                title={<span>记录（12）</span>}
                actions={<button type="button">刷新</button>}
                filters={<span>筛选内容</span>}
            />,
        );
        const head = screen.getByText('记录（12）').closest('.border-b');
        expect(head).not.toBeNull();
        expect(head?.textContent).toContain('刷新');
    });

    it('标题行与筛选行各只出现一次（两套结构合一的验证点）', () => {
        const { container } = render(
            <ListToolbar title="标题" actions={<button type="button">A</button>} filters={<span>F</span>} />,
        );
        // 恰好一条分隔线：标题行与筛选行之间
        expect(container.querySelectorAll('.border-b')).toHaveLength(1);
    });

    it('无 title 无 actions 时不渲染标题行', () => {
        const { container } = render(<ListToolbar filters={<span>F</span>} />);
        expect(container.querySelectorAll('.border-b')).toHaveLength(0);
    });

    it('children 渲染在筛选行之下（它是列表页外壳，不只是工具条）', () => {
        render(
            <ListToolbar title="记录" filters={<span>F</span>}>
                <table>
                    <tbody>
                        <tr>
                            <td>表格内容</td>
                        </tr>
                    </tbody>
                </table>
            </ListToolbar>,
        );
        expect(screen.getByText('表格内容')).toBeInTheDocument();
        // 两行 + 内容 → 恰好两条分隔线（标题/筛选之间、筛选/内容之间）
        const { container } = render(
            <ListToolbar title="T" filters={<span>F</span>}>
                <span>C</span>
            </ListToolbar>,
        );
        expect(container.querySelectorAll('.border-b')).toHaveLength(2);
    });

    it('只有筛选无 children 时是筛选带（等价旧 FilterBar）', () => {
        const { container } = render(<ListToolbar filters={<span>F</span>} />);
        // 末行不带下边框，避免悬空分隔线
        expect(container.querySelectorAll('.border-b')).toHaveLength(0);
    });

    it('可承载 SearchInput + FacetChips 的组合（真实用法）', () => {
        render(
            <ListToolbar
                title="公告归档"
                filters={
                    <>
                        <FilterItem label="状态">
                            <FacetChips
                                options={[{ value: 'all', label: '全部', count: 3 }]}
                                value="all"
                                onChange={() => {}}
                            />
                        </FilterItem>
                        <FilterItem label="搜索">
                            <SearchInput value="" onChange={() => {}} placeholder="搜索车型名" />
                        </FilterItem>
                    </>
                }
            />,
        );
        expect(screen.getByText('状态：')).toBeInTheDocument();
        expect(screen.getByText('搜索：')).toBeInTheDocument();
        expect(screen.getByText('全部')).toBeInTheDocument();
    });
});
