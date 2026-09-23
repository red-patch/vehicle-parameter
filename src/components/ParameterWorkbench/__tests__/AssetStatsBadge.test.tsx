import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import AssetStatsBadge from '../AssetStatsBadge';

describe('AssetStatsBadge', () => {
  afterEach(() => cleanup());

  it('在单一方框内展示参数总数、完成率与空值数', () => {
    const { container } = render(<AssetStatsBadge totalParams={455} filledParams={419} />);
    expect(screen.getByText('455')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('36')).toBeInTheDocument();
    // 三段统计渲染在同一个方框容器内，而非三个独立标签
    const box = container.querySelector('.surface-inset');
    expect(box).not.toBeNull();
    expect(box?.childElementCount).toBe(3);
  });

  it('完成率四舍五入取整', () => {
    render(<AssetStatsBadge totalParams={3} filledParams={2} />);
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('totalParams 为 0 时完成率显示 0% 而非 NaN', () => {
    render(<AssetStatsBadge totalParams={0} filledParams={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
    // 参数值与空值都为 0
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(document.body.textContent ?? '').not.toContain('NaN');
  });

  it('完成率按档位着色：≥95 绿 / ≥60 琥珀 / <60 红', () => {
    const { unmount } = render(<AssetStatsBadge totalParams={100} filledParams={98} />);
    expect(screen.getByText('98%')).toHaveClass('text-success-text');
    unmount();

    render(<AssetStatsBadge totalParams={100} filledParams={80} />);
    expect(screen.getByText('80%')).toHaveClass('text-warning-text');
    cleanup();

    render(<AssetStatsBadge totalParams={100} filledParams={40} />);
    expect(screen.getByText('40%')).toHaveClass('text-danger-text');
  });

  it('全满时空值为 0 且完成率 100%', () => {
    render(<AssetStatsBadge totalParams={120} filledParams={120} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
