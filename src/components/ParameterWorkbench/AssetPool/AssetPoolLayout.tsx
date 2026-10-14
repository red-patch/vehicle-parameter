import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { message, Button, Popover } from 'antd';
import { ClusterOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import AssetSidebar from './AssetSidebar';
import AssetFilterBar from './AssetFilterBar';
import AssetCart from './AssetCart';
import AssetCard from './AssetCard';
import AssetAliasBatchModal from './AssetAliasBatchModal';
import AssetHotkeyCheatsheet from './AssetHotkeyCheatsheet';
import { useAssetPoolHotkeys } from './useAssetPoolHotkeys';
import AssetInspector from '../AssetInspector';
import AssetBatchTagBar from '../AssetBatchTagBar';
import GovernanceReportModal from '../GovernanceReportModal';
import AssetBatchFieldEditor, { type ParamFieldOption } from '../../AssetLibrary/AssetBatchFieldEditor';
import { getAllAttributeNames, getEnumValuesSync } from '../../../utils/attributeEnums';
import { applyParamFieldEdit, FACET_DIM_LABELS, type FieldEditRow, type FieldEditSourceRow, type FieldTarget } from '../../../utils/assetFieldEdit';
import type { VehicleParameter } from '../../../types';
import { useAssetActions } from '../useAssetActions';
import { useContextMenu } from '../../../hooks/useContextMenu';
import { useVehicleStore } from '../../../store/vehicleStore';
import { useAnnouncementStore } from '../../../store/announcementStore';
import { useAssetLibrarySnapshot } from '../../../hooks/useAssetLibrarySnapshot';
import { buildVehicleInstanceKey } from '../../../utils/vehicleInstance';
import { matchFacets, isFacetSelectionActive, type FacetSelection, EMPTY_FACET_SELECTION } from '../../../utils/facetFilters';
import { validateAssetName } from '../../../utils/assetNaming';
import { buildAliasSource, resolveAssetDisplayName } from '../../../utils/assetAlias';
import {
    sortAssetRowsByMode, DEFAULT_ASSET_SORT, ASSET_SORT_LABELS, ASSET_SORT_DEFAULT_DIR,
    type AssetSortSpec, type AssetSortDim,
} from '../../../utils/assetSort';
import {
    buildAssetGroupsMulti, ASSET_GROUP_LABELS, DEFAULT_ASSET_GROUP, MAX_GROUP_LEVELS,
    type AssetGroupDim, type AssetGroupDimContext,
} from '../../../utils/assetGrouping';
import AssetGroupTree from './AssetGroupTree';
import ViewDropdown from './ViewDropdown';
import { Modal, Input } from 'antd';
import {
    loadAssetViews, saveAssetViews, newViewId, BUILTIN_VIEWS,
    type AssetView, type AssetViewState,
} from '../../../utils/assetViews';
import {
    KEY_VEHICLE_TAG, extractBrandNames, resolveVehicleGroupKey, buildGovernanceReport,
    buildSupersedeMeta, pickGroupAlias, sanitizeGroupName, normalizeGroupKey, buildGroupRenameMeta,
    type UnconvergedCar, type VehicleGroup,
} from '../../../utils/assetGovernance';
import { isFieldRequired } from '../../../assets/requiredFields';
import { getProductData } from '../../../store/vehicleSelectors';
import {
    resolveAssetFacets, loadFacetVocab, loadFacetValues, saveFacetVocab, saveFacetValues,
    collectUnmappedValues, setAssetFacetOverride, addVocabValue,
    DEFAULT_FACET_VOCAB, EMPTY_FACET_VALUES,
    type FacetVocab, type FacetValues, type ResolvedFacets,
    type AssetFacetOverride,
} from '../../../utils/assetFacets';
import { batchAddAssetTags, saveAssetMeta, setAssetAlias, loadAssetFile, saveAssetFile } from '../../../utils/assetManager';
import { getAssetTagGroupsSync, ensureTagsInDefaultGroup, getExclusiveGroupTagSets } from '../../../utils/assetTagGroups';
import type { AssetFileInfo } from '../../../utils/assetManager';

/**
 * 资产池三栏布局（设计文档 2026-10-13-asset-panel-redesign-v2 §3.1）：
 * - 左栏（240px）：快速导航（主机厂/族群）+ 治理视角（预置筛选）+ 工具
 * - 中间主区（弹性）：筛选条 + 车型卡片列表
 * - 右栏（300px）：购物车（已选工作集）
 */
export interface AssetPoolLayoutProps {
    onGoCompare?: () => void;
}

/** 状态筛选的维度值 */
export type StatusFilter = 'latest' | 'keyVehicle' | 'selected' | 'superseded' | 'deprecated' | 'rejected';

/** 列数模式：自动（按容器宽）/ 固定 1-4 列（1 列 = 横向列表行） */
export type ColumnMode = 'auto' | 1 | 2 | 3 | 4;

const COLUMN_MODE_LABELS: Record<string, string> = {
    auto: '自动', '1': '1 列（列表）', '2': '2 列', '3': '3 列', '4': '4 列',
};

/** 保存视图小弹窗 */
const SaveViewModal: React.FC<{
    open: boolean;
    seedName: string;
    onCancel: () => void;
    onConfirm: (name: string) => void;
}> = ({ open, seedName, onCancel, onConfirm }) => {
    const [name, setName] = React.useState('');
    React.useEffect(() => { if (open) setName(seedName); }, [open, seedName]);
    return (
        <Modal
            title="保存当前视图"
            open={open}
            onCancel={onCancel}
            onOk={() => { if (name.trim()) onConfirm(name.trim()); }}
            okText="保存"
            cancelText="取消"
            destroyOnClose
        >
            <div className="py-1">
                <div className="text-body text-2 mb-1.5">视图名称</div>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="如：吉利大面待办" autoFocus onPressEnter={() => { if (name.trim()) onConfirm(name.trim()); }} />
                <div className="text-caption text-3 mt-1.5">保存当前的筛选、分组、排序与列数设置</div>
            </div>
        </Modal>
    );
};

const AssetPoolLayout: React.FC<AssetPoolLayoutProps> = ({ onGoCompare }) => {
    const {
        assetLibraryPath,
        addActiveAsset,
        removeActiveAsset,
        selectedProductNames,
        assetFiles,
        uploadedFiles,
        bumpAssetTagGroupsVersion,
    } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        addActiveAsset: state.addActiveAsset,
        removeActiveAsset: state.removeActiveAsset,
        selectedProductNames: state.selectedProductNames,
        assetFiles: state.assetFiles,
        uploadedFiles: state.uploadedFiles,
        bumpAssetTagGroupsVersion: state.bumpAssetTagGroupsVersion,
    })));
    const snapshot = useAssetLibrarySnapshot();

    // ===== 筛选状态 =====
    const [searchKeyword, setSearchKeyword] = useState('');
    const [facetSelection, setFacetSelection] = useState<FacetSelection>(EMPTY_FACET_SELECTION);
    const [governanceView, setGovernanceView] = useState<string | null>(null);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [statusSelection, setStatusSelection] = useState<StatusFilter[]>([]);

    // ===== 视图库（设计文档 2026-10-14-asset-pool-multigroup-views-design §3.2） =====
    const [views, setViews] = useState<AssetView[]>(BUILTIN_VIEWS);
    const [activeViewId, setActiveViewId] = useState<string | null>(() => {
        try { return localStorage.getItem('asset-pool-active-view'); } catch { return null; }
    });
    const [saveViewOpen, setSaveViewOpen] = useState(false);
    const [saveViewSeed, setSaveViewSeed] = useState<AssetView | null>(null);

    // ===== 选中态 / 定位 / 检查器 / 批量模式 =====
    const [focusedFile, setFocusedFile] = useState<string | null>(null);
    const [locateRequest, setLocateRequest] = useState<{ fileName: string; nonce: number } | null>(null);
    const [inspectorTarget, setInspectorTarget] = useState<string | null>(null);
    const [batchMode, setBatchMode] = useState(false);
    const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set());

    // ===== 左栏折叠 + 购物车浮层 =====
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        try { return localStorage.getItem('asset-panel-sidebar-collapsed') === '1'; } catch { return false; }
    });
    const toggleSidebar = useCallback(() => {
        setSidebarCollapsed(prev => {
            const next = !prev;
            try { localStorage.setItem('asset-panel-sidebar-collapsed', next ? '1' : '0'); } catch (e) { console.warn(e); }
            return next;
        });
    }, []);
    const [cartExpanded, setCartExpanded] = useState(false);
    const [aliasBatchOpen, setAliasBatchOpen] = useState(false);
    // 车型组重命名（写 meta.groupName；只改组头显示名，不改文件名）
    const [groupRename, setGroupRename] = useState<{ open: boolean; groupKey: string | null; name: string }>({ open: false, groupKey: null, name: '' });

    const actions = useAssetActions({ focusedFile, onFocusFile: setFocusedFile });
    const { onContextMenu, ContextMenuPortal } = useContextMenu();

    // ===== 公告中心关联（设计文档 2026-10-01-announcement-center §4.4） =====
    const announcementLoadFor = useAnnouncementStore(state => state.loadFor);
    useEffect(() => {
        announcementLoadFor(assetLibraryPath);
    }, [assetLibraryPath, announcementLoadFor]);

    // 公告中心「查看关联资产」跳转：消费待应用的公告号过滤（一次性）
    const pendingAnnounceNoFilter = useVehicleStore(state => state.pendingAnnounceNoFilter);
    const setPendingAnnounceNoFilter = useVehicleStore(state => state.setPendingAnnounceNoFilter);
    useEffect(() => {
        if (pendingAnnounceNoFilter && pendingAnnounceNoFilter.length > 0) {
            setFacetSelection(prev => ({ ...prev, announceNos: [...pendingAnnounceNoFilter] }));
            setPendingAnnounceNoFilter(null);
        }
    }, [pendingAnnounceNoFilter, setPendingAnnounceNoFilter]);

    // ===== Facet 词表与取值 =====
    const [facetVocab, setFacetVocab] = useState<FacetVocab>(DEFAULT_FACET_VOCAB);
    const [facetValues, setFacetValues] = useState<FacetValues>(EMPTY_FACET_VALUES);

    useEffect(() => {
        if (!assetLibraryPath) return;
        let cancelled = false;
        (async () => {
            const [vocab, values] = await Promise.all([
                loadFacetVocab(assetLibraryPath),
                loadFacetValues(assetLibraryPath),
            ]);
            if (!cancelled) {
                setFacetVocab(vocab);
                setFacetValues(values);
            }
        })();
        return () => { cancelled = true; };
    }, [assetLibraryPath]);

    // ===== 治理报告（版本链/分组；latestSet 与 versionIssue 共用） =====
    const assetTagGroupsVersion = useVehicleStore(state => state.assetTagGroupsVersion);
    const brandNames = useMemo(
        () => extractBrandNames(getAssetTagGroupsSync().groups),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [assetTagGroupsVersion],
    );
    const governanceReport = useMemo(
        () => buildGovernanceReport(snapshot.infos, snapshot.meta, brandNames, info => info.announceNos || []),
        [snapshot.infos, snapshot.meta, brandNames],
    );
    // 别名解析上下文：身份键 + 版本链继承（设计 §6.2）。latestSet 即治理报告的链头集合。
    const aliasSource = useMemo(
        () => buildAliasSource(snapshot.infos, snapshot.meta, snapshot.latestSet, info => resolveVehicleGroupKey(info, snapshot.meta[info.fileName], brandNames)),
        [snapshot.infos, snapshot.meta, snapshot.latestSet, brandNames],
    );
    const cardDisplayName = useCallback(
        (info: { fileName: string; productName: string }) => resolveAssetDisplayName(info, aliasSource),
        [aliasSource],
    );
    const versionIssueFileNames = useMemo(() => {
        const set = new Set<string>();
        governanceReport.unconvergedCars.forEach(car => car.files.forEach(f => set.add(f.info.fileName)));
        return set;
    }, [governanceReport]);

    // ===== 逐资产受控属性解析（fileFacets） =====
    const fileFacets = useMemo(() => {
        const map = new Map<string, ResolvedFacets>();
        snapshot.infos.forEach(info => {
            map.set(info.fileName, resolveAssetFacets({
                fileName: info.fileName,
                groupKey: resolveVehicleGroupKey(info, snapshot.meta[info.fileName], brandNames),
                info,
                tags: snapshot.tags[info.fileName],
                values: facetValues,
                vocab: facetVocab,
            }));
        });
        return map;
    }, [snapshot.infos, snapshot.meta, snapshot.tags, facetVocab, facetValues, brandNames]);

    // facet 面板候选集（默认隐藏废弃，与列表同口径）
    const facetItems = useMemo(() => {
        return snapshot.infos
            .filter(a => snapshot.meta[a.fileName]?.status !== 'deprecated')
            .map(a => fileFacets.get(a.fileName))
            .filter((f): f is ResolvedFacets => !!f)
            .map(facets => ({ facets }));
    }, [snapshot.infos, snapshot.meta, fileFacets]);

    // ===== 治理体检弹窗 =====
    const [governanceOpen, setGovernanceOpen] = useState(false);
    const bumpAssetVersion = useVehicleStore(state => state.bumpAssetVersion);

    // ===== 批量字段维护（参数行 + 受控属性统一批量改值） =====
    const [fieldEditorOpen, setFieldEditorOpen] = useState(false);
    const [fieldEditorSeed, setFieldEditorSeed] = useState<{ fileNames: string[]; groupName?: string } | null>(null);
    const [fieldEditorData, setFieldEditorData] = useState<{ key: string; params: Record<string, VehicleParameter[]> } | null>(null);
    const [fieldEditorDataVersion, setFieldEditorDataVersion] = useState(0);

    const facetIssues = useMemo(() => {
        const missingCount = Array.from(fileFacets.values()).filter(f =>
            f.manufacturer === null || f.batteryBrand === null || f.capacityKwh === null || f.admissionLevel === null
        ).length;
        const mfrRaws = snapshot.infos.map(a => a.manufacturerRaw).filter((v): v is string => !!v);
        const brandRaws = snapshot.infos.map(a => a.batteryBrandRaw).filter((v): v is string => !!v);
        return {
            missingCount,
            unmapped: [
                { dim: '主机厂', values: collectUnmappedValues(facetVocab.manufacturer, mfrRaws) },
                { dim: '电池品牌', values: collectUnmappedValues(facetVocab.batteryBrand, brandRaws) },
            ],
        };
    }, [snapshot.infos, fileFacets, facetVocab]);

    const handleConvergeCars = useCallback(async (cars: UnconvergedCar[]) => {
        if (!assetLibraryPath || cars.length === 0) return;
        const pairs = cars.flatMap(car => car.files
            .filter(f => f.meta.status !== 'superseded' && f.meta.status !== 'deprecated' && f.info.fileName !== car.latestFileName)
            .map(f => ({ oldFileName: f.info.fileName, newFileName: car.latestFileName || f.info.fileName })));
        if (pairs.length === 0) {
            message.info('没有需要收敛的旧版本');
            return;
        }
        await saveAssetMeta(assetLibraryPath, buildSupersedeMeta(snapshot.meta, pairs));
        bumpAssetVersion();
        message.success(`已收敛 ${cars.length} 辆车的版本链（${pairs.length} 个旧版本标记为历史）`);
    }, [assetLibraryPath, snapshot.meta, bumpAssetVersion]);

    // ===== 批量字段维护：入口 / 数据加载 / 落盘 =====
    const openFieldEditor = useCallback((seed: { fileNames: string[]; groupName?: string }) => {
        if (seed.fileNames.length === 0) {
            message.warning('请先勾选要维护的资产');
            return;
        }
        setFieldEditorSeed(seed);
        setFieldEditorOpen(true);
        setFieldEditorDataVersion(v => v + 1);
    }, []);

    const closeFieldEditor = useCallback(() => {
        setFieldEditorOpen(false);
        setFieldEditorSeed(null);
    }, []);

    const fieldEditorRows = useMemo<FieldEditSourceRow[]>(() => {
        if (!fieldEditorSeed) return [];
        const byName = new Map(snapshot.infos.map(a => [a.fileName, a]));
        return fieldEditorSeed.fileNames
            .map(fileName => byName.get(fileName))
            .filter((info): info is AssetFileInfo => !!info && snapshot.meta[info.fileName]?.status !== 'deprecated')
            .map(info => ({
                fileName: info.fileName,
                productName: info.productName,
                isLatest: snapshot.latestSet.has(info.fileName),
                params: fieldEditorData?.params[info.fileName] ?? [],
                facets: fileFacets.get(info.fileName),
            }));
    }, [fieldEditorSeed, snapshot.infos, snapshot.meta, snapshot.latestSet, fieldEditorData, fileFacets]);

    // 打开时按需读盘：只加载候选资产的参数行
    useEffect(() => {
        if (!fieldEditorOpen || !fieldEditorSeed || !assetLibraryPath) return;
        const key = `${assetLibraryPath}\u0000${fieldEditorDataVersion}\u0000${fieldEditorSeed.fileNames.join(',')}`;
        if (fieldEditorData?.key === key) return;
        let cancelled = false;
        (async () => {
            const pairs = await Promise.all(fieldEditorSeed.fileNames.map(async fileName => {
                const sheet = await loadAssetFile(assetLibraryPath, fileName);
                return [fileName, sheet?.data ?? []] as const;
            }));
            if (cancelled) return;
            setFieldEditorData({ key, params: Object.fromEntries(pairs) });
        })();
        return () => { cancelled = true; };
    }, [fieldEditorOpen, fieldEditorSeed, assetLibraryPath, fieldEditorDataVersion, fieldEditorData]);

    /** 参数字段候选（受控词表）；fieldEditorDataVersion 每次打开递增，刷新词表缓存 */
    const paramFieldOptions = useMemo<ParamFieldOption[]>(
        () => getAllAttributeNames().map(name => ({ name })),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fieldEditorDataVersion],
    );

    const handleFieldEditorSave = useCallback(async (payload: {
        target: FieldTarget;
        value: string | number;
        rows: FieldEditRow[];
    }) => {
        if (!assetLibraryPath) return;
        const { target, value, rows } = payload;

        if (target.layer === 'facet') {
            if (target.dim === 'capacityKwh') {
                if (typeof value !== 'number' || !Number.isFinite(value)) {
                    message.warning('电量需为数值');
                    return;
                }
            } else if (typeof value !== 'string' || !value.trim()) {
                message.warning('请填写要设置的值');
                return;
            }
            let vocab = facetVocab;
            let next = facetValues;
            for (const row of rows) {
                let v: string | number = value;
                if (target.dim !== 'capacityKwh') {
                    const r = addVocabValue(vocab, target.dim, String(value));
                    vocab = r.vocab;
                    v = r.value;
                }
                next = setAssetFacetOverride(next, row.fileName, { [target.dim]: v } as AssetFacetOverride);
            }
            if (vocab !== facetVocab) setFacetVocab(vocab);
            setFacetValues(next);
            await saveFacetValues(assetLibraryPath, next);
            if (vocab !== facetVocab) await saveFacetVocab(assetLibraryPath, vocab);
            bumpAssetVersion();
            message.success(`已更新 ${rows.length} 个资产的${FACET_DIM_LABELS[target.dim]}`);
            closeFieldEditor();
            return;
        }

        if (typeof value !== 'string') { message.warning('参数值需为文本'); return; }
        const nowIso = new Date().toISOString();
        const failed: string[] = [];
        let saved = 0;
        for (const row of rows) {
            try {
                const sheet = await loadAssetFile(assetLibraryPath, row.fileName);
                if (!sheet) { failed.push(row.fileName); continue; }
                const params = applyParamFieldEdit(sheet.data, target, value, nowIso);
                if (params === sheet.data) continue;   // 无实际改动
                await saveAssetFile(
                    assetLibraryPath,
                    row.fileName,
                    sheet.productName || row.fileName.replace(/\.json$/i, ''),
                    params,
                    sheet.createdAt,
                );
                saved += 1;
            } catch (err) {
                console.error('批量写入参数失败', row.fileName, err);
                failed.push(row.fileName);
            }
        }
        bumpAssetVersion();
        if (failed.length > 0) {
            message.warning(`已更新 ${saved} 个资产，${failed.length} 个失败：${failed.slice(0, 3).join('、')}${failed.length > 3 ? ' 等' : ''}`);
        } else {
            message.success(`已更新 ${saved} 个资产的「${target.name}」`);
        }
        closeFieldEditor();
    }, [assetLibraryPath, facetVocab, facetValues, bumpAssetVersion, closeFieldEditor]);

    // ===== 全部标签集合（筛选 chip 用） =====
    const allTags = useMemo(() => {
        const set = new Set<string>();
        Object.values(snapshot.tags).forEach(tags => tags.forEach(t => set.add(t)));
        getAssetTagGroupsSync().groups.forEach(g => g.tags.forEach(t => set.add(t)));
        return Array.from(set).sort();
    }, [snapshot.tags]);

    // ===== 批量打标签的分组行（AssetBatchTagBar 用） =====
    const batchTagGroups = useMemo(() => {
        const groups = getAssetTagGroupsSync();
        return groups.groups.map(g => ({
            id: g.id,
            name: g.name,
            tags: g.tags,
            exclusive: groups.exclusiveGroups.includes(g.id),
        }));
    }, []);

    // ===== 治理视角计数（真实数据） =====
    const governanceCounts = useMemo(() => {
        let keyVehicle = 0;
        let namingIssue = 0;
        let incomplete = 0;
        let superseded = 0;
        let deprecated = 0;
        snapshot.infos.forEach(info => {
            const tags = snapshot.tags[info.fileName] || [];
            const metaStatus = snapshot.meta[info.fileName]?.status;
            if (tags.includes(KEY_VEHICLE_TAG)) keyVehicle++;
            if (!validateAssetName(info.fileName, info.announceNos || []).valid) namingIssue++;
            const f = fileFacets.get(info.fileName);
            if (f && (f.manufacturer === null || f.batteryBrand === null || f.capacityKwh === null || f.admissionLevel === null)) incomplete++;
            if (metaStatus === 'superseded') superseded++;
            if (metaStatus === 'deprecated') deprecated++;
        });
        return { keyVehicle, namingIssue, versionIssue: governanceReport.unconvergedCars.length, incomplete, superseded, deprecated };
    }, [snapshot, fileFacets, governanceReport]);

    // ===== 治理视角筛选 =====
    const governanceFilteredInfos = useMemo(() => {
        if (!governanceView) return snapshot.infos;
        return snapshot.infos.filter(info => {
            const tags = snapshot.tags[info.fileName] || [];
            const metaStatus = snapshot.meta[info.fileName]?.status;
            switch (governanceView) {
                case 'keyVehicle':
                    return tags.includes(KEY_VEHICLE_TAG);
                case 'namingIssue':
                    return !validateAssetName(info.fileName, info.announceNos || []).valid;
                case 'versionIssue':
                    return versionIssueFileNames.has(info.fileName);
                case 'incomplete': {
                    const f = fileFacets.get(info.fileName);
                    return !!f && (f.manufacturer === null || f.batteryBrand === null || f.capacityKwh === null || f.admissionLevel === null);
                }
                case 'superseded':
                    return metaStatus === 'superseded';
                case 'deprecated':
                    return metaStatus === 'deprecated';
                default:
                    return true;
            }
        });
    }, [snapshot, governanceView, fileFacets, versionIssueFileNames]);

    // ===== 已激活文件名集合（工作集语义与 V1 对齐：instanceKey 命中） =====
    const activeFileNames = useMemo(() => new Set(
        snapshot.infos
            .filter(a => selectedProductNames.includes(buildVehicleInstanceKey('asset', a.fileName, a.productName)))
            .map(a => a.fileName)
    ), [snapshot.infos, selectedProductNames]);

    // ===== 综合筛选（facet + 标签 + 状态 + 搜索 + 治理视角） =====
    const filteredInfos = useMemo(() => {
        let result = governanceFilteredInfos;

        if (isFacetSelectionActive(facetSelection)) {
            result = result.filter(info => {
                const facets = fileFacets.get(info.fileName);
                return facets ? matchFacets(facets, facetSelection) : true;
            });
        }

        // 标签筛选（交集）
        if (selectedTags.length > 0) {
            result = result.filter(info => {
                const tags = snapshot.tags[info.fileName] || [];
                return selectedTags.every(t => tags.includes(t));
            });
        }

        // 状态筛选（OR）
        if (statusSelection.length > 0) {
            result = result.filter(info => {
                const tags = snapshot.tags[info.fileName] || [];
                const metaStatus = snapshot.meta[info.fileName]?.status;
                return statusSelection.some(s => {
                    switch (s) {
                        case 'latest': return snapshot.latestSet.has(info.fileName);
                        case 'keyVehicle': return tags.includes(KEY_VEHICLE_TAG);
                        case 'selected': return activeFileNames.has(info.fileName);
                        case 'superseded': return metaStatus === 'superseded';
                        case 'deprecated': return metaStatus === 'deprecated';
                        case 'rejected': return info.approvalStatus === '驳回';
                        default: return false;
                    }
                });
            });
        } else {
            // 默认隐藏废弃（软删除语义）
            result = result.filter(info => snapshot.meta[info.fileName]?.status !== 'deprecated');
        }

        // 搜索
        if (searchKeyword.trim()) {
            const kw = searchKeyword.trim().toLowerCase();
            result = result.filter(info => {
                const tags = snapshot.tags[info.fileName] || [];
                const f = fileFacets.get(info.fileName);
                // 别名参与搜索：别名命中 + 原名命中双通（设计 §D5）——否则搜老名字会找不到
                const alias = cardDisplayName(info).toLowerCase();
                return (
                    info.fileName.toLowerCase().includes(kw) ||
                    info.productName.toLowerCase().includes(kw) ||
                    alias.includes(kw) ||
                    tags.some(t => t.toLowerCase().includes(kw)) ||
                    (info.announceNos || []).some(n => n.toLowerCase().includes(kw)) ||
                    (f && f.manufacturer ? f.manufacturer.toLowerCase().includes(kw) : false)
                );
            });
        }

        return result;
    }, [governanceFilteredInfos, facetSelection, selectedTags, statusSelection, searchKeyword, fileFacets, snapshot, activeFileNames, cardDisplayName]);

    // ===== 排序 + 同车型聚拢（设计文档 2026-10-14-asset-pool-sort-group-design） =====
    const [sortSpec, setSortSpec] = useState<AssetSortSpec>(() => {
        try {
            const raw = localStorage.getItem('asset-pool-sort');
            if (raw) {
                const parsed = JSON.parse(raw) as AssetSortSpec;
                if (parsed && parsed.dim && parsed.dir) return parsed;
            }
        } catch (e) { console.warn(e); }
        return DEFAULT_ASSET_SORT;
    });
    const [groupDims, setGroupDims] = useState<AssetGroupDim[]>(() => {
        try {
            const raw = localStorage.getItem('asset-pool-group-dims');
            if (raw) {
                const arr = JSON.parse(raw) as string[];
                const valid = arr.filter(d => d in ASSET_GROUP_LABELS && d !== 'none') as AssetGroupDim[];
                if (valid.length > 0) return valid;
                if (Array.isArray(arr)) return []; // 显式空 = 不分组
            }
            // 迁移旧键（单维度）
            const legacy = localStorage.getItem('asset-pool-group-dim');
            if (legacy && legacy in ASSET_GROUP_LABELS && legacy !== 'none') return [legacy as AssetGroupDim];
        } catch (e) { console.warn(e); }
        return [DEFAULT_ASSET_GROUP];
    });
    const updateSort = useCallback((next: AssetSortSpec) => {
        setSortSpec(next);
        try { localStorage.setItem('asset-pool-sort', JSON.stringify(next)); } catch (e) { console.warn(e); }
    }, []);
    const updateGroupDims = useCallback((next: AssetGroupDim[]) => {
        setGroupDims(next);
        try { localStorage.setItem('asset-pool-group-dims', JSON.stringify(next)); } catch (e) { console.warn(e); }
    }, []);

    // ===== 列数模式（自动 / 固定 1-4；设计文档 2026-10-14-asset-pool-column-mode-design） =====
    const [columnMode, setColumnMode] = useState<ColumnMode>(() => {
        try {
            const raw = localStorage.getItem('asset-pool-column-mode');
            if (raw === 'auto') return 'auto';
            const n = Number(raw);
            if (n === 1 || n === 2 || n === 3 || n === 4) return n as ColumnMode;
        } catch (e) { console.warn(e); }
        return 'auto';
    });
    const updateColumnMode = useCallback((next: ColumnMode) => {
        setColumnMode(next);
        try { localStorage.setItem('asset-pool-column-mode', String(next)); } catch (e) { console.warn(e); }
    }, []);
    /** 网格列模板：自动=按容器宽铺（最小 320px）；固定=N 等分 */
    const gridTemplateColumns = columnMode === 'auto'
        ? 'repeat(auto-fill, minmax(320px, 1fr))'
        : `repeat(${columnMode}, minmax(0, 1fr))`;
    /** 单列模式用横向列表行；其余用竖排卡片 */
    const cardLayout: 'card' | 'row' = columnMode === 1 ? 'row' : 'card';

    /** 折叠记忆：按「分组维度链」存（换维度链后旧键自然失效）。键 = 层级路径键。 */
    const groupDimsKey = groupDims.join('>') || 'none';
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
        try {
            const raw = localStorage.getItem(`asset-pool-collapsed-groups-${groupDimsKey}`);
            return new Set(raw ? (JSON.parse(raw) as string[]) : []);
        } catch { return new Set(); }
    });
    const collapsedKeyRef = useRef(groupDimsKey);
    // 切换分组维度链时载入该链的折叠记忆
    useEffect(() => {
        if (collapsedKeyRef.current === groupDimsKey) return;
        collapsedKeyRef.current = groupDimsKey;
        try {
            const raw = localStorage.getItem(`asset-pool-collapsed-groups-${groupDimsKey}`);
            setCollapsedGroups(new Set(raw ? (JSON.parse(raw) as string[]) : []));
        } catch { setCollapsedGroups(new Set()); }
    }, [groupDimsKey]);
    const toggleGroupCollapsed = useCallback((key: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            try { localStorage.setItem(`asset-pool-collapsed-groups-${groupDimsKey}`, JSON.stringify([...next])); } catch (e) { console.warn(e); }
            return next;
        });
    }, [groupDimsKey]);

    // ===== 视图：加载 / 套用 / 保存 / 管理 =====
    // 加载视图库（库文件优先，失败回退内置）
    useEffect(() => {
        if (!assetLibraryPath) return;
        let cancelled = false;
        (async () => {
            const loaded = await loadAssetViews(assetLibraryPath);
            if (!cancelled) setViews(loaded);
        })();
        return () => { cancelled = true; };
    }, [assetLibraryPath]);

    // 当前面板状态快照（用于「已修改」判定与保存）
    const currentViewState = useMemo<AssetViewState>(() => ({
        searchKeyword, facetSelection, selectedTags, statusSelection,
        governanceView, groupDims, sortSpec, columnMode,
    }), [searchKeyword, facetSelection, selectedTags, statusSelection, governanceView, groupDims, sortSpec, columnMode]);

    const viewStateEqual = (a: AssetViewState, b: AssetViewState): boolean =>
        JSON.stringify(a) === JSON.stringify(b);

    const activeView = useMemo(() => views.find(v => v.id === activeViewId) ?? null, [views, activeViewId]);
    const viewModified = Boolean(activeView && !viewStateEqual(activeView.state, currentViewState));

    /** 套用视图：一次写入全部面板状态（批量 setState，不做 reducer 重构） */
    const applyView = useCallback((view: AssetView) => {
        const s = view.state;
        setSearchKeyword(s.searchKeyword);
        setFacetSelection(s.facetSelection);
        setSelectedTags(s.selectedTags);
        setStatusSelection(s.statusSelection);
        setGovernanceView(s.governanceView);
        setGroupDims(s.groupDims);
        setSortSpec(s.sortSpec);
        setColumnMode(s.columnMode);
        setActiveViewId(view.id);
        try { localStorage.setItem('asset-pool-active-view', view.id); } catch (e) { console.warn(e); }
    }, []);

    /** 保存当前状态为视图（seed 有值 = 另存为；否则新建或用 activeView 名） */
    const saveView = useCallback(async (name: string) => {
        if (!assetLibraryPath) return;
        const seed = saveViewSeed;
        const next = seed
            ? [...views, { ...seed, id: newViewId(), name, builtin: false, state: currentViewState }]
            : [...views, { id: newViewId(), name, state: currentViewState }];
        setViews(next);
        await saveAssetViews(assetLibraryPath, next);
        const created = next[next.length - 1];
        setActiveViewId(created.id);
        try { localStorage.setItem('asset-pool-active-view', created.id); } catch (e) { console.warn(e); }
        setSaveViewSeed(null);
        setSaveViewOpen(false);
        message.success(`已保存视图「${name}」`);
    }, [assetLibraryPath, saveViewSeed, views, currentViewState]);

    /** 覆盖保存当前 activeView */
    const overwriteView = useCallback(async () => {
        if (!assetLibraryPath || !activeView || activeView.builtin) return;
        const next = views.map(v => v.id === activeView.id ? { ...v, state: currentViewState } : v);
        setViews(next);
        await saveAssetViews(assetLibraryPath, next);
        message.success(`已更新视图「${activeView.name}」`);
    }, [assetLibraryPath, activeView, views, currentViewState]);

    const renameView = useCallback(async (id: string, name: string) => {
        if (!assetLibraryPath) return;
        const next = views.map(v => v.id === id ? { ...v, name } : v);
        setViews(next);
        await saveAssetViews(assetLibraryPath, next);
    }, [assetLibraryPath, views]);

    const deleteView = useCallback(async (id: string) => {
        if (!assetLibraryPath) return;
        const next = views.filter(v => v.id !== id || v.builtin);
        setViews(next);
        await saveAssetViews(assetLibraryPath, next);
        if (activeViewId === id) { setActiveViewId(null); try { localStorage.removeItem('asset-pool-active-view'); } catch (e) { console.warn(e); } }
    }, [assetLibraryPath, views, activeViewId]);

    /** 排序后的展示序列（渲染、方向键导航、批量全选均用它） */
    const displayInfos = useMemo(() => {
        const rows = filteredInfos.map(info => ({
            info,
            displayName: cardDisplayName(info),
            groupKey: resolveVehicleGroupKey(info, snapshot.meta[info.fileName], brandNames),
        }));
        return sortAssetRowsByMode(rows, sortSpec, groupDims.length > 0).map(r => r.info);
    }, [filteredInfos, sortSpec, groupDims, cardDisplayName, snapshot.meta, brandNames]);

    /** 分组上下文（多层分组复用） */
    const groupCtx = useMemo<AssetGroupDimContext>(() => ({
        vehicleGroupKey: fn => resolveVehicleGroupKey(
            snapshot.infos.find(i => i.fileName === fn) ?? { fileName: fn, productName: fn },
            snapshot.meta[fn], brandNames),
        vehicleGroupLabel: fn => {
            const meta = snapshot.meta[fn];
            if (meta?.groupName) return meta.groupName;
            const info = snapshot.infos.find(i => i.fileName === fn);
            return resolveVehicleGroupKey(info ?? { fileName: fn, productName: fn }, meta, brandNames);
        },
        facets: fileFacets,
        metaStatus: fn => snapshot.meta[fn]?.status,
        isRejected: info => info.approvalStatus === '驳回',
    }), [snapshot.infos, snapshot.meta, brandNames, fileFacets]);

    /** 多层分组树（groupDims 为空 = 单层平铺节点） */
    const assetGroupNodes = useMemo(() => {
        const rows = displayInfos.map(info => ({
            info,
            displayName: cardDisplayName(info),
            groupKey: resolveVehicleGroupKey(info, snapshot.meta[info.fileName], brandNames),
        }));
        return buildAssetGroupsMulti(rows, groupDims, groupCtx);
    }, [displayInfos, groupDims, groupCtx, cardDisplayName, snapshot.meta, brandNames]);

    const filtersActive = Boolean(
        searchKeyword.trim() || governanceView || selectedTags.length > 0 || statusSelection.length > 0
        || isFacetSelectionActive(facetSelection),
    );

    const handleClearFilters = useCallback(() => {
        setSearchKeyword('');
        setFacetSelection(EMPTY_FACET_SELECTION);
        setGovernanceView(null);
        setSelectedTags([]);
        setStatusSelection([]);
    }, []);

    // ===== 计算缺必填数 =====
    const getRequiredMissingCount = useCallback((info: AssetFileInfo) => {
        const instanceKey = buildVehicleInstanceKey('asset', info.fileName, info.productName);
        const params = getProductData(uploadedFiles, instanceKey, assetFiles);
        return params.filter(p => {
            const value = String(p.value ?? '').trim();
            return isFieldRequired(p.name) && value === '';
        }).length;
    }, [uploadedFiles, assetFiles]);

    // ===== 激活/移出工作集 =====
    const handleToggleActive = useCallback((info: AssetFileInfo) => {
        const isActive = activeFileNames.has(info.fileName);
        if (isActive) {
            removeActiveAsset(info.fileName, info.productName);
        } else {
            addActiveAsset(info.fileName, info.productName);
        }
    }, [activeFileNames, addActiveAsset, removeActiveAsset]);

    // ===== ⚡ 激活组内每辆车的最新版（组头操作） =====
    const handleActivateLatest = useCallback((group: VehicleGroup) => {
        // 该车型组内所有「最新版」资产（latestSet = 治理报告链头集合）
        const targets = snapshot.infos.filter(info =>
            resolveVehicleGroupKey(info, snapshot.meta[info.fileName], brandNames) === group.groupKey
            && snapshot.latestSet.has(info.fileName));
        const toAdd = targets.filter(info => !activeFileNames.has(info.fileName));
        toAdd.forEach(info => addActiveAsset(info.fileName, info.productName));
        if (toAdd.length > 0) message.success(`已激活 ${toAdd.length} 辆车的最新版本`);
        else message.info('该车型组的最新版均已在工作区');
    }, [snapshot.infos, snapshot.meta, snapshot.latestSet, brandNames, activeFileNames, addActiveAsset]);

    // ===== 批量维护本组字段（组头操作）：把该车型组全部资产交给批量字段维护抽屉 =====
    const handleBulkEditGroup = useCallback((group: VehicleGroup) => {
        const fileNames = snapshot.infos
            .filter(info => resolveVehicleGroupKey(info, snapshot.meta[info.fileName], brandNames) === group.groupKey)
            .map(info => info.fileName);
        openFieldEditor({ fileNames, groupName: group.groupKey });
    }, [snapshot.infos, snapshot.meta, brandNames, openFieldEditor]);

    // ===== 车型组重命名（写 meta.groupName；与资产别名分层，见设计 §3）=====
    // 用未筛选的全量组（体检报告口径）确定作用范围，避免筛选态下漏写
    const groupRenameTarget = useMemo(
        () => governanceReport.groups.find(g => g.groupKey === groupRename.groupKey) ?? null,
        [governanceReport, groupRename.groupKey],
    );
    const sanitizedGroupName = useMemo(() => sanitizeGroupName(groupRename.name), [groupRename.name]);
    // 新显示名规范化后与既有组同键 → 保存后两组自动合并
    const groupMergeTarget = useMemo(() => {
        if (!groupRenameTarget || !sanitizedGroupName) return null;
        const newKey = normalizeGroupKey(sanitizedGroupName);
        if (newKey === groupRenameTarget.groupKey) return null;
        return governanceReport.groups.find(g => g.groupKey === newKey) ?? null;
    }, [governanceReport, groupRenameTarget, sanitizedGroupName]);

    const openGroupRename = useCallback((group: VehicleGroup) => {
        // 传入的组可能只有 groupKey（分组树只带键），故从治理报告取真实组以拿别名
        const real = governanceReport.groups.find(g => g.groupKey === group.groupKey) ?? group;
        const current = pickGroupAlias(real.files, real.groupKey);
        setGroupRename({ open: true, groupKey: group.groupKey, name: current });
    }, [governanceReport]);

    const handleGroupRenameConfirm = useCallback(async () => {
        if (!assetLibraryPath || !groupRenameTarget) return;
        const current = pickGroupAlias(groupRenameTarget.files, groupRenameTarget.groupKey);
        const { next, newKey, skipped } = buildGroupRenameMeta(
            groupRenameTarget.files, current, groupRename.name, snapshot.meta,
        );
        if (skipped) {
            if (!newKey) message.warning('请输入有效的车型名');
            setGroupRename({ open: false, groupKey: null, name: '' });
            return;
        }
        try {
            await saveAssetMeta(assetLibraryPath, next);
        } catch {
            message.error('保存失败');
            return;
        }
        const merged = groupMergeTarget;
        const mergedCount = merged ? groupRenameTarget.files.length + merged.files.length : 0;
        message.success(merged
            ? `已保存显示名并入组「${newKey}」（合并后共 ${mergedCount} 个文件，文件名保持不变）`
            : `分组显示名已更新为「${newKey}」（文件名保持不变）`);
        setGroupRename({ open: false, groupKey: null, name: '' });
        bumpAssetVersion();
    }, [assetLibraryPath, groupRenameTarget, groupRename.name, groupMergeTarget, snapshot.meta, bumpAssetVersion]);

    // ===== 将筛选结果加入工作区 =====
    const handleAddFilteredToWorkspace = useCallback(() => {
        const toAdd = filteredInfos.filter(info => !activeFileNames.has(info.fileName));
        toAdd.forEach(info => addActiveAsset(info.fileName, info.productName));
        if (toAdd.length > 0) message.success(`已将 ${toAdd.length} 个资产新增到待分析工作区`);
    }, [filteredInfos, activeFileNames, addActiveAsset]);

    // ===== 购物车反向定位 =====
    const listRef = useRef<HTMLDivElement>(null);
    const locateRanRef = useRef(0);

    useEffect(() => {
        if (!locateRequest || locateRanRef.current === locateRequest.nonce) return;
        locateRanRef.current = locateRequest.nonce;
        const { fileName } = locateRequest;
        window.setTimeout(() => {
            const el = listRef.current?.querySelector(`[data-asset-file="${CSS.escape(fileName)}"]`);
            if (el) {
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                el.classList.add('vp-locate-flash');
                window.setTimeout(() => el.classList.remove('vp-locate-flash'), 1800);
            } else {
                message.info('该资产当前不在列表中（可能被筛选隐藏）');
            }
        }, 0);
    }, [locateRequest]);

    const handleLocateAsset = useCallback((fileName: string) => {
        setLocateRequest(prev => ({ fileName, nonce: (prev?.nonce ?? 0) + 1 }));
    }, []);

    // ===== 去对比 =====
    const handleGoCompare = useCallback(() => {
        onGoCompare?.();
    }, [onGoCompare]);

    // ===== 打开资产检查器 =====
    const handleOpenInspector = useCallback((info: AssetFileInfo) => {
        setInspectorTarget(buildVehicleInstanceKey('asset', info.fileName, info.productName));
    }, []);

    const setCompareProducts = useVehicleStore(useShallow(state => state.setCompareProducts));
    const handleInspectorGoCompare = useCallback((instanceKey: string) => {
        setCompareProducts([instanceKey]);
        onGoCompare?.();
    }, [setCompareProducts, onGoCompare]);

    // ===== 批量模式 =====
    const enterBatchMode = useCallback((fileName: string) => {
        setBatchMode(true);
        setBatchSelection(new Set([fileName]));
    }, []);

    const exitBatchMode = useCallback(() => {
        setBatchMode(false);
        setBatchSelection(new Set());
    }, []);

    const toggleBatchSelected = useCallback((fileName: string, checked: boolean) => {
        setBatchSelection(prev => {
            const next = new Set(prev);
            if (checked) next.add(fileName);
            else next.delete(fileName);
            return next;
        });
    }, []);

    const handleBatchSelectAll = useCallback((checked: boolean) => {
        if (!checked) {
            setBatchSelection(new Set());
            return;
        }
        setBatchSelection(prev => {
            const next = new Set(prev);
            filteredInfos.forEach(a => next.add(a.fileName));
            return next;
        });
    }, [filteredInfos]);

    const handleBatchAddTags = useCallback(async (tags: string[]) => {
        if (!assetLibraryPath || tags.length === 0) return;
        if (batchSelection.size === 0) {
            message.warning('请先勾选要打标签的资产');
            return;
        }
        const count = batchSelection.size;
        const exclusiveSets = getExclusiveGroupTagSets();
        const touchesExclusive = tags.some(t => exclusiveSets.some(set => set.includes(t)));
        try {
            // batchAddAssetTags 一次读盘一次写盘（普通标签合并、互斥组替换），无需在此重复读写
            await batchAddAssetTags(assetLibraryPath, [...batchSelection], tags, exclusiveSets);
            const groupsUpdated = await ensureTagsInDefaultGroup(assetLibraryPath, tags);
            if (groupsUpdated) bumpAssetTagGroupsVersion();
            // 快照按 assetVersion 重拉；不 bump 则标签已落盘、卡片仍显示旧标签
            bumpAssetVersion();
            const suffix = touchesExclusive ? '（互斥组标签已替换组内原有标签）' : '';
            message.success(`已为 ${count} 个资产添加标签：${tags.join('、')}${suffix}`);
        } catch (err) {
            console.error('Batch add tags failed', err);
            message.error('批量添加标签失败');
        }
    }, [assetLibraryPath, batchSelection, bumpAssetTagGroupsVersion, bumpAssetVersion]);

    // ===== 快捷键（设计文档 §3.6） =====
    // 依赖 enterBatchMode/exitBatchMode/handleOpenInspector，故置于其后。
    const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
    const searchSectionRef = useRef<HTMLDivElement>(null);

    // 网格列数：固定列数直接用；自动=按容器宽 ÷ 320 向下取整（与 minmax(320px) 一致）
    const columnsInGrid = useCallback(() => {
        if (columnMode !== 'auto') return columnMode;
        const w = listRef.current?.clientWidth ?? 0;
        const gap = 10, minCol = 320;
        return Math.max(1, Math.floor((w + gap) / (minCol + gap)));
    }, [columnMode]);

    const moveFocus = useCallback(({ dx, dy }: { dx: number; dy: number }) => {
        if (displayInfos.length === 0) return;
        const cur = focusedFile ? displayInfos.findIndex(i => i.fileName === focusedFile) : -1;
        const cols = columnsInGrid();
        let next = cur === -1 ? 0 : cur + dx + dy * cols;
        next = Math.max(0, Math.min(displayInfos.length - 1, next));
        const target = displayInfos[next];
        if (target) {
            setFocusedFile(target.fileName);
            setLocateRequest(prev => ({ fileName: target.fileName, nonce: (prev?.nonce ?? 0) + 1 }));
        }
    }, [displayInfos, focusedFile, columnsInGrid]);

    const focusSearch = useCallback(() => {
        const input = searchSectionRef.current?.querySelector('input');
        input?.focus();
    }, []);

    const focusedInfo = useCallback(() => (
        focusedFile ? snapshot.infos.find(i => i.fileName === focusedFile) ?? null : null
    ), [focusedFile, snapshot.infos]);

    useAssetPoolHotkeys({
        enabled: true,
        onToggleSidebar: toggleSidebar,
        onFocusSearch: focusSearch,
        onMoveFocus: moveFocus,
        onOpenInspector: () => { const i = focusedInfo(); if (i) handleOpenInspector(i); },
        onToggleActive: () => { const i = focusedInfo(); if (i) handleToggleActive(i); },
        onEnterBatch: () => { if (focusedFile) enterBatchMode(focusedFile); },
        onToggleCart: () => { if (activeFileNames.size > 0) setCartExpanded(v => !v); },
        onGoCompare: () => { if (activeFileNames.size > 0) handleGoCompare(); },
        onRefresh: () => { bumpAssetVersion(); message.success('正在刷新资产库…'); },
        onShowCheatsheet: () => setCheatsheetOpen(true),
        onEscape: () => {
            if (cartExpanded) { setCartExpanded(false); return; }
            if (batchMode) { exitBatchMode(); return; }
            setFocusedFile(null);
        },
        onSaveView: () => { setSaveViewSeed(null); setSaveViewOpen(true); },
        onSwitchView: (index) => { if (views[index]) applyView(views[index]); },
    });

    // ===== 批量建议别名（设计 §D6）：仅对勾选资产生效；逐条 writeMeta，避免并发覆盖 =====
    const aliasBatchTargets = useMemo(
        () => snapshot.infos.filter(i => batchSelection.has(i.fileName)),
        [snapshot.infos, batchSelection],
    );
    const handleAliasBatchConfirm = useCallback(async (entries: { fileName: string; alias: string }[]) => {
        if (!assetLibraryPath) return;
        try {
            for (const { fileName, alias } of entries) {
                await setAssetAlias(assetLibraryPath, fileName, alias);
            }
            message.success(`已为 ${entries.length} 个资产设置别名`);
            setAliasBatchOpen(false);
            bumpAssetVersion();
        } catch (err) {
            console.error('Batch set alias failed', err);
            message.error('批量设置别名失败');
        }
    }, [assetLibraryPath, bumpAssetVersion]);

    // Esc 退出批量模式
    useEffect(() => {
        if (!batchMode) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') exitBatchMode();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [batchMode, exitBatchMode]);

    // ===== 右键菜单 =====
    const buildAssetContextMenu = useCallback((info: AssetFileInfo) => {
        const isActive = activeFileNames.has(info.fileName);
        const tags = snapshot.tags[info.fileName] || [];
        const isKey = tags.includes(KEY_VEHICLE_TAG);
        const metaStatus = snapshot.meta[info.fileName]?.status;
        return [
            // ── 高频：一级平铺 ──
            {
                key: 'active',
                label: isActive ? '移出工作集' : '激活进工作集',
                onClick: () => handleToggleActive(info),
            },
            { key: 'copy-announce', label: '复制公告号', onClick: () => actions.copyAnnounceNo(info) },
            { key: 'divider-1', divider: true },
            // ── 治理：二级子菜单收纳 ──
            {
                key: 'key-vehicle',
                label: isKey ? '取消关键车型' : '标记为关键车型',
                onClick: () => void actions.toggleKeyVehicle(info),
            },
            {
                key: 'status',
                label: '状态',
                children: [
                    metaStatus === 'superseded'
                        ? { key: 'un-superseded', label: '取消历史版本标记', onClick: () => void actions.setStatus(info, 'superseded') }
                        : { key: 'superseded', label: '标记为历史版本', onClick: () => void actions.setStatus(info, 'superseded') },
                    metaStatus === 'deprecated'
                        ? { key: 'un-deprecated', label: '清除废弃标记', onClick: () => void actions.setStatus(info, 'deprecated') }
                        : { key: 'deprecated', label: '标记为废弃', onClick: () => void actions.setStatus(info, 'deprecated') },
                ],
            },
            { key: 'rename', label: '重命名…', onClick: () => actions.startRename(info) },
            { key: 'alias', label: '设置别名…', onClick: () => void actions.startSetAlias(info) },
            { key: 'divider-2', divider: true },
            // ── 公告与导出 ──
            {
                key: 'announce',
                label: '公告',
                children: [
                    { key: 'pdf', label: '查看公告 PDF', onClick: () => actions.viewAnnouncementPdf(info) },
                    { key: 'compare', label: '与公告对比', onClick: () => actions.compareWithAnnouncement(info) },
                ],
            },
            { key: 'export', label: '导出 CSV', onClick: () => void actions.exportCsv(info) },
            { key: 'upgrade', label: '升级导入…', onClick: () => void actions.openUpgrade(info) },
            { key: 'divider-3', divider: true },
            // ── 文件与选择 ──
            { key: 'finder', label: '在 Finder 中显示', onClick: () => void actions.revealInFinder(info) },
            { key: 'open', label: '打开文件', onClick: () => void actions.openInEditor(info) },
            { key: 'batch', label: '批量选择', onClick: () => enterBatchMode(info.fileName) },
            { key: 'divider-4', divider: true },
            // ── 检查器入口 ──
            {
                key: 'inspector',
                label: '打开检查器…',
                onClick: () => handleOpenInspector(info),
            },
            { key: 'divider-5', divider: true },
            // ── 删除类：压底、危险色 ──
            { key: 'delete', label: '删除（可恢复）', danger: true, onClick: () => actions.deleteAsset(info) },
            ...(metaStatus === 'deprecated'
                ? [{ key: 'hard-delete', label: '彻底删除（归档）', danger: true, onClick: () => void actions.hardDelete(info) }]
                : []),
        ];
    }, [activeFileNames, handleToggleActive, actions, handleOpenInspector, enterBatchMode, snapshot.tags, snapshot.meta]);

    const batchSelectionStats = useMemo(() => {
        const inFiltered = filteredInfos.filter(a => batchSelection.has(a.fileName)).length;
        return {
            allSelected: filteredInfos.length > 0 && inFiltered === filteredInfos.length,
            indeterminate: inFiltered > 0 && inFiltered < filteredInfos.length,
        };
    }, [filteredInfos, batchSelection]);

    return (
        <div className="flex h-full gap-3">
            {/* 左栏：可折叠（展开 240px / 折叠 0 = 完全隐藏；展开入口在筛选条左缘） */}
            {!sidebarCollapsed && (
                <div className="w-[240px] flex-shrink-0 surface-container border border-default rounded-xl overflow-hidden">
                    <AssetSidebar
                        governanceView={governanceView}
                        onGovernanceViewChange={setGovernanceView}
                        counts={governanceCounts}
                        facetSelection={facetSelection}
                        onFacetSelectionChange={setFacetSelection}
                        facetVocab={facetVocab}
                        facetItems={facetItems}
                        onOpenGovernance={() => setGovernanceOpen(true)}
                        onCollapse={toggleSidebar}
                    />
                </div>
            )}

            {/* 中间主区：弹性 */}
            <div className="flex-1 min-w-0 flex flex-col surface-container border border-default rounded-xl overflow-hidden">
                <div className="flex items-stretch">
                    {/* 导航开关（常驻筛选条左缘；折叠后唯一展开入口，保证可达） */}
                    <button
                        className="flex-none px-1.5 flex items-center justify-center text-3 hover:text-brand hover:bg-brand-weak border-r border-default transition-colors duration-150"
                        style={{ transitionTimingFunction: 'var(--ease-ui)' }}
                        onClick={toggleSidebar}
                        title={sidebarCollapsed ? '展开导航（⌘S）' : '隐藏导航（⌘S）'}
                    >
                        <span className="text-[11px]">{sidebarCollapsed ? '▸' : '◂'}</span>
                    </button>
                    <div ref={searchSectionRef} className="flex-1 min-w-0">
                <AssetFilterBar
                    searchKeyword={searchKeyword}
                    onSearchKeywordChange={setSearchKeyword}
                    facetSelection={facetSelection}
                    onFacetSelectionChange={setFacetSelection}
                    facetVocab={facetVocab}
                    facetItems={facetItems}
                    allTags={allTags}
                    selectedTags={selectedTags}
                    onSelectedTagsChange={setSelectedTags}
                    statusSelection={statusSelection}
                    onStatusSelectionChange={setStatusSelection}
                    onClearAll={handleClearFilters}
                />
                    </div>
                </div>

                {/* 批量打标签操作栏 */}
                {batchMode && (
                    <div className="vp-slide-down px-4 pt-3">
                        <AssetBatchTagBar
                            selectedCount={batchSelection.size}
                            filteredCount={filteredInfos.length}
                            allSelected={batchSelectionStats.allSelected}
                            indeterminate={batchSelectionStats.indeterminate}
                            onSelectAll={handleBatchSelectAll}
                            onClearSelection={() => setBatchSelection(new Set())}
                            onExit={exitBatchMode}
                            groups={batchTagGroups}
                            onApplyTags={handleBatchAddTags}
                            onOpenFieldEditor={() => openFieldEditor({ fileNames: [...batchSelection] })}
                        />
                        <div className="mt-2">
                            <Button
                                size="small"
                                disabled={batchSelection.size === 0}
                                onClick={() => setAliasBatchOpen(true)}
                            >
                                批量建议别名…
                            </Button>
                        </div>
                    </div>
                )}

                {/* 列表头：计数 + 排序 + 聚拢 + 批量加入 */}
                <div className="flex-none px-4 py-2 border-b border-default flex items-center justify-between gap-3 text-aux text-2">
                    <span className="flex-shrink-0">
                        共 <span className="font-medium text-1 tabular-nums">{filteredInfos.length}</span> 个资产
                        {activeFileNames.size > 0 && (
                            <> · 已选 <span className="font-medium text-1 tabular-nums">{activeFileNames.size}</span></>
                        )}
                    </span>

                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* 视图 */}
                        <ViewDropdown
                            views={views}
                            activeViewId={activeViewId}
                            modified={viewModified}
                            onApply={applyView}
                            onSaveCurrent={() => { setSaveViewSeed(null); setSaveViewOpen(true); }}
                            onRename={renameView}
                            onDelete={deleteView}
                            onSaveAs={(v) => { setSaveViewSeed(v); setSaveViewOpen(true); }}
                            onOverwrite={overwriteView}
                        />

                        {/* 分组维度（多层：最多 3 层） */}
                        <Popover
                            trigger="click"
                            placement="bottomRight"
                            content={
                                <div className="min-w-[240px] py-1">
                                    <div className="px-2 py-1 text-caption text-3">
                                        分组层级（最多 {MAX_GROUP_LEVELS} 层）
                                    </div>
                                    {groupDims.map((dim, i) => (
                                        <div key={i} className="flex items-center gap-2 px-2 py-1">
                                            <span className="text-caption text-3 w-4">{i + 1}</span>
                                            <select
                                                className="flex-1 bg-[var(--surface-2)] border border-[var(--border-default)] rounded px-1 py-0.5 text-body text-1"
                                                value={dim}
                                                onChange={e => {
                                                    const next = [...groupDims];
                                                    next[i] = e.target.value as AssetGroupDim;
                                                    updateGroupDims(next);
                                                }}
                                            >
                                                {/* 同级不重复：已在本链其他位置选的维度置灰 */}
                                                {(Object.keys(ASSET_GROUP_LABELS) as AssetGroupDim[])
                                                    .filter(d => d !== 'none')
                                                    .map(d => (
                                                        <option key={d} value={d} disabled={groupDims.includes(d) && groupDims[i] !== d}>
                                                            {ASSET_GROUP_LABELS[d]}
                                                        </option>
                                                    ))}
                                            </select>
                                            <span
                                                className="text-3 hover:text-danger cursor-pointer text-caption"
                                                onClick={() => updateGroupDims(groupDims.filter((_, j) => j !== i))}
                                                title="移除该层"
                                            >
                                                ✕
                                            </span>
                                        </div>
                                    ))}
                                    {groupDims.length < MAX_GROUP_LEVELS && (
                                        <div
                                            className="px-2 py-1 mt-1 text-body text-brand cursor-pointer hover:surface-inset rounded"
                                            onClick={() => {
                                                const used = new Set(groupDims);
                                                const nextDim = (Object.keys(ASSET_GROUP_LABELS) as AssetGroupDim[])
                                                    .find(d => d !== 'none' && !used.has(d));
                                                if (nextDim) updateGroupDims([...groupDims, nextDim]);
                                            }}
                                        >
                                            ＋ 添加分组层级
                                        </div>
                                    )}
                                    {groupDims.length > 0 && (
                                        <div
                                            className="px-2 py-1 text-body text-3 cursor-pointer hover:surface-inset rounded border-t border-[var(--border-default)] mt-1"
                                            onClick={() => updateGroupDims([])}
                                        >
                                            不分组
                                        </div>
                                    )}
                                </div>
                            }
                        >
                            <div
                                className={`flex items-center gap-1 px-2 py-1 rounded-md border cursor-pointer transition-colors duration-150 ${
                                    groupDims.length > 0
                                        ? 'bg-brand-weak border-brand text-brand font-medium'
                                        : 'surface-container border-line text-2 hover:border-brand hover:text-brand'
                                }`}
                                style={{ transitionTimingFunction: 'var(--ease-ui)' }}
                            >
                                <ClusterOutlined className="text-[11px]" />
                                分组：{groupDims.length === 0 ? '不分组' : groupDims.map(d => ASSET_GROUP_LABELS[d]).join(' › ')}
                            </div>
                        </Popover>

                        {/* 排序维度 + 方向 */}
                        <Popover
                            trigger="click"
                            placement="bottomRight"
                            content={
                                <div className="min-w-[180px] py-1">
                                    {(Object.keys(ASSET_SORT_LABELS) as AssetSortDim[]).map(dim => {
                                        const active = sortSpec.dim === dim;
                                        return (
                                            <div
                                                key={dim}
                                                className="flex items-center justify-between px-2 py-1 rounded cursor-pointer text-body hover:surface-inset"
                                                onClick={() => updateSort(
                                                    active
                                                        ? { dim, dir: sortSpec.dir === 'asc' ? 'desc' : 'asc' }
                                                        : { dim, dir: ASSET_SORT_DEFAULT_DIR[dim] }
                                                )}
                                            >
                                                <span className={active ? 'text-brand font-medium' : 'text-1'}>
                                                    {ASSET_SORT_LABELS[dim]}
                                                </span>
                                                {active && (
                                                    <span className="text-brand text-caption">
                                                        {sortSpec.dir === 'asc' ? '↑ 升序' : '↓ 降序'}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            }
                        >
                            <div
                                className="flex items-center gap-1 px-2 py-1 rounded-md border surface-container border-line text-2 hover:border-brand hover:text-brand cursor-pointer transition-colors duration-150"
                                style={{ transitionTimingFunction: 'var(--ease-ui)' }}
                            >
                                排序：{ASSET_SORT_LABELS[sortSpec.dim]}
                                <span className="text-caption text-3">{sortSpec.dir === 'asc' ? '↑' : '↓'}</span>
                            </div>
                        </Popover>

                        {/* 列数模式 */}
                        <Popover
                            trigger="click"
                            placement="bottomRight"
                            content={
                                <div className="min-w-[130px] py-1">
                                    {(['auto', 1, 2, 3, 4] as ColumnMode[]).map(mode => {
                                        const active = columnMode === mode;
                                        return (
                                            <div
                                                key={String(mode)}
                                                className="flex items-center justify-between px-2 py-1 rounded cursor-pointer text-body hover:surface-inset"
                                                onClick={() => updateColumnMode(mode)}
                                            >
                                                <span className={active ? 'text-brand font-medium' : 'text-1'}>
                                                    {COLUMN_MODE_LABELS[String(mode)]}
                                                </span>
                                                {active && <span className="text-brand text-caption">✓</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            }
                        >
                            <div
                                className="flex items-center gap-1 px-2 py-1 rounded-md border surface-container border-line text-2 hover:border-brand hover:text-brand cursor-pointer transition-colors duration-150"
                                style={{ transitionTimingFunction: 'var(--ease-ui)' }}
                            >
                                <span className="text-[11px]">▦</span>
                                列：{COLUMN_MODE_LABELS[String(columnMode)]}
                            </div>
                        </Popover>

                        {filteredInfos.length > 0 && filteredInfos.some(info => !activeFileNames.has(info.fileName)) && (
                            <span
                                className="text-brand cursor-pointer font-medium hover:underline whitespace-nowrap"
                                onClick={handleAddFilteredToWorkspace}
                            >
                                将筛选结果加入工作区 →
                            </span>
                        )}
                    </div>
                </div>

                {/* 车型卡片列表：多层分组（递归树），叶子组内流体多列 */}
                <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar surface-layout p-3">
                    {displayInfos.length > 0 ? (
                        <AssetGroupTree
                            nodes={assetGroupNodes}
                            level={0}
                            forceExpand={filtersActive}
                            isCollapsed={key => collapsedGroups.has(key)}
                            onToggle={toggleGroupCollapsed}
                            onActivateLatest={handleActivateLatest}
                            onRenameGroup={openGroupRename}
                            onBulkEditFields={handleBulkEditGroup}
                            gridTemplateColumns={gridTemplateColumns}
                            renderCard={info => (
                                <AssetCard
                                    key={info.fileName}
                                    info={info}
                                    fileName={info.fileName}
                                    tags={snapshot.tags[info.fileName] || []}
                                    metaStatus={snapshot.meta[info.fileName]?.status}
                                    isLatest={snapshot.latestSet.has(info.fileName)}
                                    isActive={activeFileNames.has(info.fileName)}
                                    isFocused={focusedFile === info.fileName}
                                    batchMode={batchMode}
                                    batchChecked={batchSelection.has(info.fileName)}
                                    onBatchCheck={checked => toggleBatchSelected(info.fileName, checked)}
                                    displayName={cardDisplayName(info)}
                                    requiredMissingCount={getRequiredMissingCount(info)}
                                    onFocus={() => setFocusedFile(info.fileName)}
                                    onToggleActive={() => handleToggleActive(info)}
                                    onOpenInspector={() => handleOpenInspector(info)}
                                    onContextMenu={onContextMenu(buildAssetContextMenu(info))}
                                    layout={cardLayout}
                                />
                            )}
                        />
                    ) : (
                        <div className="text-center text-3 py-12 text-body">
                            {searchKeyword || governanceView ? '没有匹配的资产' : '资产库空空如也'}
                        </div>
                    )}
                </div>
            </div>

            {/* 浮动购物车：空态消失 / 有已选=右下角胶囊 / 点胶囊展开浮层 */}
            {activeFileNames.size > 0 && (
                <div className="fixed bottom-6 right-6 z-50">
                    {!cartExpanded ? (
                        <button
                            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand text-white shadow-popover hover:opacity-90 transition-opacity"
                            onClick={() => setCartExpanded(true)}
                        >
                            <span className="w-2 h-2 rounded-full bg-white opacity-80" />
                            <span className="text-body font-medium">{activeFileNames.size} 台车</span>
                            <span className="text-caption opacity-80">· 去对比 →</span>
                        </button>
                    ) : (
                        <div className="relative">
                            {/* 透明点击层（点面板外收起；不用深色遮罩，保持列表可见=浮动本意） */}
                            <div className="fixed inset-0" onClick={() => setCartExpanded(false)} />
                            {/* 浮层面板 */}
                            <div className="relative w-[320px] max-h-[70vh] surface-container border border-popover rounded-xl shadow-popover overflow-hidden flex flex-col">
                                <AssetCart
                                    focusedFile={focusedFile}
                                    onFocusFile={setFocusedFile}
                                    onLocateAsset={handleLocateAsset}
                                    onGoCompare={() => { setCartExpanded(false); handleGoCompare(); }}
                                    onClose={() => setCartExpanded(false)}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 资产检查器 */}
            <AssetInspector
                open={Boolean(inspectorTarget)}
                instanceKey={inspectorTarget}
                snapshot={snapshot}
                actions={actions}
                onClose={() => setInspectorTarget(null)}
                onGoCompare={handleInspectorGoCompare}
            />
            {actions.modals}
            <AssetAliasBatchModal
                open={aliasBatchOpen}
                infos={aliasBatchTargets}
                metaMap={snapshot.meta}
                groupNameOf={info => resolveVehicleGroupKey(info, snapshot.meta[info.fileName], brandNames)}
                onCancel={() => setAliasBatchOpen(false)}
                onConfirm={handleAliasBatchConfirm}
            />
            {ContextMenuPortal}
            {/* 车型组重命名（写 meta.groupName；只改组头显示名，不改文件名） */}
            <Modal
                title="重命名车型组"
                open={groupRename.open}
                onOk={() => void handleGroupRenameConfirm()}
                onCancel={() => setGroupRename({ open: false, groupKey: null, name: '' })}
                okText="保存显示名"
                cancelText="取消"
                destroyOnClose
                width={520}
            >
                <div className="py-2">
                    <div className="text-[13px] text-2 mb-2">
                        分组显示名<b>只改变组头展示</b>，不改文件名，也不改资产内容。留空不会保存。
                    </div>
                    <Input
                        value={groupRename.name}
                        onChange={e => setGroupRename(s => ({ ...s, name: e.target.value }))}
                        onPressEnter={() => void handleGroupRenameConfirm()}
                        placeholder="如：白犀牛 R3"
                        autoFocus
                    />
                    {groupMergeTarget && (
                        <div className="mt-2 text-[12px] text-warning-text">
                            已有车型组「{pickGroupAlias(groupMergeTarget.files, groupMergeTarget.groupKey)}」使用同名——保存后两组将自动合并。
                        </div>
                    )}
                </div>
            </Modal>
            <AssetHotkeyCheatsheet open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />

            {/* 保存视图弹窗 */}
            <SaveViewModal
                open={saveViewOpen}
                seedName={saveViewSeed?.name ? `${saveViewSeed.name} 副本` : ''}
                onCancel={() => { setSaveViewOpen(false); setSaveViewSeed(null); }}
                onConfirm={saveView}
            />

            {/* 治理体检弹窗 */}
            <GovernanceReportModal
                open={governanceOpen}
                onClose={() => setGovernanceOpen(false)}
                report={governanceReport}
                onConvergeCars={handleConvergeCars}
                facetIssues={facetIssues}
                onOpenBatchEditor={() => {
                    setGovernanceOpen(false);
                    openFieldEditor({
                        fileNames: snapshot.infos
                            .filter(a => snapshot.meta[a.fileName]?.status !== 'deprecated')
                            .map(a => a.fileName),
                    });
                }}
            />
            <AssetBatchFieldEditor
                open={fieldEditorOpen}
                title={fieldEditorSeed?.groupName ? `批量字段维护 · ${fieldEditorSeed.groupName}` : '批量字段维护'}
                rows={fieldEditorRows}
                paramFields={paramFieldOptions}
                vocab={facetVocab}
                getParamEnumValues={getEnumValuesSync}
                onClose={closeFieldEditor}
                onSave={handleFieldEditorSave}
            />
        </div>
    );
};

export default AssetPoolLayout;
