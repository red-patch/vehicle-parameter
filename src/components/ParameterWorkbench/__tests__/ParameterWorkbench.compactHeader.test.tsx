import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ParameterWorkbench from '../ParameterWorkbench';

vi.mock('../DataSourcePanel', () => ({
  default: () => <div>DataSourcePanel</div>,
}));

vi.mock('../VehicleListPanel', () => ({
  default: () => <div>VehicleListPanel</div>,
}));

vi.mock('../AssetDataSynchronizer', () => ({
  default: () => null,
}));

afterEach(() => {
  cleanup();
});

describe('ParameterWorkbench compact header', () => {
  it('keeps the main title and removes the old english subtitle block', () => {
    render(<ParameterWorkbench />);

    expect(screen.getByText('参数工作台')).toBeInTheDocument();
    expect(screen.queryByText('WORKSPACE / PARAMETER DATA MANAGEMENT')).not.toBeInTheDocument();
  });
});
