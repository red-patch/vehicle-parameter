import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import VehicleListPanel from '../VehicleListPanel';
import { buildVehicleInstanceKey } from '../../../utils/vehicleInstance';
import type { AssetLibrarySnapshot } from '../../../hooks/useAssetLibrarySnapshot';

const sameName = 'V6E小卡车-20260206';
const firstKey = buildVehicleInstanceKey('excel', 'first.xlsx', sameName);
const secondKey = buildVehicleInstanceKey('excel', 'second.xlsx', sameName);
const assetKey = buildVehicleInstanceKey('asset', 'V6E_1.json', sameName);

// mock 状态整体 hoisted 一次性构建：每次 useVehicleStore 调用若新建数组/对象，
// effect 依赖数组身份会无限重渲染（曾把 worker 跑到 4GB OOM）
const storeState = vi.hoisted(() => {
  const sameName = 'V6E小卡车-20260206';
  const firstKey = `excel::first.xlsx::${sameName}`;
  const secondKey = `excel::second.xlsx::${sameName}`;
  const state = {
    uploadedFiles: [
      {
        fileName: 'first.xlsx',
        rawHeaders: [],
        data: [
          { id: '1', group: '基础信息', name: '整备质量', value: '1000', productName: sameName, instanceKey: firstKey },
        ],
      },
      {
        fileName: 'second.xlsx',
        rawHeaders: [],
        data: [
          { id: '2', group: '基础信息', name: '整备质量', value: '1200', productName: sameName, instanceKey: secondKey },
        ],
      },
    ] as unknown[],
    assetFiles: [] as unknown[],
    selectedProductNames: [] as string[],
    setSelectedProductNames: () => {},
    setCompareProducts: () => {},
    activeAssets: ['V6E_1.json'] as string[],
    removeActiveAsset: () => {},
  };
  return state;
});

vi.mock('../../../store/vehicleStore', () => ({
  useVehicleStore: (selector: (state: unknown) => unknown) => selector(storeState),
}));

const emptySnapshot: AssetLibrarySnapshot = {
  infos: [],
  tags: {},
  meta: {},
  latestSet: new Set(),
  loading: false,
};

const assetSnapshot: AssetLibrarySnapshot = {
  infos: [{
    fileName: 'V6E_1.json',
    productName: sameName,
    totalParams: 10,
    filledParams: 8,
    updatedAt: '2026-10-01',
    announceNos: [],
    vehicleModel: null,
    hasAdmissionInfo: false,
    approvalStatus: null,
  }],
  tags: {},
  meta: {},
  latestSet: new Set(),
  loading: false,
};

beforeAll(() => {
  storeState.selectedProductNames = [firstKey, secondKey, assetKey];
});

afterEach(() => {
  cleanup();
});

describe('VehicleListPanel instance identity', () => {
  it('shows same-name vehicles from different files as separate active cards with stable numbered titles', () => {
    storeState.selectedProductNames = [firstKey, secondKey];
    render(
      <VehicleListPanel
        onLocateAsset={vi.fn()}
        onOpenInspector={vi.fn()}
        onGoCompare={vi.fn()}
        snapshot={emptySnapshot}
      />
    );

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(`${sameName}（1）`)).toBeInTheDocument();
    expect(screen.getByText(`${sameName}（2）`)).toBeInTheDocument();
    expect(screen.getByText('@first.xlsx')).toBeInTheDocument();
    expect(screen.getByText('@second.xlsx')).toBeInTheDocument();
  });

  it('no longer renders the retired 备选/已过滤车型 section (design doc §3.6)', () => {
    storeState.selectedProductNames = [firstKey, secondKey];
    render(
      <VehicleListPanel
        onLocateAsset={vi.fn()}
        onOpenInspector={vi.fn()}
        onGoCompare={vi.fn()}
        snapshot={emptySnapshot}
      />
    );

    expect(screen.queryByText(/备选/)).toBeNull();
    expect(screen.queryByText(/已过滤/)).toBeNull();
    expect(screen.queryByText('恢复至工作进行分析')).toBeNull();
  });

  it('routes asset-vehicle clicks to left-panel locate and opens inspector via the detail button', () => {
    storeState.selectedProductNames = [assetKey];
    const onLocateAsset = vi.fn();
    const onOpenInspector = vi.fn();
    render(
      <VehicleListPanel
        onLocateAsset={onLocateAsset}
        onOpenInspector={onOpenInspector}
        onGoCompare={vi.fn()}
        snapshot={assetSnapshot}
      />
    );

    // 资产车卡点击 → 左栏定位（本地车才直接开检查器）
    const card = screen.getByText('@V6E_1.json').closest('.cursor-pointer') as HTMLElement;
    card.click();
    expect(onLocateAsset).toHaveBeenCalledWith('V6E_1.json');

    // 详情按钮 → 检查器（instanceKey）
    screen.getByTitle('查看详情').click();
    expect(onOpenInspector).toHaveBeenCalledWith(assetKey);
  });
});
