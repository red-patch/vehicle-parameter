import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CellText from '../CellText';

/**
 * CellText 单测（设计：docs/plans/2026-10-16-表格行规范-design.md §3.2）。
 * 核心契约：只读态只占一行文本，点开才变输入框——这样行高恒定。
 */

afterEach(() => cleanup());

describe('CellText', () => {
    const base = {
        value: '右侧滑门',
        editing: false,
        onChange: () => {},
        onStartEdit: () => {},
        onEndEdit: () => {},
    };

    it('只读态是文本而非输入框（行高恒定的关键）', () => {
        const { container } = render(<CellText {...base} />);
        expect(screen.getByText('右侧滑门')).toBeInTheDocument();
        expect(container.querySelector('input')).toBeNull();
        // 只读态走 .cell-edit-text：hover 弱底提示可点
        expect(screen.getByText('右侧滑门')).toHaveClass('cell-edit-text');
    });

    it('点击文本进入编辑态', () => {
        const onStartEdit = vi.fn();
        render(<CellText {...base} onStartEdit={onStartEdit} />);
        fireEvent.click(screen.getByText('右侧滑门'));
        expect(onStartEdit).toHaveBeenCalled();
    });

    it('编辑态渲染输入框并回传值', () => {
        const onChange = vi.fn();
        render(<CellText {...base} editing onChange={onChange} />);
        const input = screen.getByDisplayValue('右侧滑门');
        fireEvent.change(input, { target: { value: '对开门' } });
        expect(onChange).toHaveBeenCalledWith('对开门');
    });

    it('回车与失焦都结束编辑', () => {
        const onEndEdit = vi.fn();
        render(<CellText {...base} editing onEndEdit={onEndEdit} />);
        const input = screen.getByDisplayValue('右侧滑门');
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onEndEdit).toHaveBeenCalledTimes(1);
        fireEvent.blur(input);
        expect(onEndEdit).toHaveBeenCalledTimes(2);
    });

    it('空值显示占位（默认 —）', () => {
        render(<CellText {...base} value="" />);
        expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('空值可自定义占位文案', () => {
        render(<CellText {...base} value="" empty="未分组" />);
        expect(screen.getByText('未分组')).toBeInTheDocument();
    });

    it('disabled 时不可进入编辑', () => {
        const onStartEdit = vi.fn();
        render(<CellText {...base} disabled onStartEdit={onStartEdit} />);
        fireEvent.click(screen.getByText('右侧滑门'));
        expect(onStartEdit).not.toHaveBeenCalled();
    });

    it('键盘可达：Enter 进入编辑（无障碍下限）', () => {
        const onStartEdit = vi.fn();
        render(<CellText {...base} onStartEdit={onStartEdit} />);
        fireEvent.keyDown(screen.getByText('右侧滑门'), { key: 'Enter' });
        expect(onStartEdit).toHaveBeenCalled();
    });
});
