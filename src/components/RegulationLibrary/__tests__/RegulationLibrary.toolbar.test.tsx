import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// zustand persist 依赖 localStorage；本环境 Node 的 --localstorage-file 桩缺 setItem，
// 且必须早于 store 的 import 生效 → 用 vi.hoisted 提升到 import 之前。
vi.hoisted(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
            setItem: (k: string, v: string) => { store.set(k, String(v)); },
            removeItem: (k: string) => { store.delete(k); },
            clear: () => { store.clear(); },
            key: (i: number) => Array.from(store.keys())[i] ?? null,
            get length() { return store.size; },
        },
    });
});

import RegulationLibrary from '../RegulationLibrary';
import { useRegulationStore } from '../../../store/regulationStore';

/**
 * 批次 4（设计：docs/plans/2026-10-16-列表页设计语言-design.md §7）：
 * 法规标准此前是「无标题操作行 + 筛选 Card + 记录 Card」三块并列，
 * 现合并为 ListToolbar 三段，并清掉全仓最后一处 Input.Search。
 */

const seed = (over: Partial<ReturnType<typeof useRegulationStore.getState>> = {}) => {
    useRegulationStore.setState({
        rootPath: '/tmp/reglib',
        sidecar: {
            version: '1.0',
            records: [
                {
                    standardNo: 'GB 44495', year: '2024', title: '汽车整车信息安全技术要求',
                    level: '国标', domains: ['安全'], publishedAt: '2024-08-23', effectiveAt: '2026-01-01',
                    status: '现行', statusOverridden: false, replaces: [], note: '',
                    fileName: 'GB44495-2024.pdf', fileSize: 1024, textLayer: 'ok',
                    fileMissing: false, notDownloaded: false, knowledgeCards: [],
                },
            ],
            vocab: { levels: ['国标', '行标'], domains: ['安全', '环保'] },
            sites: [],
        },
        scan: { files: [], unregistered: [] },
        loading: false,
        ...over,
    } as never);
};

afterEach(() => {
    cleanup();
    useRegulationStore.setState({ rootPath: '', scan: null });
});

describe('法规标准 工具条（批次 4）', () => {
    it('用 ListToolbar 作外壳，不再并列两个 Card（§4.3）', () => {
        seed();
        const { container } = render(<RegulationLibrary />);
        const bar = container.querySelector('.surface-container.border.rounded-lg');
        expect(bar).not.toBeNull();
        // 记录计数在 title 段
        expect(bar!.textContent).toContain('记录（1）');
    });

    it('搜索走 SearchInput，全仓不再有 Input.Search（控件唯一形态）', () => {
        seed();
        render(<RegulationLibrary />);
        expect(screen.getByText('搜索：')).toBeInTheDocument();
        // SearchInput 固定带搜索图标
        const icon = document.querySelector('.ant-input-affix-wrapper .anticon-search');
        expect(icon).not.toBeNull();
    });

    it('层级与状态用 FacetChips，不再用 Checkbox.Group（规范禁项）', () => {
        seed();
        const { container } = render(<RegulationLibrary />);
        // 用 getAllByText：状态值的 chip 里也可能含相同字样
        expect(screen.getAllByText('层级').length).toBeGreaterThan(0);
        expect(screen.getAllByText('状态').length).toBeGreaterThan(0);
        // 定长枚举 → chips（chip-md 档）
        expect(container.querySelectorAll('.ant-tag.chip-md').length).toBeGreaterThan(0);
        // 复选框组已消失
        expect(container.querySelector('.ant-checkbox-group')).toBeNull();
    });

    it('标题行无 primary——本页主任务是浏览治理（§5.1 Q19）', () => {
        seed();
        const { container } = render(<RegulationLibrary />);
        const bar = container.querySelector('.surface-container.border.rounded-lg');
        const head = bar!.children[0];
        expect(head.querySelectorAll('.ant-btn-primary')).toHaveLength(0);
    });

    it('刷新是图标按钮 + Tooltip，保存/设置/选择目录为 default', () => {
        seed();
        const { container } = render(<RegulationLibrary />);
        const bar = container.querySelector('.surface-container.border.rounded-lg');
        const head = bar!.children[0];
        expect(head.querySelector('.anticon-reload')?.closest('button')).not.toBeNull();
        expect(head.textContent).toContain('选择目录');
        expect(head.textContent).toContain('保存');
        expect(head.textContent).toContain('设置');
        // 刷新按钮不带文字
        const reloadBtn = head.querySelector('.anticon-reload')!.closest('button')!;
        expect(reloadBtn.textContent ?? '').not.toContain('刷新');
    });
});
