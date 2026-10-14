import { writeTextFile, readTextFile, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import type { FacetSelection } from './facetFilters';
import { EMPTY_FACET_SELECTION } from './facetFilters';
import type { AssetSortSpec } from './assetSort';
import { DEFAULT_ASSET_SORT } from './assetSort';
import type { AssetGroupDim } from './assetGrouping';
import { DEFAULT_ASSET_GROUP } from './assetGrouping';

/**
 * 视图库（设计文档 2026-10-14-asset-pool-multigroup-views-design §3.2）：
 * 一份「筛选 + 分组维数组 + 排序 + 列数」的完整快照，随资产库落盘到 _asset_views.json
 * （与 _asset_tags.json / _asset_meta.json 同族，`_` 前缀被扫描天然跳过）。
 */

export const VIEWS_FILE = '_asset_views.json';

/** 列数模式（与 AssetPoolLayout.ColumnMode 同型；此处独立声明避免循环依赖） */
export type ColumnMode = 'auto' | 1 | 2 | 3 | 4;

/** 状态筛选维度值（与 AssetPoolLayout.StatusFilter 同型） */
export type StatusFilter = 'latest' | 'keyVehicle' | 'selected' | 'superseded' | 'deprecated' | 'rejected';

/** 面板完整状态快照（视图内容） */
export interface AssetViewState {
    searchKeyword: string;
    facetSelection: FacetSelection;
    selectedTags: string[];
    statusSelection: StatusFilter[];
    governanceView: string | null;
    groupDims: AssetGroupDim[];
    sortSpec: AssetSortSpec;
    columnMode: ColumnMode;
}

export interface AssetView {
    id: string;
    name: string;
    /** 内置视图：不可删，可"另存为" */
    builtin?: boolean;
    state: AssetViewState;
}

export const EMPTY_VIEW_STATE: AssetViewState = {
    searchKeyword: '',
    facetSelection: EMPTY_FACET_SELECTION,
    selectedTags: [],
    statusSelection: [],
    governanceView: null,
    groupDims: [DEFAULT_ASSET_GROUP],
    sortSpec: DEFAULT_ASSET_SORT,
    columnMode: 'auto',
};

/** 内置默认视图（3 个，开箱即用） */
export const BUILTIN_VIEWS: AssetView[] = [
    {
        id: 'builtin:all',
        name: '全部资产',
        builtin: true,
        state: { ...EMPTY_VIEW_STATE, groupDims: [] },
    },
    {
        id: 'builtin:key',
        name: '关键车型',
        builtin: true,
        state: {
            ...EMPTY_VIEW_STATE,
            selectedTags: ['关键车型'],
            groupDims: ['manufacturer', 'vehicleFamily'],
            sortSpec: { dim: 'fillRate', dir: 'desc' },
        },
    },
    {
        id: 'builtin:governance',
        name: '待治理',
        builtin: true,
        state: {
            ...EMPTY_VIEW_STATE,
            governanceView: 'namingIssue',
            groupDims: ['status', 'manufacturer'],
            sortSpec: { dim: 'paramCount', dir: 'desc' },
        },
    },
];

/** 生成视图 id */
export const newViewId = (): string =>
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? `view:${crypto.randomUUID()}`
        : `view:${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** 规范化：补全缺失字段（容忍旧文件/手改） */
const normalizeView = (raw: unknown): AssetView | null => {
    if (!raw || typeof raw !== 'object') return null;
    const v = raw as Partial<AssetView>;
    if (typeof v.id !== 'string' || typeof v.name !== 'string' || !v.state) return null;
    return {
        id: v.id,
        name: v.name,
        builtin: Boolean(v.builtin),
        state: {
            ...EMPTY_VIEW_STATE,
            ...v.state,
            facetSelection: { ...EMPTY_FACET_SELECTION, ...(v.state.facetSelection ?? {}) },
            sortSpec: { ...DEFAULT_ASSET_SORT, ...(v.state.sortSpec ?? {}) },
        },
    };
};

/**
 * 加载视图库：文件不存在/损坏 → 返回内置预设（不阻断面板）。
 * 用户视图在前还是内置在前由 UI 决定，这里按「内置在前 + 用户视图在后」返回。
 */
export const loadAssetViews = async (libraryPath: string): Promise<AssetView[]> => {
    try {
        const fullPath = await join(libraryPath, VIEWS_FILE);
        if (!await exists(fullPath)) return BUILTIN_VIEWS;
        const content = await readTextFile(fullPath);
        const parsed = JSON.parse(content) as unknown;
        const userViews = Array.isArray(parsed)
            ? parsed.map(normalizeView).filter((v): v is AssetView => v !== null && !v.builtin)
            : [];
        return [...BUILTIN_VIEWS, ...userViews];
    } catch (error) {
        console.error('Failed to load asset views', error);
        return BUILTIN_VIEWS;
    }
};

/** 保存视图库：只落盘用户视图（内置预设是代码常量，不入文件） */
export const saveAssetViews = async (libraryPath: string, views: AssetView[]): Promise<void> => {
    try {
        const fullPath = await join(libraryPath, VIEWS_FILE);
        const userViews = views.filter(v => !v.builtin);
        await writeTextFile(fullPath, JSON.stringify(userViews, null, 2));
    } catch (error) {
        console.error('Failed to save asset views', error);
    }
};
