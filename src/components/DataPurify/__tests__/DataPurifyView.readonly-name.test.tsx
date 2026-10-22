import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

import DataPurifyView from '../DataPurifyView';
import { useVehicleStore } from '../../../store/vehicleStore';
import type { SheetData } from '../../../types';

/**
 * 参数名只读（`docs/plans/2026-10-19-参数名只读-design.md`）。
 *
 * 参数名是跨车型比对、字段组取数、公告比对的键：体检页改它会在资产里
 * 造出同义重复字段，且漂移无溯源。本页只告警，修正走源数据。
 */

const PRODUCT = '测试车';
const SHEET: SheetData = {
    fileName: 'demo.xlsx',
    rawHeaders: ['参数分组', '参数名称', '参数值'],
    productName: PRODUCT,
    data: [
        { id: 'p1', group: '基本参数', name: '整备质量', value: '1000', productName: PRODUCT },
        { id: 'p2', group: '基本参数', name: '轴距', value: '3000', productName: PRODUCT },
    ],
};

afterEach(() => {
    cleanup();
    useVehicleStore.setState({ selectedProductNames: [], uploadedFiles: [], assetLibraryPath: null });
});

describe('数据体检 参数名只读', () => {
    const renderIt = () => {
        useVehicleStore.setState({
            uploadedFiles: [SHEET],
            selectedProductNames: [`excel::${SHEET.fileName}::${PRODUCT}`],
            assetLibraryPath: null,
        } as never);
        return render(<DataPurifyView />);
    };

    it('点参数名不进入编辑态（不出现输入框）', () => {
        renderIt();
        fireEvent.click(screen.getByText('整备质量'));
        expect(screen.queryByPlaceholderText('输入参数名')).toBeNull();
        expect(screen.queryByDisplayValue('整备质量')).toBeNull();
    });

    it('没有「推荐的标准字段名」这个就地改名入口', () => {
        renderIt();
        fireEvent.click(screen.getByText('整备质量'));
        expect(screen.queryByText('推荐的标准字段名')).toBeNull();
        expect(screen.queryByText('无匹配的推荐字段名')).toBeNull();
    });

    it('未配置字段词表时不能新增参数（名字只能取自词表）', () => {
        renderIt();
        expect(screen.getByText('手动新增参数').closest('button')).toBeDisabled();
        expect(screen.getByText('未配置字段词表')).toBeInTheDocument();
    });
});
