import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EnumImportModal from '../EnumImportModal';

/**
 * 批次 8（设计：docs/plans/2026-10-16-列表页设计语言-design.md §7 批次 8 / §4.2）：
 * 弹窗内的表格**只遵守「表格内部」**（行高契约、单元格纪律、控件形态），
 * 不要求有标题行/导出区——Modal 自身已有标题与关闭。
 *
 * 全批 9 个弹窗表实测：8 个已零违规（行高契约在 index.css、size 走 DataTable 默认
 * 全局生效）；本文件是唯一有实修的——两处裸搜索框。
 *
 * 注意：字段搜索框在「选完 Excel 文件」之后才渲染，本用例只锁定结构契约
 * （不套页面级外壳）；搜索框的形态由 uiConsistency 的 R2 规则静态保证。
 */

afterEach(() => cleanup());

const renderIt = () =>
    render(<EnumImportModal open onClose={() => {}} assetLibraryPath="/tmp/lib" onImported={vi.fn()} />);

describe('枚举导入弹窗的容器形态（批次 8）', () => {
    it('不渲染自己的页面级外壳（弹窗内表只守表格内部，§4.2）', () => {
        const { container } = renderIt();
        // 不应出现 ListToolbar 的外壳类——弹窗有自己的 Modal 头，套外壳是双重 chrome
        expect(container.querySelector('.surface-container.border.rounded-lg')).toBeNull();
    });

    it('弹窗照常渲染标题与内容（迁移未破坏基本结构）', () => {
        renderIt();
        // antd Modal 走 portal 渲染到 body，不在 container 内
        expect(document.querySelector('.ant-modal')).not.toBeNull();
        expect(document.body.textContent).toContain('选择 Excel 文件');
    });
});
