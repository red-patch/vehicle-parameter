import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SelectVehiclesHint from '../SelectVehiclesHint';

afterEach(() => cleanup());

describe('SelectVehiclesHint', () => {
    it('带直达按钮：点了跳去车型资产', () => {
        const onGoPool = vi.fn();
        render(<SelectVehiclesHint onGoPool={onGoPool} />);
        fireEvent.click(screen.getByRole('button', { name: '去车型资产选择' }));
        expect(onGoPool).toHaveBeenCalledTimes(1);
    });

    it('没有导航上下文时只显示文案', () => {
        render(<SelectVehiclesHint />);
        expect(screen.getByText('请先在「车型资产」中选择车型')).toBeInTheDocument();
        expect(screen.queryByRole('button')).toBeNull();
    });
});
