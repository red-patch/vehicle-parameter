// 批量添加目标字段时，唯一命中的自动绑来源（模糊/歧义不绑）
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 本环境 localStorage 是无 setItem 的空壳，真实 store 的 persist 会抛错。
// zustand 在 store 创建时就解析了 storage，故必须在 import 前替换（vi.hoisted）。
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

const { default: BidMappingDrawer } = await import('../BidMappingDrawer');
const { useVehicleStore } = await import('../../../store/vehicleStore');
const { createDefaultBidScheme: makeDefault } = await import('../../../utils/bidFieldMapping');

/** 空方案 + 一池可精确/按别名命中的系统字段 */
const emptyScheme = { id: 'bid-empty', name: '空方案', rules: [] };
const candidates = ['外形尺寸长', '轴距', '整备质量(kg)'].map((name) => ({
    id: name,
    group: '基础信息',
    name,
    value: '1',
}));

vi.mock('../../../utils/bidFieldMapping', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../utils/bidFieldMapping')>();
    return {
        ...actual,
        getBidSchemesSync: () => [emptyScheme, makeDefault()],
        saveBidMappingsConfig: vi.fn(async () => true),
        reloadBidMappings: vi.fn(async () => undefined),
    };
});

/** 当前方案折叠开的下拉里选中项 */
const schemeTitle = (): string | null =>
    document.querySelector('.ant-drawer .ant-select-content-value')?.getAttribute('title') ?? null;

/**
 * 按文本点按钮。不去用 getByRole —— 可访问名计算会走 jsdom 的样式级联，
 * 页面里的 Tailwind 任意值类会把它带进非法选择器（见 newScheme 测试注释）。
 * 另注意 antd 会给两个汉字的按钮插一个空格（“添 加”），故比较前先去掉所有空白。
 */
const clickButton = (text: string) => {
    const norm = (s: string | null) => (s ?? '').replace(/\s+/g, '');
    const btn = Array.from(document.querySelectorAll('button')).find((b) => norm(b.textContent).includes(norm(text)));
    if (!btn) throw new Error(`未找到按钮：${text}`);
    fireEvent.click(btn);
};

/**
 * 已绑定的来源值。来源是 antd AutoComplete，placeholder 挂在展示层而非真 input，
 * 所以按 ant-select-input 类取，并滤掉空值（未绑定的规则不渲染来源行）。
 */
const sourceValues = (): string[] =>
    Array.from(document.querySelectorAll('input.ant-select-input'))
        .map((el) => (el as HTMLInputElement).value)
        .filter(Boolean);

const targetValues = (): string[] =>
    Array.from(document.querySelectorAll('input[placeholder^="投标字段名"]')).map(
        (el) => (el as HTMLInputElement).value
    );

describe('批量添加自动匹配来源', () => {
    beforeEach(() => {
        useVehicleStore.setState({
            bidPullSchemeId: emptyScheme.id,
            uploadedFiles: [{ fileName: 'pool.xlsx', rawHeaders: [], data: candidates }],
        });
    });

    afterEach(() => {
        cleanup();
        useVehicleStore.setState({ bidPullSchemeId: null, uploadedFiles: [] });
    });

    it('唯一命中的字段自动绑来源；歧义字段留空待手选', async () => {
        render(<BidMappingDrawer open onClose={() => {}} />);
        await waitFor(() => expect(schemeTitle()).toBe('空方案（0 项）'));

        // 轴距：精确命中；车长：唯一别名命中；状态：跨组歧义 → 不绑
        const textarea = document.querySelector('.ant-drawer textarea') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: '轴距\n车长\n状态' } });
        clickButton('添加');

        await waitFor(() => expect(targetValues()).toEqual(['轴距', '车长', '状态']));

        // 前两条各有一个来源输入框（已自动绑定），第三条没有
        expect(sourceValues()).toEqual(['轴距', '外形尺寸长']);
        // 「状态」不唯一，不该被绑到「整备质量(kg)」
        expect(sourceValues()).not.toContain('整备质量(kg)');
    });
});
