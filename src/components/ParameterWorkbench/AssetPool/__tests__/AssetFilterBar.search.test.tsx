import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssetFilterBar from '../AssetFilterBar';
import { EMPTY_FACET_SELECTION } from '../../../../utils/facetFilters';
import { DEFAULT_FACET_VOCAB } from '../../../../utils/assetFacets';

/**
 * 批次 7（设计：docs/plans/2026-10-16-列表页设计语言-design.md §7.1）：
 * 批次 7 已收窄为「只把搜索框换 SearchInput」——ChipShell 与布局不得改动。
 *
 * 本用例的双重职责：
 * 1. 搜索框确实走规范构件；
 * 2. **资产池筛选条的布局与 ChipShell 未被顺手改掉**（用户明确要求保护）。
 *    第 2 点比第 1 点重要——它是防止「统一」误伤的护栏。
 */

afterEach(() => cleanup());

const renderBar = (over: Partial<React.ComponentProps<typeof AssetFilterBar>> = {}) =>
    render(
        <AssetFilterBar
            searchKeyword=""
            onSearchKeywordChange={vi.fn()}
            facetSelection={EMPTY_FACET_SELECTION}
            onFacetSelectionChange={vi.fn()}
            facetVocab={DEFAULT_FACET_VOCAB}
            facetItems={[]}
            allTags={[]}
            selectedTags={[]}
            onSelectedTagsChange={vi.fn()}
            statusSelection={[]}
            onStatusSelectionChange={vi.fn()}
            onClearAll={vi.fn()}
            {...over}
        />,
    );

describe('资产筛选条 搜索框（批次 7）', () => {
    it('搜索框走 SearchInput，带搜索图标', () => {
        const { container } = renderBar();
        expect(screen.getByPlaceholderText('搜名字、公告号、标签')).toBeInTheDocument();
        expect(container.querySelector('.ant-input-affix-wrapper .anticon-search')).not.toBeNull();
    });

    it('搜索框撑满可用宽度（fluid），不写死像素——否则同行 chips 会被挤走', () => {
        const { container } = renderBar();
        const wrap = container.querySelector('.ant-input-affix-wrapper') as HTMLElement;
        expect(wrap).not.toBeNull();
        // 无内联 width（固定档才会写），改由 flex 撑满 + 最小宽度
        expect(wrap.style.width).toBe('');
        expect(wrap.className).toContain('flex-1');
        expect(wrap.className).toMatch(/min-w-/);
    });

    it('改动输入会回传（迁移未破坏交互）', () => {
        const onChange = vi.fn();
        renderBar({ onSearchKeywordChange: onChange });
        const input = screen.getByPlaceholderText('搜名字、公告号、标签');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, 'V8E');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        expect(onChange).toHaveBeenCalledWith('V8E');
    });
});

describe('资产筛选条 布局与 ChipShell 保护（批次 7 不变量）', () => {
    it('五个 facet chip 全部在位（电量/准入公告/电池品牌/标签/状态）', () => {
        renderBar();
        for (const label of ['电量', '准入公告', '电池品牌', '标签', '状态']) {
            expect(screen.getByText(label), `facet chip「${label}」不应消失`).toBeInTheDocument();
        }
    });

    it('chip 是可点开的下拉（ChipShell 的 Popover 触发器仍在）', () => {
        const { container } = renderBar();
        // ChipShell 渲染成带 caret 的触发块；数量应与 facet 维度一致
        const carets = container.querySelectorAll('.anticon-caret-down');
        expect(carets.length).toBeGreaterThanOrEqual(5);
    });

    it('未混入 FacetChips（它是平铺式，换掉会改变资产池筛选交互）', () => {
        const { container } = renderBar();
        // 更稳的判据：FacetChips 渲染成 .ant-tag；ChipShell 渲染成带 caret 的可点 <div>。
        // 断言「本筛选条内没有任何 ant-tag」——不依赖 FacetChips 当前的类名实现。
        expect(container.querySelectorAll('.ant-tag')).toHaveLength(0);
    });
});
