import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// localStorage 在测试环境是无 setItem 的空壳，persist store 创建时会解析存储对象——
// 必须在 import 之前替换（体例同 MainLayout.navigation.test.tsx）。
vi.hoisted(() => {
  if (typeof (globalThis.localStorage as Storage | undefined)?.setItem !== 'function') {
    const memory = new Map<string, string>();
    const fakeStorage: Storage = {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => void memory.set(k, String(v)),
      removeItem: (k) => void memory.delete(k),
      clear: () => memory.clear(),
      key: (i) => Array.from(memory.keys())[i] ?? null,
      get length() {
        return memory.size;
      },
    };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: fakeStorage });
    Object.defineProperty(window, 'localStorage', { configurable: true, writable: true, value: fakeStorage });
  }
});

// 依赖 mock：三域 store 与资产快照（面板是纯消费者，mock 后只测面板自身行为）
vi.mock('../../../store/announcementStore', () => {
  const infos = [
    { jsonFile: 'A1.json', announceNo: 'BM2024A001', batch: '第389批', vehicleName: 'V6E', importedAt: null, sourceUrl: null, hasPdf: true, pdfFile: 'A1.pdf', paramCount: 10, orphan: false },
    { jsonFile: 'A2.json', announceNo: 'ZR2025001', batch: null, vehicleName: '白犀牛R3', importedAt: null, sourceUrl: null, hasPdf: false, pdfFile: null, paramCount: 5, orphan: false },
  ];
  return {
    useAnnouncementStore: (sel: (s: unknown) => unknown) => sel({
      infos,
      loading: false,
      loadFor: vi.fn(),
    }),
  };
});

vi.mock('../../../store/regulationStore', () => {
  const records = [
    { version: '1.0', standardNo: 'GB 44495', year: '2024', title: '汽车信息安全', level: '国标', domains: ['信息安全'], publishedAt: null, effectiveAt: null, status: '现行', statusOverridden: false, replaces: [], fileName: 'a.pdf', fileSize: 1, fileMissing: false, notDownloaded: false, textLayer: 'unknown', knowledgeCards: [], note: '', updatedAt: '2026-01-01' },
  ];
  const state = {
    rootPath: '/tmp/reg',
    loading: false,
    sidecar: { records },
    load: vi.fn(),
  };
  const useRegulationStore = Object.assign(
    (sel: (s: unknown) => unknown) => sel(state),
    { getState: () => state },
  );
  return { useRegulationStore };
});

vi.mock('../../../hooks/useAssetLibrarySnapshot', () => ({
  // 共享静态快照（AGENTS.md：mock 对象不逐次新建）
  useAssetLibrarySnapshot: () => ({
    infos: [
      { fileName: 'V6E.json', productName: 'V6E', updatedAt: null, totalParams: 10, filledParams: 5, announceNos: ['BM2024A001'], vehicleModel: null, hasAdmissionInfo: false, approvalStatus: null, manufacturerRaw: '上汽大通', batteryBrandRaw: null, capacityRaw: null, admissionLevelRaw: null, admissionNos: [] },
    ],
    tags: { 'V6E.json': ['无人车'] },
    meta: {},
    latestSet: new Set(['V6E.json']),
    loading: false,
  }),
}));

const { default: GlobalSearchModal } = await import('../GlobalSearchModal');
const { useGlobalSearchStore } = await import('../../../store/globalSearchStore');
const { useVehicleStore } = await import('../../../store/vehicleStore');

const openPanel = () => {
  act(() => useGlobalSearchStore.getState().open());
};

// act 从 RTL 导入（命名导入避免类型漂移）
import { act } from '@testing-library/react';

afterEach(() => {
  cleanup();
  act(() => {
    useGlobalSearchStore.setState({ isOpen: false });
    useVehicleStore.setState({ pendingGlobalSearch: null });
  });
});

describe('GlobalSearchModal', () => {
  it('⌘K 打开面板，Esc 关闭', async () => {
    render(<GlobalSearchModal />);
    expect(screen.queryByTestId('global-search-input')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    await waitFor(() => expect(screen.getByTestId('global-search-input')).toBeInTheDocument());

    // Esc 关闭：rc-dialog 的 Esc 处理挂在 wrapper 上，事件需从面板内部元素冒泡（真实用户路径）
    fireEvent.keyDown(screen.getByTestId('global-search-input'), { key: 'Escape', keyCode: 27 });
    await waitFor(() => expect(useGlobalSearchStore.getState().isOpen).toBe(false));
  });

  it('空查询显示三域数量统计', async () => {
    render(<GlobalSearchModal />);
    openPanel();
    await waitFor(() => expect(screen.getByTestId('global-search-input')).toBeInTheDocument());
    // 资产 1 · 公告 2（孤儿排除在外）· 法规 1
    expect(screen.getByText(/车型资产 1/)).toBeInTheDocument();
    expect(screen.getByText(/公告记录 2/)).toBeInTheDocument();
    expect(screen.getByText(/法规标准 1/)).toBeInTheDocument();
  });

  it('输入关键字 → 分组结果出现；Enter 写入跳转信号（跳页+预填）', async () => {
    render(<GlobalSearchModal />);
    openPanel();
    const input = await screen.findByTestId('global-search-input');

    fireEvent.change(input, { target: { value: 'V6E' } });
    // 防抖 150ms
    await waitFor(() => expect(screen.getAllByText('V6E').length).toBeGreaterThan(0), { timeout: 2000 });

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(useVehicleStore.getState().pendingGlobalSearch).toEqual({ tab: 'pool', keyword: 'V6E' });
    });
    // 面板关闭
    expect(useGlobalSearchStore.getState().isOpen).toBe(false);
  });

  it('↑↓ 移动选中行，Enter 提交当前选中域', async () => {
    render(<GlobalSearchModal />);
    openPanel();
    const input = await screen.findByTestId('global-search-input');

    fireEvent.change(input, { target: { value: 'V6E' } });
    // 命中：资产 V6E（前缀）+ 公告 BM2024A001（车型名包含）→ 至少 2 行
    await waitFor(() => expect(screen.getAllByText('V6E').length).toBeGreaterThan(0), { timeout: 2000 });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    // 第二行是公告域 → tab=announcement
    await waitFor(() => {
      expect(useVehicleStore.getState().pendingGlobalSearch?.tab).toBe('announcement');
    });
  });

  it('选中公告结果时信号携带公告号关键字', async () => {
    render(<GlobalSearchModal />);
    openPanel();
    const input = await screen.findByTestId('global-search-input');

    fireEvent.change(input, { target: { value: 'BM2024A001' } });
    await waitFor(() => expect(screen.getAllByText(/BM2024A001/).length).toBeGreaterThan(0), { timeout: 2000 });

    // 域序为资产在前：↓ 移到第二行（公告域 BM2024A001）再提交
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(useVehicleStore.getState().pendingGlobalSearch).toEqual({ tab: 'announcement', keyword: 'BM2024A001' });
    });
  });
});
