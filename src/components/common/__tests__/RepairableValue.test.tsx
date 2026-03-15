import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RepairableValue from '../RepairableValue';

afterEach(() => {
  cleanup();
});

describe('RepairableValue', () => {
  it('renders a clickable repair affordance when repair is available', async () => {
    const onRepair = vi.fn();

    render(
      <RepairableValue
        value="异常值"
        repairable
        hint="点击修复源数据"
        onRepair={onRepair}
      />
    );

    const trigger = screen.getByRole('button', { name: '异常值' });
    expect(trigger).toHaveAttribute('title', '点击修复源数据');

    await userEvent.click(trigger);
    expect(onRepair).toHaveBeenCalledTimes(1);
  });

  it('renders plain text when repair is not available', () => {
    render(
      <RepairableValue
        value="正常值"
        repairable={false}
        onRepair={vi.fn()}
      />
    );

    expect(screen.getByText('正常值')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '正常值' })).not.toBeInTheDocument();
  });
});
