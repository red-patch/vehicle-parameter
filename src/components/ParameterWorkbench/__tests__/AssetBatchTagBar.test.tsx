import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssetBatchTagBar, { type BatchTagGroup } from '../AssetBatchTagBar';

const baseProps = {
  selectedCount: 2,
  filteredCount: 5,
  allSelected: false,
  indeterminate: true,
  onSelectAll: vi.fn(),
  onClearSelection: vi.fn(),
  onExit: vi.fn(),
  groups: [
    { id: 'source', name: '来源', tags: ['公告数据', '人工维护'] },
    { id: '_other', name: '未分组', tags: ['EV'] },
  ] as BatchTagGroup[],
  onApplyTags: vi.fn(),
};

const renderBar = (overrides: Partial<typeof baseProps> = {}) =>
  render(<AssetBatchTagBar {...baseProps} {...overrides} />);

describe('AssetBatchTagBar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('展示已选数与筛选数', () => {
    renderBar();
    expect(screen.getByText('已选 2 / 5')).toBeInTheDocument();
    expect(screen.getByText('全选筛选结果')).toBeInTheDocument();
  });

  it('点击全选 checkbox 触发 onSelectAll', () => {
    renderBar();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(baseProps.onSelectAll).toHaveBeenCalledWith(true);
  });

  it('输入标签后点「添加到已选」，解析分隔符并回调', () => {
    renderBar();
    fireEvent.change(screen.getByPlaceholderText(/回车应用到已选/), {
      target: { value: '公告数据, 众测、EV' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加到已选' }));
    expect(baseProps.onApplyTags).toHaveBeenCalledWith(['公告数据', '众测', 'EV']);
  });

  it('回车等价于点击应用，且清空输入框', () => {
    renderBar();
    const input = screen.getByPlaceholderText(/回车应用到已选/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '纯电 混动' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(baseProps.onApplyTags).toHaveBeenCalledWith(['纯电', '混动']);
    expect(input.value).toBe('');
  });

  it('点击快捷标签 +tag 直接回调单标签', () => {
    renderBar();
    fireEvent.click(screen.getByText('+公告数据'));
    expect(baseProps.onApplyTags).toHaveBeenCalledWith(['公告数据']);
  });

  it('未勾选任何资产时输入与按钮禁用，快捷标签不可点', () => {
    renderBar({ selectedCount: 0, indeterminate: false });
    expect(screen.getByPlaceholderText(/回车应用到已选/)).toBeDisabled();
    expect(screen.getByRole('button', { name: '添加到已选' })).toBeDisabled();
    fireEvent.click(screen.getByText('+公告数据'));
    expect(baseProps.onApplyTags).not.toHaveBeenCalled();
  });

  it('空输入时应用按钮禁用', () => {
    renderBar();
    expect(screen.getByRole('button', { name: '添加到已选' })).toBeDisabled();
  });

  it('清除选择与完成按钮分别回调', () => {
    renderBar();
    fireEvent.click(screen.getByText('清除选择'));
    expect(baseProps.onClearSelection).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /完成/ }));
    expect(baseProps.onExit).toHaveBeenCalledTimes(1);
  });

  it('互斥组名称带「互斥」标记，普通组不带', () => {
    renderBar({
      groups: [
        { id: 'source', name: '来源', tags: ['公告数据'], exclusive: true },
        { id: '_other', name: '未分组', tags: ['EV'] },
      ],
    });
    expect(screen.getByText('互斥')).toBeInTheDocument();
    expect(screen.getAllByText('互斥')).toHaveLength(1);
  });
});
