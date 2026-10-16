import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ShortcutsSection from '../sections/ShortcutsSection';
import { SHORTCUTS } from '../../../constants/shortcuts';

const titleOf = (id: string) => SHORTCUTS.find(s => s.id === id)!.description;

describe('ShortcutsSection', () => {
    afterEach(cleanup);

    it('渲染四个作用域分组', () => {
        render(<ShortcutsSection />);
        for (const label of ['全局', '车型资产池', '整车设计', '系统菜单（macOS）']) {
            expect(screen.getByText(label)).toBeInTheDocument();
        }
    });

    it('全量条目都出现（按 id 逐条核对说明文案）', () => {
        render(<ShortcutsSection />);
        for (const entry of SHORTCUTS) {
            // 说明文案可能与他项重复，故用 getAllByText 断言「至少出现一次」
            expect(screen.getAllByText(entry.description).length).toBeGreaterThan(0);
        }
    });

    it('检测到冲突时出横幅并列出冲突组', () => {
        render(<ShortcutsSection />);
        expect(screen.getByText(/检测到 \d+ 组按键冲突/)).toBeInTheDocument();
        // mod+s 与 escape 两组的说明里都提到「同时占用」
        expect(screen.getAllByText(/同时占用/).length).toBeGreaterThanOrEqual(2);
    });

    it('冲突条目标「冲突」Tag', () => {
        render(<ShortcutsSection />);
        // 冲突条目（global.save / system.save-view / global.escape / pool.escape）应各有一个 Tag
        expect(screen.getAllByText('冲突').length).toBeGreaterThanOrEqual(4);
    });

    it('搜索过滤生效', () => {
        render(<ShortcutsSection />);
        // 搜「视图」应命中「保存当前视图」，且未命中的条目消失
        fireEvent.change(screen.getByPlaceholderText(/搜索快捷键/), { target: { value: '视图' } });
        expect(screen.getAllByText(titleOf('pool.save-view')).length).toBeGreaterThan(0);
        expect(screen.queryByText(titleOf('global.settings'))).not.toBeInTheDocument();
    });

    it('搜索无命中显示空态', () => {
        render(<ShortcutsSection />);
        fireEvent.change(screen.getByPlaceholderText(/搜索快捷键/), { target: { value: 'zzzzz' } });
        expect(screen.getByText('没有匹配的快捷键')).toBeInTheDocument();
    });
});
