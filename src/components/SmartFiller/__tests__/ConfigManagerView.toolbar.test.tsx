import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfigManagerView from '../ConfigManagerView';

/**
 * 批次 6（设计：docs/plans/2026-10-16-列表页设计语言-design.md §7）：
 * 字段与词表是带 Tabs 的配置页——外壳按 §4.3 走 ListToolbar，
 * 但 Tab 内的动作行不再嵌第二层 ListToolbar（避免双层 chrome）。
 *
 * 注意：组件 loading 初值为 !isEnumDataLoaded()，首帧渲染 Skeleton；
 * 所有断言必须 await（用 findBy*）等 preloadEnumData 落定。
 */

vi.mock('../../store/vehicleStore', () => ({
    useVehicleStore: () => ({ assetLibraryPath: '/tmp/assets' }),
}));

vi.mock('../../../utils/fieldLists', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../utils/fieldLists')>()),
    getFieldGroupsSync: () => [{ id: 'g1', name: '系统必填字段', fields: ['快充'] }],
    getExportFormatsSync: () => [],
    reloadCustomFields: vi.fn(),
}));

afterEach(() => cleanup());

describe('字段与词表 工具条（批次 6）', () => {
    it('外壳是 ListToolbar，不再自造 Card title 行', async () => {
        const { container } = render(<ConfigManagerView />);
        expect(await screen.findByText('字段与词表')).toBeInTheDocument();
        const bar = container.querySelector('.surface-container.border.rounded-lg');
        expect(bar).not.toBeNull();
        // 旧的自造 Card 标题行已移除
        expect(container.querySelector('.ant-card')).toBeNull();
    }, 15000);

    it('页级搜索走 SearchInput（固定带搜索图标），不带「搜索：」标签（§5.3）', async () => {
        const { container } = render(<ConfigManagerView />);
        expect(await screen.findByText('新增业务字典')).toBeInTheDocument();
        expect(screen.queryByText('搜索：')).toBeNull();
        expect(container.querySelector('.ant-input-affix-wrapper .anticon-search')).not.toBeNull();
    }, 15000);

    it('计数在筛选段、导入在操作段（各自槽位）', async () => {
        render(<ConfigManagerView />);
        expect(await screen.findByText('新增业务字典')).toBeInTheDocument();
        // 计数是标题后的文字（§5.2），不再是「N 个字段」Tag
        expect(document.querySelector('[data-slot="list-title"]')?.textContent).toBe('字段与词表');
        expect(document.querySelector('[data-slot="list-count"]')?.textContent).toMatch(/^\d+( \/ \d+)?$/);
        expect(screen.queryByText(/个字段/)).toBeNull();
        expect(screen.getAllByText(/已激活/).length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /从 Excel 导入枚举/ })).toBeInTheDocument();
    }, 15000);

    it('枚举字典 Tab 的动作收进下拉；新增不是产出动作，不占 primary（§5.1）', async () => {
        const { container } = render(<ConfigManagerView />);
        expect(await screen.findByText('新增业务字典')).toBeInTheDocument();
        // 原先平铺的次级动作已收进「更多」
        expect(screen.queryByText('复制必填')).toBeNull();
        expect(screen.queryByText('激活配置')).toBeNull();
        expect(screen.getByRole('button', { name: /更多/ })).toBeInTheDocument();
        // primary 只留给产出动作；本 Tab 是维护词表，没有产出 → 0 个
        const tabPane = container.querySelector('.ant-tabs-tabpane-active');
        expect(tabPane?.querySelectorAll('.ant-btn-primary')).toHaveLength(0);
        expect(screen.getByText('新增业务字典').closest('button')?.className).not.toContain('ant-btn-primary');
    }, 15000);
});
