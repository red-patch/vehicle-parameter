import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SheetData } from '../../../types';

/**
 * 批次 9（设计：docs/plans/2026-10-16-列表页设计语言-design.md §7）：
 * DiffViewer 是 FilterBar 的最后一个外壳消费方。
 * 结构契约：外壳走 ListToolbar、视图切换用 Segmented（禁 Radio.Group）、
 * 搜索走 SearchInput；迁完退役 FilterBar 外壳。
 */

const mockState = {
    diffResult: null as unknown,
    baseFile: null as SheetData | null,
    targetFile: null as SheetData | null,
    compareMode: 'content' as const,
    setCompareMode: vi.fn(),
};

vi.mock('../../../store/vehicleStore', () => ({
    useVehicleStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

// 静态导入而非每个用例内动态 import：DiffResultView 会拉起 xlsx 依赖图，
// 动态导入在每个 it 里重复付出 ~1.4s，全量并行跑时会顶到超时（实测 16.7s/15s）。
import DiffResultView from '../DiffResultView';

const sheet = (fileName: string, rows: { group: string; name: string; value: string }[]): SheetData => ({
    fileName,
    rawHeaders: ['分组', '参数名', '参数值'],
    data: rows.map((r, i) => ({ id: String(i), group: r.group, name: r.name, value: r.value })),
});

const seed = () => {
    mockState.baseFile = sheet('a.xlsx', [{ group: '车身', name: '整备质量', value: '1000' }]);
    mockState.targetFile = sheet('b.xlsx', [{ group: '车身', name: '整备质量', value: '1200' }]);
    mockState.diffResult = {
        added: [],
        removed: [],
        modified: [
            {
                id: 'm1',
                oldParam: { id: '1', group: '车身', name: '整备质量', value: '1000' },
                newParam: { id: '2', group: '车身', name: '整备质量', value: '1200' },
            },
        ],
        unchanged: [],
    };
};

afterEach(() => {
    cleanup();
    mockState.diffResult = null;
    mockState.baseFile = null;
    mockState.targetFile = null;
});

describe('DiffResultView 工具条（批次 9）', () => {
    it('外壳是 ListToolbar，不再是 FilterBar</>', () => {
        seed();
        const { container } = render(<DiffResultView />);
        const bar = container.querySelector('.surface-container.border.rounded-lg');
        expect(bar).not.toBeNull();
        expect(screen.getByText('比对统计')).toBeInTheDocument();
        // 旧外壳的类名特征不再出现
        expect(container.querySelector('.mb-4.flex.items-center.justify-between')).toBeNull();
    }, 15000);

    it('视图切换用 Segmented，不是 Radio.Group（规范禁项）', () => {
        seed();
        const { container } = render(<DiffResultView />);
        expect(container.querySelector('.ant-segmented')).not.toBeNull();
        expect(container.querySelector('.ant-radio-group')).toBeNull();
        expect(screen.getByText('对比模式：')).toBeInTheDocument();
    }, 15000);

    it('搜索走 SearchInput（固定带搜索图标）', () => {
        seed();
        const { container } = render(<DiffResultView />);
        expect(container.querySelector('.ant-input-affix-wrapper .anticon-search')).not.toBeNull();
        // DiffResultView 的搜索原为**单行** Input（非多关键词），迁移保持单行；
        // 多行搜索在 ParametersTable 那处（另有 multiline 用例覆盖）
        expect(screen.getByPlaceholderText('搜索字段名、值或分组')).toBeInTheDocument();
    }, 15000);

    it('统计四态在独立统计带内', () => {
        seed();
        render(<DiffResultView />);
        expect(screen.getByText('新增参数')).toBeInTheDocument();
        expect(screen.getByText('变更参数')).toBeInTheDocument();
    }, 15000);
});
