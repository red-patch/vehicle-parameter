import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssetBatchFieldEditor from '../AssetBatchFieldEditor';
import { DEFAULT_FACET_VOCAB } from '../../../utils/assetFacets';
import type { FieldEditSourceRow } from '../../../utils/assetFieldEdit';

const rows: FieldEditSourceRow[] = [
    {
        fileName: 'v6e-empty.json', productName: 'V6E 客运版', isLatest: true,
        params: [], facets: undefined,
    },
    {
        fileName: 'v6e-filled.json', productName: 'V6E 货运版', isLatest: false,
        params: [{ id: 'g::整备质量', group: 'g', name: '整备质量', value: '1980' }],
    },
];

/** antd Select：开下拉并点选某选项（字段选择器是第一个 .ant-select） */
const pickFieldOption = (optionText: string) => {
    const selector = document.querySelectorAll('.ant-select')[0] as HTMLElement;
    fireEvent.mouseDown(within(selector).getByRole('combobox'));
    const option = Array.from(document.querySelectorAll('.ant-select-item-option'))
        .find(o => o.textContent?.includes(optionText));
    if (!option) throw new Error(`未找到选项：${optionText}`);
    fireEvent.click(option);
};

/** antd AutoComplete 的值输入：placeholder 渲染为 .ant-select-placeholder 而非 input 属性 */
const valueInput = () => document.querySelectorAll('.ant-select')[1].querySelector('input') as HTMLInputElement;

const renderEditor = (overrides: Partial<React.ComponentProps<typeof AssetBatchFieldEditor>> = {}) =>
    render(
        <AssetBatchFieldEditor
            open
            rows={rows}
            paramFields={[{ name: '整备质量', group: '质量参数' }]}
            vocab={DEFAULT_FACET_VOCAB}
            getParamEnumValues={() => ['1980', '1990']}
            onClose={vi.fn()}
            onSave={vi.fn()}
            {...overrides}
        />,
    );

describe('AssetBatchFieldEditor', () => {
    afterEach(() => { cleanup(); vi.clearAllMocks(); });

    it('未选字段时提示先选字段，保存禁用', () => {
        renderEditor();
        expect(screen.getByText('先选择要维护的字段')).toBeTruthy();
        expect(screen.getByRole('button', { name: /预览并保存/ }).closest('button')).toBeDisabled();
    });

    it('选中字段即列出资产与当前值（尚未填新值时也如此）', () => {
        renderEditor();
        pickFieldOption('质量参数·整备质量');
        // 回归：此前预览在填新值前不生成，选完字段看到空表，误判字段不存在
        expect(screen.getByText('V6E 客运版')).toBeTruthy();
        expect(screen.getByText('V6E 货运版')).toBeTruthy();
        expect(screen.getByText('1980')).toBeTruthy();
        expect(screen.queryByText('没有符合条件的资产')).toBeNull();
        // 未填新值 → 无可动作行，保存仍禁用
        expect(screen.getByRole('button', { name: /预览并保存/ }).closest('button')).toBeDisabled();
    });

    it('选参数字段并填值后，逐台展示判定与当前值', () => {
        renderEditor();
        pickFieldOption('质量参数·整备质量');
        fireEvent.change(valueInput(), { target: { value: '1990' } });

        expect(screen.getByText('V6E 客运版')).toBeTruthy();
        // 空资产 → 新增行；有值且不同 → 覆盖
        expect(screen.getByText('新增行')).toBeTruthy();
        expect(screen.getByText('覆盖 ⚠')).toBeTruthy();
        expect(screen.getByText('1980')).toBeTruthy();
    });

    it('确认写入时只提交可动作行（排除 same）', () => {
        const onSave = vi.fn();
        renderEditor({ onSave });
        pickFieldOption('质量参数·整备质量');
        fireEvent.change(valueInput(), { target: { value: '1980' } });

        // filled 行与 1980 一致 → same，不可勾；empty 行 → 新增行，默认勾选
        const saveBtn = screen.getByRole('button', { name: /预览并保存（1）/ }).closest('button')!;
        fireEvent.click(saveBtn);

        expect(onSave).toHaveBeenCalledTimes(1);
        const payload = onSave.mock.calls[0][0];
        expect(payload.target).toEqual({ layer: 'param', name: '整备质量' });
        expect(payload.value).toBe('1980');
        expect(payload.rows.map((r: { fileName: string }) => r.fileName)).toEqual(['v6e-empty.json']);
    });

    it('仅最新版范围收窄候选行', () => {
        renderEditor();
        pickFieldOption('质量参数·整备质量');
        fireEvent.change(valueInput(), { target: { value: '1990' } });
        fireEvent.click(screen.getByLabelText('仅最新版'));

        expect(screen.getByText('V6E 客运版')).toBeTruthy();
        expect(screen.queryByText('V6E 货运版')).toBeNull();
    });

    it('受控属性字段（主机厂）走词表输入', () => {
        renderEditor();
        pickFieldOption('主机厂');
        // 切到 facet 目标后值输入器仍在（AutoComplete），占位文案随目标变化
        expect(valueInput()).toBeTruthy();
        expect(screen.getByText('选择或输入（可新增）')).toBeTruthy();
    });
});
