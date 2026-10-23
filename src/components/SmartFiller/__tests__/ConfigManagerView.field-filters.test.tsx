import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfigManagerView from '../ConfigManagerView';

/**
 * 字段表筛选的退路（设计：docs/plans/2026-10-19-快捷筛选-chip-可恢复-design.md）。
 *
 * 这处筛选长在 Tab 内（不是 ListToolbar 的三段），独立验证：
 * chip 本身可取消，另有「清除筛选」把 chip 与搜索一起复位。
 */

vi.mock('../../store/vehicleStore', () => ({
    useVehicleStore: () => ({ assetLibraryPath: '/tmp/assets' }),
}));

vi.mock('../../../utils/fieldLists', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../utils/fieldLists')>()),
    getFieldGroupsSync: () => [{
        id: 'g1',
        name: '核心字段组',
        fields: ['整备质量', '最高车速'],
        sources: {},
    }],
    getExportFormatsSync: () => [],
    reloadCustomFields: vi.fn(),
}));

afterEach(() => cleanup());

describe('字段与词表 字段表筛选', () => {
    /** chip 文案带计数（`必填0`），用 chip 容器定位，避开「批量设必填」按钮同名文本 */
    const chipByLabel = (label: string): HTMLElement => {
        const chip = Array.from(document.querySelectorAll('.ant-tag.chip-md'))
            .find(el => (el.textContent ?? '').startsWith(label));
        if (!chip) throw new Error(`找不到 chip：${label}`);
        return chip as HTMLElement;
    };

    const openCoreTab = async () => {
        render(<ConfigManagerView />);
        const tab = await screen.findByRole('tab', { name: /核心字段配置/ });
        fireEvent.click(tab);
        // 等 Tab 内容落定
        expect(await screen.findByText('批量导入')).toBeInTheDocument();
    };

    it('「必填」chip 可再点一次取消（不是原地不动）', async () => {
        await openCoreTab();
        const tag = chipByLabel('必填');

        fireEvent.click(tag);
        expect(chipByLabel('必填').getAttribute('aria-pressed')).toBe('true');

        fireEvent.click(chipByLabel('必填'));
        expect(chipByLabel('必填').getAttribute('aria-pressed')).toBe('false');
        expect(chipByLabel('全部').getAttribute('aria-pressed')).toBe('true');
    }, 20000);

    it('「清除筛选」只在有筛选时出现，点了把 chip 与搜索一起复位', async () => {
        await openCoreTab();
        expect(screen.queryByText('清除筛选')).toBeNull();

        fireEvent.click(chipByLabel('必填'));
        fireEvent.click(screen.getByText('清除筛选'));

        expect(screen.queryByText('清除筛选')).toBeNull();
        expect(chipByLabel('全部').getAttribute('aria-pressed')).toBe('true');
    }, 20000);
});
