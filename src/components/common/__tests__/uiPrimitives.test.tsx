import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SearchInput from '../SearchInput';
import FacetChips from '../FacetChips';
import { FilterItem } from '../ListToolbar';

/**
 * UI 构件单测（设计：docs/plans/2026-10-15-ui-构件规范-design.md §7）。
 * 这些构件是「唯一正确写法」的定义处，行为被钉死后，护栏才有意义。
 */

afterEach(() => cleanup());

describe('SearchInput', () => {
    it('宽度只接受三档，不暴露任意像素', () => {
        // 带 prefix 时 antd 把 style 落在 affix 外层（.ant-input-affix-wrapper），
        // 内层 .ant-input 恒为 width:100%——宽度必须断言在外层，否则测的是假象
        const { container } = render(
            <SearchInput value="" onChange={() => {}} placeholder="搜索" width="lg" />,
        );
        expect(container.querySelector('.ant-input-affix-wrapper')).toHaveStyle({ width: '320px' });
        cleanup();

        const { container: c2 } = render(
            <SearchInput value="" onChange={() => {}} placeholder="搜索" />,
        );
        // 默认 md
        expect(c2.querySelector('.ant-input-affix-wrapper')).toHaveStyle({ width: '240px' });
    });

    it('fluid 档：撑满可用宽度而非固定像素（筛选条里的搜索框用）', () => {
        const { container } = render(
            <SearchInput value="" onChange={() => {}} placeholder="搜索" width="fluid" />,
        );
        const wrap = container.querySelector('.ant-input-affix-wrapper') as HTMLElement;
        // 不写死像素；以 flex 撑满，并保留最小宽度避免被压没
        expect(wrap.style.width).toBe('');
        expect(wrap.className).toContain('flex-1');
        expect(wrap.style.flexBasis).toBe('');
        expect(wrap.className).toMatch(/min-w-/);
    });

    it('宽度只取 sm/md/lg 三档实例值', () => {
        const cases: Array<['sm' | 'md' | 'lg', string]> = [
            ['sm', '200px'],
            ['md', '240px'],
            ['lg', '320px'],
        ];
        for (const [width, px] of cases) {
            const { container, unmount } = render(
                <SearchInput value="" onChange={() => {}} placeholder="搜索" width={width} />,
            );
            expect(container.querySelector('.ant-input-affix-wrapper')).toHaveStyle({ width: px });
            unmount();
        }
    });

    it('固定带搜索图标与清除按钮（调用方不可关）', () => {
        const { container } = render(<SearchInput value="abc" onChange={() => {}} placeholder="搜索" />);
        expect(container.querySelector('.anticon-search')).not.toBeNull();
        expect(container.querySelector('.ant-input-clear-icon')).not.toBeNull();
    });

    it('hint 合并进 placeholder，不另起一行', () => {
        render(<SearchInput value="" onChange={() => {}} placeholder="搜索参数名" hint="支持换行" />);
        expect(screen.getByPlaceholderText('搜索参数名（支持换行）')).toBeInTheDocument();
    });

    it('multiline 走 textarea 且多行搜索仍是同一个搜索语义', () => {
        const { container } = render(
            <SearchInput value="" onChange={() => {}} placeholder="搜索" multiline />,
        );
        expect(container.querySelector('textarea')).not.toBeNull();
    });

    it('onChange 回传的是值而不是事件对象', () => {
        const onChange = vi.fn();
        render(<SearchInput value="" onChange={onChange} placeholder="搜索" />);
        fireEvent.change(screen.getByPlaceholderText('搜索'), { target: { value: 'V8E' } });
        expect(onChange).toHaveBeenCalledWith('V8E');
    });
});

describe('FacetChips', () => {
    const options = [
        { value: 'a', label: '发现异常', count: 18 },
        { value: 'b', label: '有差异', count: 3 },
    ];

    it('单选：点击回传单个值', () => {
        const onChange = vi.fn();
        render(<FacetChips options={options} value="a" onChange={onChange} />);
        fireEvent.click(screen.getByText('有差异'));
        expect(onChange).toHaveBeenCalledWith('b');
    });

    it('多选：点击切换进出集合', () => {
        const onChange = vi.fn();
        render(<FacetChips options={options} value={['a']} onChange={onChange} multiple />);
        fireEvent.click(screen.getByText('有差异'));
        expect(onChange).toHaveBeenCalledWith(['a', 'b']);
    });

    it('多选：已选项再点即移除', () => {
        const onChange = vi.fn();
        render(<FacetChips options={options} value={['a', 'b']} onChange={onChange} multiple />);
        fireEvent.click(screen.getByText('有差异'));
        expect(onChange).toHaveBeenCalledWith(['a']);
    });

    it('选中态走 .tag-checked 控制态，未选中不误用语义色', () => {
        render(<FacetChips options={options} value="a" onChange={() => {}} />);
        expect(screen.getByText('发现异常').closest('.ant-tag')).toHaveClass('tag-checked');
        expect(screen.getByText('有差异').closest('.ant-tag')).not.toHaveClass('tag-checked');
    });

    it('计数渲染在标签后', () => {
        render(<FacetChips options={options} value="a" onChange={() => {}} />);
        expect(screen.getByText('18')).toBeInTheDocument();
    });

    it('单选 clearable：再点已选项回传空串（= 取消筛选）', () => {
        const onChange = vi.fn();
        render(<FacetChips clearable options={options} value="a" onChange={onChange} />);
        fireEvent.click(screen.getByText('发现异常'));
        expect(onChange).toHaveBeenCalledWith('');
    });

    it('单选默认不可取消：再点已选项无反应（保持向后兼容）', () => {
        const onChange = vi.fn();
        render(<FacetChips options={options} value="a" onChange={onChange} />);
        fireEvent.click(screen.getByText('发现异常'));
        expect(onChange).toHaveBeenCalledWith('a');
    });

    it('语义档文字用 --*-text 变体（--warning 等图形层色在白底 12px 上读不清）', () => {
        render(
            <FacetChips
                options={[{ value: 'w', label: '警示项', tone: 'warning' }]}
                value=""
                onChange={() => {}}
            />,
        );
        const chip = screen.getByText('警示项').closest('.ant-tag')!;
        expect(chip.className).toContain('text-warning-text');
        expect(chip.className).not.toMatch(/text-warning(?!-text)/);
    });

    it('选中态带对勾图标，未选中不带（可切换的可供性）', () => {
        const { container } = render(<FacetChips options={options} value="a" onChange={() => {}} />);
        const selected = screen.getByText('发现异常').closest('.ant-tag')!;
        const unselected = screen.getByText('有差异').closest('.ant-tag')!;
        expect(selected.querySelector('.anticon-check')).not.toBeNull();
        expect(unselected.querySelector('.anticon-check')).toBeNull();
        expect(container.querySelectorAll('.anticon-check')).toHaveLength(1);
    });

    it('chip 尺寸统一走 chip-md（aux 档 12px）', () => {
        const { container } = render(<FacetChips options={options} value="a" onChange={() => {}} />);
        expect(container.querySelectorAll('.chip-md')).toHaveLength(2);
    });
});

describe('FacetChips 单项禁用', () => {
    const withDisabled = [
        { value: 'a', label: '可用项' },
        { value: 'b', label: '禁用项', disabled: true },
    ];

    it('单项 disabled 时点击不回传（其余项不受影响）', () => {
        const onChange = vi.fn();
        render(<FacetChips options={withDisabled} value="" onChange={onChange} />);
        fireEvent.click(screen.getByText('禁用项'));
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('可用项'));
        expect(onChange).toHaveBeenCalledWith('a');
    });

    it('单项禁用有可辨识的禁用态', () => {
        render(<FacetChips options={withDisabled} value="" onChange={() => {}} />);
        const disabled = screen.getByText('禁用项').closest('.ant-tag')!;
        const enabled = screen.getByText('可用项').closest('.ant-tag')!;
        expect(disabled).toHaveAttribute('aria-disabled', 'true');
        // antd Tag 会丢掉 aria-disabled="false"（React 对字符串型 ARIA 属性省略 false），
        // 故「可用」一侧断言在样式类上——禁用项有 cursor-not-allowed，可用项没有
        expect(disabled.className).toContain('cursor-not-allowed');
        expect(enabled.className).not.toContain('cursor-not-allowed');
        expect(enabled.className).toContain('cursor-pointer');
    });

    it('已选中的项即使被禁用也保持选中态（禁止取消）', () => {
        const onChange = vi.fn();
        render(<FacetChips options={withDisabled} value="b" onChange={onChange} />);
        fireEvent.click(screen.getByText('禁用项'));
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByText('禁用项').closest('.ant-tag')).toHaveClass('tag-checked');
    });
});

describe('FilterItem', () => {
    it('自动补冒号，调用方不写', () => {
        render(<FilterItem label="搜索">x</FilterItem>);
        expect(screen.getByText('搜索：')).toBeInTheDocument();
    });

    it('幂等：旧写法自带冒号不会变成两个', () => {
        render(<FilterItem label="搜索:">x</FilterItem>);
        expect(screen.getByText('搜索:')).toBeInTheDocument();
        expect(screen.queryByText('搜索::')).toBeNull();
    });

    it('中文冒号同样幂等', () => {
        render(<FilterItem label="快捷：">x</FilterItem>);
        expect(screen.getByText('快捷：')).toBeInTheDocument();
    });

    it('标签字号跟随界面字号设置而非固定 text-sm', () => {
        render(<FilterItem label="搜索">x</FilterItem>);
        expect(screen.getByText('搜索：')).toHaveStyle({ fontSize: 'var(--fs-body)' });
    });
});
