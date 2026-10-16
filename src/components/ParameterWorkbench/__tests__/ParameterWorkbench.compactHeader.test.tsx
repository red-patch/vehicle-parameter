import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ParameterWorkbench from '../ParameterWorkbench';

// 只留实际被 ParameterWorkbench import 的模块。此前还 mock 了 DataSourcePanel /
// VehicleListPanel，但 ParameterWorkbench 早已改用 AssetPoolLayout，那两个 mock
// 指向的是没被 import 的模块（DataSourcePanel 已随死代码清理删除）。

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
