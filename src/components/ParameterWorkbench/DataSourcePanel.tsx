import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DatabaseOutlined, LoadingOutlined, EditOutlined, CheckOutlined, PlusSquareOutlined, MinusSquareOutlined, ReloadOutlined, SearchOutlined, FolderOpenOutlined, ThunderboltOutlined, AuditOutlined, KeyOutlined, CloseCircleOutlined, HistoryOutlined, StopOutlined, CheckSquareOutlined, ArrowRightOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { Spin, Tooltip, Input, Button, Modal, message, Tag, Checkbox, Segmented } from 'antd';
import FileManager from './FileManager';
import AssetBatchTagBar from './AssetBatchTagBar';
import AssetStatsBadge from './AssetStatsBadge';
import GovernanceReportModal from './GovernanceReportModal';
import AssetGroupedView from './AssetGroupedView';
import AssetFacetSections, { type FacetSection } from './AssetFacetSections';
import AssetFilterPanel, { type FilterTagGroupRow } from '../AssetLibrary/AssetFilterPanel';
import GroupFacetEditor from '../AssetLibrary/GroupFacetEditor';
import AssetBatchFacetEditor, { type BatchFacetRow } from '../AssetLibrary/AssetBatchFacetEditor';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { getAssetFilesWithInfo, loadAssetTags, saveAssetTags, batchAddAssetTags, loadAssetMeta, saveAssetMeta, type AssetFileInfo, type AssetMetaMap } from '../../utils/assetManager';
import { useLongPress } from '../../hooks/useLongPress';
import { getAssetSourceMeta } from '../../utils/assetSourceTags';
import { getAssetDisplayName, validateAssetName, fixAssetName } from '../../utils/assetNaming';
import { classifyAvailableTagsWithConfig, filterAssetInfos } from '../../utils/assetTagFilters';
import { getAssetTagGroupsSync, ensureTagsInDefaultGroup, getExclusiveGroupTagSets } from '../../utils/assetTagGroups';
import { buildGovernanceReport, buildSupersedeMeta, collectPrimaryMeta, extractBrandNames, KEY_VEHICLE_TAG, normalizeGroupKey, pickGroupAlias, resolveVehicleGroupKey, sanitizeGroupName, sortGroupFiles, type UnconvergedCar, type VehicleGroup } from '../../utils/assetGovernance';
import {
    DEFAULT_FACET_VOCAB, EMPTY_FACET_VALUES, loadFacetVocab, loadFacetValues, saveFacetValues, saveFacetVocab,
    resolveAssetFacets, setGroupFacetValue, setAssetFacetOverride, collectUnmappedValues, addVocabValue,
    type FacetVocab, type FacetValues, type GroupFacetValue, type ResolvedFacets, type AssetFacetOverride, type FacetDimKey,
} from '../../utils/assetFacets';
import { EMPTY_FACET_SELECTION, isFacetSelectionActive, matchFacets, type FacetSelection } from '../../utils/facetFilters';
import { buildVehicleInstanceKey } from '../../utils/vehicleInstance';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useAnnouncementStore } from '../../store/announcementStore';
import type { AssetActions } from './useAssetActions';


// 简易格式化函数，替代 date-fns 避免依赖问题
const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

interface DataSourcePanelProps {
    focusedFile: string | null;
    onFocusFile: (fileName: string | null) => void;
    /** 打开资产检查器（instanceKey = asset::文件名::产品名） */
    onOpenInspector: (instanceKey: string) => void;
    /** 购物车反向定位请求：nonce 递增触发滚动定位（设计文档 §3.5） */
    locateRequest: { fileName: string; nonce: number } | null;
    /** 对象级操作（PoolPane 统一持有，右键/快捷钮/平铺卡共用） */
    actions: AssetActions;
}

const DataSourcePanel: React.FC<DataSourcePanelProps> = ({ focusedFile, onFocusFile, onOpenInspector, locateRequest, actions }) => {
    const {
        assetLibraryPath,
        uploadedFiles,
        addActiveAsset,
        selectedProductNames,
        assetTagGroupsVersion,
        assetVersion,
        setAssetLibraryPath,
        bumpAssetTagGroupsVersion,
    } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        uploadedFiles: state.uploadedFiles,
        addActiveAsset: state.addActiveAsset,
        selectedProductNames: state.selectedProductNames,
        assetTagGroupsVersion: state.assetTagGroupsVersion,
        assetVersion: state.assetVersion,
        setAssetLibraryPath: state.setAssetLibraryPath,
        bumpAssetTagGroupsVersion: state.bumpAssetTagGroupsVersion,
    })));
    const panelRef = useRef<HTMLDivElement>(null);
    

    // 智能联动逻辑：根据当前选中的车型，判断某个资产是否处于“激活”状态
    // 此处定义：如果该资产内含的车型（通常为 info.productName）已在 selectedProductNames 中，则视为已激活
    // 注意：如果是单文件多车型，这里可能需要更复杂的 mapped 逻辑，目前先处理 1:1 场景或首选名称匹配

    const [assets, setAssets] = useState<AssetFileInfo[]>([]);
    const [loading, setLoading] = useState(false);

    // 治理元数据（历史/废弃/组名）与体检弹窗
    const [assetMeta, setAssetMeta] = useState<AssetMetaMap>({});
    const [governanceOpen, setGovernanceOpen] = useState(false);
    // 关键车型过滤（ADR-0003：业务主推标记，替代原主文件过滤）
    const [keyVehicleOnly, setKeyVehicleOnly] = useState(false);
    // 软删除语义（ADR-0002）：deprecated 默认隐藏，显式开启才展示（恢复/彻底删除的入口）
    const [showDeprecated, setShowDeprecated] = useState(false);
    // 只看已选（设计文档 §3.5）：把列表过滤为已激活清单（去对比/填报前复核用）
    const [selectedOnly, setSelectedOnly] = useState(false);

    // ===== 受控属性（Facet）：词表 + 取值 + 横切筛选（ADR-0001） =====
    const [facetVocab, setFacetVocab] = useState<FacetVocab>(DEFAULT_FACET_VOCAB);
    const [facetValues, setFacetValues] = useState<FacetValues>(EMPTY_FACET_VALUES);
    const [facetSelection, setFacetSelection] = useState<FacetSelection>(EMPTY_FACET_SELECTION);
    const [groupFacetEditor, setGroupFacetEditor] = useState<{ open: boolean; groupKey: string | null; groupName: string }>({ open: false, groupKey: null, groupName: '' });
    const [batchEditorOpen, setBatchEditorOpen] = useState(false);

    // 视图模式（车型分组默认 / 主机厂 / 车型族群 / 平铺）与分组展开记忆
    const [viewMode, setViewMode] = useState<'grouped' | 'mfr' | 'family' | 'flat'>(() => {
        try { return (localStorage.getItem('asset-panel-view-mode') as 'grouped' | 'mfr' | 'family' | 'flat') || 'grouped'; } catch (e) { console.warn(e); return 'grouped'; }
    });
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
        try { const raw = localStorage.getItem('asset-panel-expanded-groups'); return new Set(raw ? (JSON.parse(raw) as string[]) : []); } catch (e) { console.warn(e); return new Set(); }
    });

    const persistViewMode = useCallback((mode: 'grouped' | 'mfr' | 'family' | 'flat') => {
        setViewMode(mode);
        try { localStorage.setItem('asset-panel-view-mode', mode); } catch (e) { console.warn(e); }
    }, []);

    const toggleGroupExpanded = useCallback((key: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            try { localStorage.setItem('asset-panel-expanded-groups', JSON.stringify([...next])); } catch (e) { console.warn(e); }
            return next;
        });
    }, []);

    // 车型组重命名（只写分组显示名，与文件名解耦）
    const [groupRename, setGroupRename] = useState<{ open: boolean; groupKey: string | null; name: string }>({ open: false, groupKey: null, name: '' });
    
    // Rename state（弹层已随对象级动作移入 useAssetActions）
    const [searchKeyword, setSearchKeyword] = useState('');

    // 标签系统
    const [assetTags, setAssetTags] = useState<Record<string, string[]>>({});
    const [selectedGroupTag, setSelectedGroupTag] = useState<Record<string, string | null>>({});
    const [selectedOtherFilterTags, setSelectedOtherFilterTags] = useState<string[]>([]);

    const [announceNoInput, setAnnounceNoInput] = useState('');

    // ===== 公告中心关联（设计文档 2026-10-01-announcement-center §4.4） =====
    // 公告记录常驻加载：useAssetActions 的公告动作读 useAnnouncementStore.getState()
    const announcementLoadFor = useAnnouncementStore(state => state.loadFor);
    useEffect(() => {
        announcementLoadFor(assetLibraryPath);
    }, [assetLibraryPath, announcementLoadFor]);

    // 公告中心「查看关联资产」跳转：消费待应用的公告号过滤（一次性）
    const pendingAnnounceNoFilter = useVehicleStore(state => state.pendingAnnounceNoFilter);
    const setPendingAnnounceNoFilter = useVehicleStore(state => state.setPendingAnnounceNoFilter);
    useEffect(() => {
        if (pendingAnnounceNoFilter && pendingAnnounceNoFilter.length > 0) {
            // 输入框本身按空白/逗号拆多值，组级多公告号直接空格拼接
            setAnnounceNoInput(pendingAnnounceNoFilter.join(' '));
            setPendingAnnounceNoFilter(null);
        }
    }, [pendingAnnounceNoFilter, setPendingAnnounceNoFilter]);

    // 批量打标签（长按卡片或右键菜单「批量选择」进入）
    const [batchMode, setBatchMode] = useState(false);
    const [selectedFileNames, setSelectedFileNames] = useState<Set<string>>(new Set());
    const longPressTargetRef = useRef<string | null>(null);


    /** @param force 跳过扫描缓存（「刷新资产库」按钮用：应用外的文件增删改没有失效信号） */
    const fetchAssets = useCallback(async (force = false) => {
        if (!assetLibraryPath) return;
        setLoading(true);
        try {
            const [infos, tags, meta, vocab, values] = await Promise.all([
                getAssetFilesWithInfo(assetLibraryPath, force),
                loadAssetTags(assetLibraryPath),
                loadAssetMeta(assetLibraryPath),
                loadFacetVocab(assetLibraryPath),
                loadFacetValues(assetLibraryPath),
            ]);
            setFacetVocab(vocab);
            setFacetValues(values);
            // 主文件 → 关键车型 一次性迁移（ADR-0003：主文件已退役）
            let effectiveTags = tags;
            const effectiveMeta = meta;
            const { primaryFileNames, cleaned } = collectPrimaryMeta(meta);
            if (primaryFileNames.length > 0) {
                effectiveTags = { ...tags };
                primaryFileNames.forEach(fileName => {
                    effectiveTags[fileName] = Array.from(new Set([...(effectiveTags[fileName] || []), KEY_VEHICLE_TAG]));
                });
                await saveAssetTags(assetLibraryPath, effectiveTags);
                await saveAssetMeta(assetLibraryPath, cleaned);
                message.info(`已将 ${primaryFileNames.length} 个主文件标记迁移为「${KEY_VEHICLE_TAG}」标签`);
            }
            // 按更新时间倒序（每车最新版的定位交给分组视图的链头徽章）
            // 复制后再排序：infos 现由扫描缓存共享，原地排序会污染其他调用方
            setAssets([...infos].sort((a, b) => {
                if (!a.updatedAt) return 1;
                if (!b.updatedAt) return -1;
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            }));
            setAssetTags(effectiveTags);
            setAssetMeta(effectiveMeta);
        } catch (err) {
            console.error("Failed to load assets with info", err);
        } finally {
            setLoading(false);
        }
    }, [assetLibraryPath]);

    useEffect(() => {
        fetchAssets();
    }, [assetLibraryPath, uploadedFiles, assetVersion]); // Re-fetch if files uploaded or asset version bumped

    // 资产列表变化（删除/重命名/刷新）后，剔除选择集中已不存在的文件
    useEffect(() => {
        setSelectedFileNames(prev => {
            if (prev.size === 0) return prev;
            const alive = new Set(assets.map(a => a.fileName));
            const next = new Set([...prev].filter(f => alive.has(f)));
            return next.size === prev.size ? prev : next;
        });
    }, [assets]);

    // Esc 退出批量模式
    useEffect(() => {
        if (!batchMode) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setBatchMode(false);
                setSelectedFileNames(new Set());
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [batchMode]);

    // 更换资产库目录
    const handleSetAssetLibrary = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                directory: true,
                multiple: false,
                title: '选择资产库目录'
            });
            if (selected && typeof selected === 'string') {
                setAssetLibraryPath(selected);
                message.success(`已设置资产库目录: ${selected}`);
            }
        } catch (err) {
            console.error('Failed to select directory', err);
            message.error('选择目录失败');
        }
    };

    // 对象级操作（重命名/激活/删除/导出/公告关联/标签等）已移入 useAssetActions（设计文档 §3.3）
    const { onContextMenu, ContextMenuPortal } = useContextMenu();

    const toggleFilterTag = (tag: string) => {
        setSelectedOtherFilterTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };


    // 全局标签集合 = 资产上已使用的标签 ∪ 系统分组内的全部标签（分组里的标签还没绑到资产上也可见）
    const allTags = useMemo(() => {
        const set = new Set<string>();
        Object.values(assetTags).forEach(tags => tags.forEach(t => set.add(t)));
        getAssetTagGroupsSync().groups.forEach(g => g.tags.forEach(t => set.add(t)));
        return Array.from(set).sort();
    }, [assetTags]);

    const groupedTags = useMemo(
        () => classifyAvailableTagsWithConfig(allTags, getAssetTagGroupsSync()),
        [allTags, assetTagGroupsVersion]
    );

    // 分组行（筛选栏与批量打标签栏共用）：groupId → { id, name, tags, exclusive }
    const tagGroupRows = useMemo(() => {
        const groups = getAssetTagGroupsSync();
        const nameMap = new Map(groups.groups.map(g => [g.id, g.name]));
        // 已升格为受控属性的标签组（ADR-0001）：数据保留作派生兜底，UI 不再当筛选/打标项展示
        const retiredNames = new Set(['厂商', '车型族群', '准入等级']);
        const retiredIds = new Set(['vendor', 'manufacturer', 'vehicleFamily', 'admissionLevel']);
        return Object.entries(groupedTags)
            .filter(([gid]) => {
                const name = nameMap.get(gid) || '';
                return !retiredIds.has(gid) && !retiredNames.has(name);
            })
            .map(([gid, tags]) => ({
                id: gid,
                name: gid === '_other' ? '未分组' : (nameMap.get(gid) || gid),
                tags,
                exclusive: gid !== '_other' && groups.exclusiveGroups.includes(gid),
            }));
    }, [groupedTags]);

    
    // 按来源计算每个资产的有效公告号
    // 公告数据资产已随公告中心迁移撤出资产库（设计文档 2026-10-01 §6），统一用参数中的公告字段
    const effectiveAnnounceNos = useMemo(() => {
        return new Map(assets.map(a => [a.fileName, a.announceNos] as [string, string[]]));
    }, [assets]);

    // 公告关联动作（复制公告号/查看 PDF/与公告对比）已移入 useAssetActions

    // 从所有资产中提取可用的公告号列表
    const availableAnnounceNos = useMemo(() => {
        const nos = new Set<string>();
        assets.forEach(a => {
            const effNos = effectiveAnnounceNos.get(a.fileName) || [];
            effNos.forEach(n => nos.add(n));
        });
        return Array.from(nos).sort();
    }, [assets, effectiveAnnounceNos]);

    // 解析用户输入的公告号（支持逗号、换行、空格、tab 分隔）
    const parsedAnnounceNos = useMemo(() => {
        if (!announceNoInput.trim()) return [];
        return announceNoInput
            .split(/[\s,，\n\t]+/)
            .map(s => s.trim().toUpperCase())
            .filter(Boolean);
    }, [announceNoInput]);

    // 匹配/未匹配分类
    const announceNoMatchResult = useMemo(() => {
        if (parsedAnnounceNos.length === 0) return { matched: [] as string[], unmatched: [] as string[] };
        const matched: string[] = [];
        const unmatched: string[] = [];
        const allNos = new Set(availableAnnounceNos);
        parsedAnnounceNos.forEach(no => {
            if (allNos.has(no)) matched.push(no);
            else unmatched.push(no);
        });
        return { matched, unmatched };
    }, [parsedAnnounceNos, availableAnnounceNos]);

    // 粘贴框与公告号 facet 共享同一份筛选状态：粘贴即勾选对应 facet 值（设计 §5 融合）
    useEffect(() => {
        setFacetSelection(prev => {
            const next = announceNoMatchResult.matched;
            if (next.length === prev.announceNos.length && next.every((v, i) => v === prev.announceNos[i])) return prev;
            return { ...prev, announceNos: [...next] };
        });
    }, [announceNoMatchResult]);

    // 命名合规统计
    const namingCompliance = useMemo(() => {
        const nonCompliant: { name: string; errors: string[] }[] = [];
        assets.forEach(a => {
            const effNos = effectiveAnnounceNos.get(a.fileName) || [];
            const v = validateAssetName(a.fileName, effNos);
            if (!v.valid) nonCompliant.push({ name: a.fileName, errors: v.errors });
        });
        return { total: assets.length, nonCompliant };
    }, [assets]);

    // ===== 数据治理（版本链/历史/废弃） =====
    const brandNames = useMemo(
        () => extractBrandNames(getAssetTagGroupsSync().groups),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [assetTagGroupsVersion]
    );

    const governanceReport = useMemo(
        () => buildGovernanceReport(assets, assetMeta, brandNames, info => effectiveAnnounceNos.get(info.fileName) || []),
        [assets, assetMeta, brandNames, effectiveAnnounceNos]
    );

    // 逐资产受控属性解析（人工修正 > 派生 > 组级 > 标签兜底）
    const fileFacets = useMemo(() => {
        const map = new Map<string, ResolvedFacets>();
        assets.forEach(info => {
            const groupKey = resolveVehicleGroupKey(info, assetMeta[info.fileName], brandNames);
            map.set(info.fileName, resolveAssetFacets({
                fileName: info.fileName,
                groupKey,
                // 公告号口径统一到 effectiveAnnounceNos（公告数据源=车辆型号，其余=公告字段）
                info: { ...info, announceNos: effectiveAnnounceNos.get(info.fileName) ?? info.announceNos, vehicleModel: null },
                tags: assetTags[info.fileName],
                values: facetValues,
                vocab: facetVocab,
            }));
        });
        return map;
    }, [assets, assetMeta, assetTags, facetValues, facetVocab, brandNames, effectiveAnnounceNos]);

    /** facet 筛选面板的候选集（含废弃与否跟随「显示废弃」，与列表同口径） */
    const facetItems = useMemo(() => {
        const base = showDeprecated ? assets : assets.filter(a => assetMeta[a.fileName]?.status !== 'deprecated');
        return base
            .map(a => fileFacets.get(a.fileName))
            .filter((f): f is ResolvedFacets => !!f)
            .map(facets => ({ facets }));
    }, [assets, assetMeta, showDeprecated, fileFacets]);

    /** 受控属性体检：待补全计数 + 词表外待归类写法 */
    const facetIssues = useMemo(() => {
        const missingCount = Array.from(fileFacets.values()).filter(f =>
            f.manufacturer === null || f.batteryBrand === null || f.capacityKwh === null || f.admissionLevel === null
        ).length;
        const mfrRaws = assets.map(a => a.manufacturerRaw).filter((v): v is string => !!v);
        const brandRaws = assets.map(a => a.batteryBrandRaw).filter((v): v is string => !!v);
        return {
            missingCount,
            unmapped: [
                { dim: '主机厂', values: collectUnmappedValues(facetVocab.manufacturer, mfrRaws) },
                { dim: '电池品牌', values: collectUnmappedValues(facetVocab.batteryBrand, brandRaws) },
            ],
        };
    }, [assets, fileFacets, facetVocab]);

    /** 批量补录表格的行（废弃除外） */
    const batchEditorRows = useMemo<BatchFacetRow[]>(() => assets
        .filter(a => assetMeta[a.fileName]?.status !== 'deprecated')
        .flatMap(a => {
            const facets = fileFacets.get(a.fileName);
            return facets ? [{ fileName: a.fileName, productName: a.productName, facets }] : [];
        }), [assets, assetMeta, fileFacets]);

    const handleSaveFacetOverrides = async (updates: Record<string, AssetFacetOverride>) => {
        if (!assetLibraryPath) return;
        // 就地收词：修正里出现的词表外新值一并进词表
        let vocab = facetVocab;
        let next = facetValues;
        Object.entries(updates).forEach(([fileName, patch]) => {
            const finalPatch: AssetFacetOverride = { ...patch };
            (['manufacturer', 'batteryBrand', 'admissionLevel'] as FacetDimKey[]).forEach(dim => {
                const v = finalPatch[dim as keyof AssetFacetOverride];
                if (typeof v === 'string' && v.trim()) {
                    const r = addVocabValue(vocab, dim, v);
                    vocab = r.vocab;
                    (finalPatch as Record<string, unknown>)[dim] = r.value;
                }
            });
            next = setAssetFacetOverride(next, fileName, finalPatch);
        });
        if (vocab !== facetVocab) {
            setFacetVocab(vocab);
            await saveFacetVocab(assetLibraryPath, vocab);
        }
        setFacetValues(next);
        await saveFacetValues(assetLibraryPath, next);
        message.success(`已保存 ${Object.keys(updates).length} 个资产的属性修正`);
        setBatchEditorOpen(false);
    };

    const writeMetaMap = useCallback(async (next: AssetMetaMap) => {
        if (!assetLibraryPath) return;
        setAssetMeta(next);
        await saveAssetMeta(assetLibraryPath, next);
    }, [assetLibraryPath]);

    // 版本链收敛（ADR-0003）：同车多份活跃版本时，把非链头文件标为历史版本
    const handleConvergeCars = async (cars: UnconvergedCar[]) => {
        if (cars.length === 0) return;
        const pairs = cars.flatMap(car => car.files
            .filter(f => f.meta.status !== 'superseded' && f.meta.status !== 'deprecated' && f.info.fileName !== car.latestFileName)
            .map(f => ({ oldFileName: f.info.fileName, newFileName: car.latestFileName || f.info.fileName })));
        if (pairs.length === 0) {
            message.info('没有需要收敛的旧版本');
            return;
        }
        await writeMetaMap(buildSupersedeMeta(assetMeta, pairs));
        message.success(`已收敛 ${cars.length} 辆车的版本链（${pairs.length} 个旧版本标记为历史）`);
    };

    // 已激活（在工作区）的文件名集合；「只看已选」与行标记/组头角标共用
    const activeFileNames = useMemo(() => new Set(
        assets
            .filter(a => selectedProductNames.includes(buildVehicleInstanceKey('asset', a.fileName, a.productName)))
            .map(a => a.fileName)
    ), [assets, selectedProductNames]);

    // 按关键字 + 标签过滤资产列表
    const filteredAssets = useMemo(() => {
        let result = assets;

        // 废弃资产默认隐藏（软删除语义），「显示废弃」后可见（恢复/彻底删除入口）
        if (!showDeprecated) {
            result = result.filter(a => assetMeta[a.fileName]?.status !== 'deprecated');
        }

        // 受控属性横切筛选（维度内 OR、维度间 AND）
        if (isFacetSelectionActive(facetSelection)) {
            result = result.filter(a => {
                const f = fileFacets.get(a.fileName);
                return f ? matchFacets(f, facetSelection) : true;
            });
        }

        // 标签过滤（取交集）
        result = filterAssetInfos({
            assets: result,
            assetTags,
            selectedGroupTags: selectedGroupTag,
            selectedOtherFilterTags,
        });

        // 关键车型过滤（ADR-0003）
        if (keyVehicleOnly) {
            result = result.filter(a => (assetTags[a.fileName] || []).includes(KEY_VEHICLE_TAG));
        }

        // 只看已选（设计文档 §3.5）
        if (selectedOnly) {
            result = result.filter(a => activeFileNames.has(a.fileName));
        }

        // 关键字过滤（文件名、产品名、标签、公告号、主机厂）
        if (searchKeyword.trim()) {
            const kw = searchKeyword.trim().toLowerCase();
            result = result.filter(a => {
                const tags = assetTags[a.fileName] || [];
                const f = fileFacets.get(a.fileName);
                return a.fileName.toLowerCase().includes(kw) ||
                    a.productName.toLowerCase().includes(kw) ||
                    tags.some(t => t.toLowerCase().includes(kw)) ||
                    (f && (
                        f.announceNos.some(n => n.toLowerCase().includes(kw)) ||
                        (f.manufacturer ? f.manufacturer.toLowerCase().includes(kw) : false)
                    ));
            });
        }

        return result;
    }, [assets, searchKeyword, assetTags, selectedGroupTag, selectedOtherFilterTags, keyVehicleOnly, selectedOnly, showDeprecated, assetMeta, assetTagGroupsVersion, facetSelection, fileFacets, activeFileNames]);

    // ===== 车型分组视图（AssetGroupedView 的数据准备） =====

    /** 把治理报告的分组按当前筛选裁剪并组内排序；空组不渲染。displayName = meta 别名或推导键 */
    const visibleGroups = useMemo(() => {
        const visible = new Set(filteredAssets.map(a => a.fileName));
        return governanceReport.groups
            .map(g => {
                const files = sortGroupFiles(g.files.filter(f => visible.has(f.info.fileName)));
                return { ...g, files, displayName: pickGroupAlias(files, g.groupKey) };
            })
            .filter(g => g.files.length > 0);
    }, [governanceReport, filteredAssets]);

    /** 按组级受控属性分节（分组维度 = 主机厂 / 车型族群），「(无)」垫底 */
    const facetSections = useMemo<FacetSection[]>(() => {
        const dim: 'manufacturer' | 'vehicleFamily' = viewMode === 'mfr' ? 'manufacturer' : 'vehicleFamily';
        const buckets = new Map<string, FacetSection>();
        visibleGroups.forEach(g => {
            const first = g.files[0]?.info.fileName;
            const f = first ? fileFacets.get(first) : undefined;
            const v = dim === 'manufacturer' ? (f?.manufacturer ?? null) : (f?.vehicleFamily ?? null);
            const key = v ?? '__none__';
            if (!buckets.has(key)) {
                buckets.set(key, { key, label: v ?? '（无）', isNone: v === null, groups: [] });
            }
            buckets.get(key)!.groups.push(g);
        });
        return Array.from(buckets.values()).sort((a, b) => {
            if (a.isNone !== b.isNone) return a.isNone ? 1 : -1;
            return b.groups.length - a.groups.length || a.label.localeCompare(b.label, 'zh-Hans-CN');
        });
    }, [viewMode, visibleGroups, fileFacets]);

    const filtersActive = Boolean(searchKeyword.trim())
        || announceNoMatchResult.matched.length > 0
        || keyVehicleOnly
        || isFacetSelectionActive(facetSelection)
        || Object.values(selectedGroupTag).some(Boolean)
        || selectedOtherFilterTags.length > 0;

    // 每车链头文件名集合（⚡激活、最新版徽章共用）
    const latestSet = useMemo(() => new Set(governanceReport.latestFileNames), [governanceReport]);

    // ⚡ 一键激活：激活组内每辆车的最新版本（ADR-0003，一组几辆车就进几辆）
    const handleActivateLatest = (group: VehicleGroup) => {
        const reportGroup = governanceReport.groups.find(g => g.groupKey === group.groupKey) ?? group;
        const targets = reportGroup.files.filter(f => latestSet.has(f.info.fileName));
        if (targets.length === 0) {
            message.info('该车型组暂无可激活的文件');
            return;
        }
        let added = 0;
        let alreadyIn = 0;
        targets.forEach(entry => {
            if (selectedProductNames.includes(buildVehicleInstanceKey('asset', entry.info.fileName, entry.info.productName))) {
                alreadyIn++;
                return;
            }
            addActiveAsset(entry.info.fileName, entry.info.productName);
            added++;
        });
        if (added > 0) {
            onFocusFile(targets[targets.length - 1].info.fileName);
            message.success(`已激活 ${added} 辆车的最新版本${alreadyIn > 0 ? `（${alreadyIn} 辆已在工作区）` : ''}`);
        } else {
            message.info('该组车辆均已在工作区');
        }
    };

    // 含激活资产的组自动展开（并持久化），无需手动记忆
    useEffect(() => {
        const activeGroupKeys = visibleGroups
            .filter(g => g.files.some(f => activeFileNames.has(f.info.fileName)))
            .map(g => g.groupKey);
        const missing = activeGroupKeys.filter(k => !expandedGroups.has(k));
        if (missing.length === 0) return;
        setExpandedGroups(prev => {
            const next = new Set([...prev, ...missing]);
            try { localStorage.setItem('asset-panel-expanded-groups', JSON.stringify([...next])); } catch (e) { console.warn(e); }
            return next;
        });
    }, [visibleGroups, activeFileNames, expandedGroups]);

    // 购物车反向定位（设计文档 §3.5）：滚动到目标资产行并短暂高亮
    const locateRanRef = useRef(0);
    useEffect(() => {
        if (!locateRequest || locateRanRef.current === locateRequest.nonce) return;
        locateRanRef.current = locateRequest.nonce;
        const { fileName } = locateRequest;
        const group = governanceReport.groups.find(g => g.files.some(f => f.info.fileName === fileName));
        const needExpand = Boolean(group && !expandedGroups.has(group.groupKey));
        if (needExpand && group) toggleGroupExpanded(group.groupKey);
        // 定位是一次性触发（nonce 防重入），故意不清理定时器：重渲染不应取消已入队的定位
        window.setTimeout(() => {
            const el = panelRef.current?.querySelector(`[data-asset-file="${CSS.escape(fileName)}"]`);
            if (!el) {
                message.info('该资产当前不在列表中（可能被筛选隐藏）');
                return;
            }
            el.scrollIntoView({ block: 'center' });
            el.classList.add('vp-locate-flash');
            window.setTimeout(() => el.classList.remove('vp-locate-flash'), 1800);
        }, needExpand ? 260 : 0);
    }, [locateRequest, governanceReport, expandedGroups, toggleGroupExpanded]);

    // ===== 车型组重命名：只写分组显示名，与文件名解耦（文件名永不因此改动） =====
    const openGroupRename = (group: VehicleGroup & { displayName: string }) => setGroupRename({ open: true, groupKey: group.groupKey, name: group.displayName });

    // ===== 组属性编辑（主机厂/车型族群，组级受控属性，一组一值） =====
    const openGroupFacetEditor = (group: VehicleGroup & { displayName: string }) =>
        setGroupFacetEditor({ open: true, groupKey: group.groupKey, groupName: group.displayName });

    const handleGroupFacetSave = async (value: GroupFacetValue) => {
        if (!assetLibraryPath || !groupFacetEditor.groupKey) return;
        // 就地收词：词表外新值（如「重卡」）自动进词表，保持受控属性词表约束
        let vocab = facetVocab;
        const finalValue: GroupFacetValue = { ...value };
        if (finalValue.manufacturer) {
            const r = addVocabValue(vocab, 'manufacturer', finalValue.manufacturer);
            vocab = r.vocab;
            finalValue.manufacturer = r.value;
        }
        if (finalValue.vehicleFamily) {
            const r = addVocabValue(vocab, 'vehicleFamily', finalValue.vehicleFamily);
            vocab = r.vocab;
            finalValue.vehicleFamily = r.value;
        }
        if (vocab !== facetVocab) {
            setFacetVocab(vocab);
            await saveFacetVocab(assetLibraryPath, vocab);
        }
        const next = setGroupFacetValue(facetValues, groupFacetEditor.groupKey, finalValue);
        setFacetValues(next);
        await saveFacetValues(assetLibraryPath, next);
        message.success(`「${groupFacetEditor.groupName}」组属性已保存（组内资产继承）`);
        setGroupFacetEditor(prev => ({ ...prev, open: false }));
    };

    // 用未筛选的全量组（体检报告口径）确定作用范围，避免筛选态下漏写
    const groupRenameTarget = useMemo(
        () => governanceReport.groups.find(g => g.groupKey === groupRename.groupKey) ?? null,
        [governanceReport, groupRename.groupKey]
    );
    const sanitizedGroupName = useMemo(() => sanitizeGroupName(groupRename.name), [groupRename.name]);

    // 提示：新显示名与既有组同键（规范化后相等）→ 保存后两组自动合并
    const mergeTargetGroup = useMemo(() => {
        if (!groupRenameTarget || !sanitizedGroupName) return null;
        const newKey = normalizeGroupKey(sanitizedGroupName);
        if (newKey === groupRenameTarget.groupKey) return null;
        return governanceReport.groups.find(g => g.groupKey === newKey) ?? null;
    }, [governanceReport, groupRenameTarget, sanitizedGroupName]);

    const handleGroupRenameConfirm = async () => {
        if (!assetLibraryPath || !groupRenameTarget) return;
        const newKey = sanitizeGroupName(groupRename.name);
        if (!newKey) { message.warning('请输入有效的车型名'); return; }
        if (newKey === pickGroupAlias(groupRenameTarget.files, groupRenameTarget.groupKey)) { setGroupRename({ open: false, groupKey: null, name: '' }); return; }

        const next: AssetMetaMap = { ...assetMeta };
        groupRenameTarget.files.forEach(f => {
            next[f.info.fileName] = { ...(next[f.info.fileName] || {}), groupName: newKey };
        });
        await saveAssetMeta(assetLibraryPath, next);
        setAssetMeta(next);
        const merged = mergeTargetGroup;
        const mergedCount = merged ? groupRenameTarget.files.length + merged.files.length : 0;
        message.success(merged
            ? `已保存显示名并入组「${newKey}」（合并后共 ${mergedCount} 个文件，文件名保持不变）`
            : `分组显示名已更新为「${newKey}」（文件名保持不变）`);
        if (merged && [...groupRenameTarget.files, ...merged.files].filter(f => f.meta.status !== 'superseded' && f.meta.status !== 'deprecated').length > 1) {
            message.info('合并后的组含多辆车，各自版本链相互独立');
        }
        setGroupRename({ open: false, groupKey: null, name: '' });
    };

    // 打开资产检查器（右键/行双击/摘要卡共用入口）
    const openAssetInspector = (info: AssetFileInfo) =>
        onOpenInspector(buildVehicleInstanceKey('asset', info.fileName, info.productName));

    // 右键菜单（平铺卡片与分组行共用）：高频短路径 + 检查器入口，
    // 其余对象级操作统一走资产检查器（设计文档 §3.4；复制公告号系用户反馈提回）
    const buildAssetContextMenu = (info: AssetFileInfo) => {
        const currentlyActive = activeFileNames.has(info.fileName);
        return [
            {
                key: 'active',
                icon: currentlyActive
                    ? <MinusSquareOutlined className="text-danger" />
                    : <PlusSquareOutlined className="text-brand" />,
                label: currentlyActive ? '移出工作集' : '激活进工作集',
                onClick: () => actions.toggleActive(info, currentlyActive),
            },
            // 高频元数据动作：从检查器提回右键（2026-10-01 用户反馈：复制公告号埋太深）
            { key: 'copy-announce', label: '复制公告号', onClick: () => actions.copyAnnounceNo(info) },
            { key: 'finder', label: '在 Finder 中显示', onClick: () => void actions.revealInFinder(info) },
            { key: 'rename', label: '重命名', onClick: () => actions.startRename(info) },
            { key: 'batch', label: '批量选择', onClick: () => enterBatchMode(info.fileName) },
            { key: 'divider1', divider: true, onClick: () => {} },
            {
                key: 'inspector',
                icon: <ArrowRightOutlined className="text-2" />,
                label: '打开检查器…',
                onClick: () => openAssetInspector(info),
            },
        ];
    };

    // ===== 批量打标签 =====
    const enterBatchMode = (fileName: string) => {
        setBatchMode(true);
        setSelectedFileNames(prev => new Set(prev).add(fileName));
    };

    const exitBatchMode = () => {
        setBatchMode(false);
        setSelectedFileNames(new Set());
    };

    const toggleBatchSelected = (fileName: string, checked: boolean) => {
        setSelectedFileNames(prev => {
            const next = new Set(prev);
            if (checked) next.add(fileName);
            else next.delete(fileName);
            return next;
        });
    };

    // 全选 = 把当前筛选结果并入选择集（可先筛选再全选，之后逐个反勾选）
    const handleBatchSelectAll = (checked: boolean) => {
        if (!checked) {
            setSelectedFileNames(new Set());
            return;
        }
        setSelectedFileNames(prev => {
            const next = new Set(prev);
            filteredAssets.forEach(a => next.add(a.fileName));
            return next;
        });
    };

    const handleBatchAddTags = async (tags: string[]) => {
        if (!assetLibraryPath || tags.length === 0) return;
        if (selectedFileNames.size === 0) {
            message.warning('请先勾选要打标签的资产');
            return;
        }
        const count = selectedFileNames.size;
        const exclusiveSets = getExclusiveGroupTagSets();
        const touchesExclusive = tags.some(t => exclusiveSets.some(set => set.includes(t)));
        try {
            const updated = await batchAddAssetTags(assetLibraryPath, [...selectedFileNames], tags, exclusiveSets);
            const groupsUpdated = await ensureTagsInDefaultGroup(assetLibraryPath, tags);
            if (groupsUpdated) bumpAssetTagGroupsVersion();
            setAssetTags(updated);
            const suffix = touchesExclusive ? '（互斥组标签已替换组内原有标签）' : '';
            message.success(`已为 ${count} 个资产添加标签：${tags.join('、')}${suffix}`);
        } catch (err) {
            console.error('Batch add tags failed', err);
            message.error('批量添加标签失败');
        }
    };

    // 全选态按「当前筛选结果」计算（选择集可包含被筛走的资产，一并生效）
    const batchSelectionStats = useMemo(() => {
        const inFiltered = filteredAssets.filter(a => selectedFileNames.has(a.fileName)).length;
        return {
            allSelected: filteredAssets.length > 0 && inFiltered === filteredAssets.length,
            indeterminate: inFiltered > 0 && inFiltered < filteredAssets.length,
        };
    }, [filteredAssets, selectedFileNames]);

    // 长按进入批量模式（目标卡片通过 ref 传入，避免在 map 里调 hook）
    const cardLongPress = useLongPress(() => {
        const fileName = longPressTargetRef.current;
        if (fileName) enterBatchMode(fileName);
    });

    // 车型分组/属性分节两种分组视图共用的 props
    const groupedViewProps = {
        focusedFile,
        activeFileNames,
        assetTags,
        batchMode,
        selectedFileNames,
        expandedKeys: expandedGroups,
        filtersActive,
        onToggleGroup: toggleGroupExpanded,
        onFocusFile,
        onToggleAsset: actions.toggleActive,
        onActivateLatest: handleActivateLatest,
        latestFileNames: latestSet,
        onOpenInspector: openAssetInspector,
        onToggleBatchSelected: toggleBatchSelected,
        onRowContextMenu: (info: AssetFileInfo) => onContextMenu(buildAssetContextMenu(info)),
        onHeaderContextMenu: (group: VehicleGroup & { displayName: string }) => onContextMenu([
            { key: 'rename', icon: <EditOutlined className="text-brand" />, label: '重命名车型', onClick: () => openGroupRename(group) },
        ]),
        onRenameGroup: openGroupRename,
        onEditGroupFacets: openGroupFacetEditor,
    };

    // 一键清除全部筛选（受控属性 + 公告号 + 标签）
    const handleClearAllFilters = () => {
        setFacetSelection(EMPTY_FACET_SELECTION);
        setAnnounceNoInput('');
        setSelectedGroupTag({});
        setSelectedOtherFilterTags([]);
    };

    return (
        <div ref={panelRef} className="flex flex-col h-full surface-layout">
            {/* Asset Library：顶栏 sticky 钉在滚动区顶部（设计文档 §3.1），筛选面板与列表随内容滚动 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="sticky top-0 z-10 surface-layout px-3 pt-3 pb-1">
                <div className="flex justify-between items-center mb-2 px-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[16px] font-bold text-1">车型资产库</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <FileManager
                            hiddenAssetButton={true}
                            onSelectFile={onFocusFile}
                            focusedFile={focusedFile}
                        />
                        {loading && <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />} />}
                        <Tooltip title="数据治理体检（版本链/重复检测/命名）">
                            <Button
                                type="text"
                                size="small"
                                icon={<AuditOutlined className={`!text-[14px] text-3 hover:text-brand ${governanceReport.unconvergedCars.length > 0 ? 'text-[color:var(--warning)]' : ''}`} />}
                                onClick={() => setGovernanceOpen(true)}
                                className="w-7 h-7 p-0 min-w-0 flex items-center justify-center rounded-lg"
                            />
                        </Tooltip>
                        <Tooltip title="刷新资产库">
                            <Button
                                type="text"
                                size="small"
                                icon={<ReloadOutlined className={`!text-[14px] text-3 hover:text-brand ${loading ? 'animate-spin' : ''}`} />}
                                onClick={() => { void fetchAssets(true); }}
                                disabled={loading}
                                className="w-7 h-7 p-0 min-w-0 flex items-center justify-center rounded-lg"
                            />
                        </Tooltip>
                        <Tooltip title={assetLibraryPath ? '更换资产库目录' : '设置资产库目录'}>
                            <Button
                                type="text"
                                size="small"
                                icon={<FolderOpenOutlined className={`!text-[14px] ${assetLibraryPath ? 'text-3 hover:text-[color:var(--warning)]' : 'text-danger animate-pulse'}`} />}
                                onClick={handleSetAssetLibrary}
                                className="w-7 h-7 p-0 min-w-0 flex items-center justify-center rounded-lg"
                            />
                        </Tooltip>
                    </div>
                </div>

                {/* 治理提醒（合并条：版本链未收敛 / 命名不规范 → 体检） */}
                {(governanceReport.unconvergedCars.length > 0 || namingCompliance.nonCompliant.length > 0) && (
                    <div className="mb-2 px-1">
                        <div
                            className="text-[12px] text-[color:var(--warning-text)] surface-inset border border-[color:var(--warning)] rounded-lg px-2.5 py-1.5 flex items-center gap-2 cursor-pointer hover:opacity-90"
                            onClick={() => setGovernanceOpen(true)}
                        >
                            <AuditOutlined className="text-[13px] flex-shrink-0" />
                            <span>
                                治理：
                                {governanceReport.unconvergedCars.length > 0 && <><b>{governanceReport.unconvergedCars.length}</b> 辆车版本链未收敛</>}
                                {governanceReport.unconvergedCars.length > 0 && namingCompliance.nonCompliant.length > 0 && ' · '}
                                {namingCompliance.nonCompliant.length > 0 && <><b>{namingCompliance.nonCompliant.length}</b> 个命名不规范</>}
                                {' '}→ 点击体检
                            </span>
                        </div>
                    </div>
                )}

                {/* 视图切换 + 关键车型筛选 + 搜索（合并一行，压缩筛选区高度） */}
                {assets.length > 0 && (
                    <div className="mb-2 px-1 flex items-center gap-2">
                        <Segmented
                            size="small"
                            value={viewMode}
                            onChange={v => persistViewMode(v as 'grouped' | 'mfr' | 'family' | 'flat')}
                            options={[
                                { label: '车型', value: 'grouped' },
                                { label: '主机厂', value: 'mfr' },
                                { label: '族群', value: 'family' },
                                { label: '平铺', value: 'flat' },
                            ]}
                        />
                        <Tag
                            icon={<KeyOutlined className="text-[12px]" />}
                            onClick={() => setKeyVehicleOnly(v => !v)}
                            className={`text-[12px] m-0 px-2 py-0.5 leading-[20px] rounded-lg border cursor-pointer flex-shrink-0 ${
                                keyVehicleOnly
                                    ? 'tag-checked font-medium'
                                    : 'surface-inset border-default text-2 hover:border-brand'
                            }`}
                        >
                            只看关键车型
                        </Tag>
                        <Tag
                            icon={<StopOutlined className="text-[12px]" />}
                            onClick={() => setShowDeprecated(v => !v)}
                            className={`text-[12px] m-0 px-2 py-0.5 leading-[20px] rounded-lg border cursor-pointer flex-shrink-0 ${
                                showDeprecated
                                    ? 'tag-checked font-medium'
                                    : 'surface-inset border-default text-2 hover:border-brand'
                            }`}
                        >
                            显示废弃
                        </Tag>
                        <Tag
                            icon={<CheckSquareOutlined className="text-[12px]" />}
                            onClick={() => setSelectedOnly(v => !v)}
                            title="把列表过滤为已激活到工作集的资产"
                            className={`text-[12px] m-0 px-2 py-0.5 leading-[20px] rounded-lg border cursor-pointer flex-shrink-0 ${
                                selectedOnly
                                    ? 'tag-checked font-medium'
                                    : 'surface-inset border-default text-2 hover:border-brand'
                            }`}
                        >
                            只看已选
                        </Tag>
                        <Input
                            size="small"
                            placeholder="搜索资产、标签..."
                            prefix={<SearchOutlined className="text-3" />}
                            allowClear
                            value={searchKeyword}
                            onChange={e => setSearchKeyword(e.target.value)}
                            className="flex-1 min-w-[140px] rounded-lg border-default"
                        />
                    </div>
                )}
                </div>

                {/* 统一筛选块：受控属性 + 公告号粘贴 + 自由标签（默认收起，内容优先） */}
                {assets.length > 0 && (
                    <AssetFilterPanel
                        items={facetItems}
                        selection={facetSelection}
                        onChangeSelection={setFacetSelection}
                        vocab={facetVocab}
                        announceInput={announceNoInput}
                        onChangeAnnounceInput={setAnnounceNoInput}
                        announceMatch={announceNoMatchResult}
                        matchedCount={filteredAssets.length}
                        tagGroups={tagGroupRows as FilterTagGroupRow[]}
                        selectedGroupTags={selectedGroupTag}
                        selectedOtherTags={selectedOtherFilterTags}
                        onToggleGroupTag={(id, tag) => setSelectedGroupTag(prev => ({ ...prev, [id]: prev[id] === tag ? null : tag }))}
                        onToggleOtherTag={toggleFilterTag}
                        onClearAll={handleClearAllFilters}
                    />
                )}

                {/* 全局一键激活按钮 — 不依赖特定筛选条件 */}
                {(() => {
                    const toActivate = filteredAssets.filter(a => !selectedProductNames.includes(buildVehicleInstanceKey('asset', a.fileName, a.productName)));
                    if (toActivate.length === 0 || filteredAssets.length === 0) return null;
                    return (
                        <div className="flex items-center gap-2 mb-2">
                            <span
                                className="text-[12px] text-brand cursor-pointer hover:underline font-medium"
                                onClick={() => {
                                    toActivate.forEach(a => addActiveAsset(a.fileName, a.productName));
                                    message.success(`已将 ${toActivate.length} 个资产新增到待分析工作区`);
                                }}
                            >
                                <ThunderboltOutlined /> 将筛选结果新增到工作区 ({toActivate.length})
                            </span>
                        </div>
                    );
                })()}

                {/* 批量打标签操作栏（批量模式下常驻列表顶部，落位入场解释它从哪来） */}
                {batchMode && (
                    <div className="vp-slide-down">
                        <AssetBatchTagBar
                            selectedCount={selectedFileNames.size}
                            filteredCount={filteredAssets.length}
                            allSelected={batchSelectionStats.allSelected}
                            indeterminate={batchSelectionStats.indeterminate}
                            onSelectAll={handleBatchSelectAll}
                            onClearSelection={() => setSelectedFileNames(new Set())}
                            onExit={exitBatchMode}
                            groups={tagGroupRows}
                            onApplyTags={handleBatchAddTags}
                        />
                    </div>
                )}

                {viewMode === 'mfr' || viewMode === 'family' ? (
                    <AssetFacetSections
                        sections={facetSections}
                        {...groupedViewProps}
                    />
                ) : viewMode === 'grouped' ? (
                    <AssetGroupedView
                        groups={visibleGroups}
                        {...groupedViewProps}
                    />
                ) : (
                <div className="space-y-2">
                    {filteredAssets.map(info => {
                        const isFocused = focusedFile === info.fileName;
                        const isEditing = false;
                        // 智能感知：如果该资产下的车型已在工作集中，则视为激活
                        const isActive = selectedProductNames.includes(buildVehicleInstanceKey('asset', info.fileName, info.productName));
                        const sourceMeta = getAssetSourceMeta(assetTags[info.fileName] || []);
                        const isBatchChecked = batchMode && selectedFileNames.has(info.fileName);

                        return (
                            <div
                                key={info.fileName}
                                data-asset-file={info.fileName}
                                onClick={() => onFocusFile(info.fileName)}
                                onDoubleClick={() => openAssetInspector(info)}
                                onPointerDown={e => { longPressTargetRef.current = info.fileName; cardLongPress.onPointerDown(e); }}
                                onPointerMove={cardLongPress.onPointerMove}
                                onPointerUp={cardLongPress.onPointerUp}
                                onPointerLeave={cardLongPress.onPointerLeave}
                                onPointerCancel={cardLongPress.onPointerCancel}
                                onClickCapture={cardLongPress.onClickCapture}
                                onContextMenu={onContextMenu(buildAssetContextMenu(info))}
                                className={`@container flex flex-col justify-center py-2.5 px-3.5 rounded-lg border group relative ${
                                    isEditing
                                        ? 'border-brand surface-container'
                                        : isBatchChecked
                                            ? 'surface-container border-brand bg-brand-weak'
                                            : isFocused
                                                // 已选（active）与焦点正交：聚焦不丢已选左色条（设计文档 §3.5）
                                                ? `surface-container border-brand ring-1 ring-brand ${isActive ? 'edge-success' : ''}`
                                                : isActive
                                                    ? 'surface-container border-default edge-success'
                                                    : 'surface-container border-default hover:border-line-strong'
                                }`}
                            >
                                {(
                                    <>
                                        <div className="flex items-center min-w-0">
                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                {batchMode && (
                                                    <Checkbox
                                                        checked={selectedFileNames.has(info.fileName)}
                                                        onChange={e => toggleBatchSelected(info.fileName, e.target.checked)}
                                                        onClick={e => e.stopPropagation()}
                                                        className="flex-shrink-0"
                                                    />
                                                )}
                                                <Tooltip title={isActive ? "点击快速停用该资产" : "点击快速激活该资产"}>
                                                    <div
                                                        onClick={(e) => { e.stopPropagation(); actions.toggleActive(info, isActive); }}
                                                        className={`relative w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                            isFocused ? 'surface-brand text-white' : 'surface-inset text-3'
                                                        }`}
                                                    >
                                                        <DatabaseOutlined className="text-[15px]" />
                                                        {isActive && (
                                                            <span className="dot-ring absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full surface-success" />
                                                        )}
                                                    </div>
                                                </Tooltip>
                                                <div className="min-w-0 flex items-center gap-2">
                                                    {latestSet.has(info.fileName) && (
                                                        <Tag className="m-0 text-[12px] leading-[16px] px-1.5 rounded flex-shrink-0 text-brand border-brand font-medium">最新版</Tag>
                                                    )}
                                                    {info.approvalStatus === '驳回' && (
                                                        <Tooltip title="准入审批状态为「驳回」（自动识别）">
                                                            <Tag icon={<CloseCircleOutlined className="text-[11px]" />} className="m-0 text-[12px] leading-[16px] px-1.5 rounded cursor-help flex-shrink-0 text-warning-text border-warning">驳回</Tag>
                                                        </Tooltip>
                                                    )}
                                                    {assetMeta[info.fileName]?.status === 'superseded' && (
                                                        <Tag icon={<HistoryOutlined className="text-[11px]" />} className="m-0 text-[12px] leading-[16px] px-1.5 rounded flex-shrink-0 text-2 border-default">历史版本</Tag>
                                                    )}
                                                    {assetMeta[info.fileName]?.status === 'deprecated' && (
                                                        <Tag icon={<StopOutlined className="text-[11px]" />} className="m-0 text-[12px] leading-[16px] px-1.5 rounded flex-shrink-0 text-2 border-default">废弃</Tag>
                                                    )}
                                                    {sourceMeta && (
                                                        <Tag className={`src-${sourceMeta.tone} m-0 text-[12px] leading-[18px] px-2.5 rounded-lg border-0`}>
                                                            {React.createElement(sourceMeta.icon, { className: 'text-[11px]' })} {sourceMeta.label}
                                                        </Tag>
                                                    )}
                                                    <Tooltip title={getAssetDisplayName(info.fileName, info.productName)}>
                                                        <span className={`text-sm truncate text-1 ${isFocused ? 'font-semibold' : 'font-medium'}`}>
                                                            {getAssetDisplayName(info.fileName, info.productName)}
                                                        </span>
                                                    </Tooltip>
                                                    {(() => {
                                                        const effNos = effectiveAnnounceNos.get(info.fileName) || [];
                                                        const v = validateAssetName(info.fileName, effNos);
                                                        const allMsgs = [...v.errors, ...v.suggestions.map(s => `建议：${s}`)];
                                                        if (!v.valid) {
                                                            return (
                                                                <Tooltip
                                                                    title={allMsgs.map((m, i) => <div key={i}>• {m}</div>)}
                                                                    overlayStyle={{ maxWidth: 360 }}
                                                                >
                                                                    <Tag icon={<ExclamationCircleOutlined className="text-[11px]" />} className="m-0 text-[12px] leading-[16px] px-1.5 rounded cursor-help flex-shrink-0 text-warning-text border-warning">
                                                                        命名不规范
                                                                    </Tag>
                                                                </Tooltip>
                                                            );
                                                        }
                                                        if (v.suggestions.length > 0) {
                                                            return (
                                                                <Tooltip
                                                                    title={v.suggestions.map((s, i) => <div key={i}>{s}</div>)}
                                                                    overlayStyle={{ maxWidth: 360 }}
                                                                >
                                                                    <Tag className="m-0 text-[12px] leading-[16px] px-1.5 rounded cursor-help flex-shrink-0 text-3">
                                                                        命名建议
                                                                    </Tag>
                                                                </Tooltip>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                    {(() => {
                                                        const effNos = effectiveAnnounceNos.get(info.fileName) || [];
                                                        const v = validateAssetName(info.fileName, effNos);
                                                        if (v.valid || effNos.length === 0) return null;
                                                        const fixName = fixAssetName(info.fileName, effNos[0]);
                                                        return (
                                                            <Tooltip title={`修复为：${fixName}`}>
                                                                <Button
                                                                    type="text"
                                                                    size="small"
                                                                    icon={<CheckOutlined className="!text-[12px] text-warning-text hover:text-success" />}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        void actions.renameTo(info, fixName.replace(/\.json$/i, ''), (r) => `已修复：${r.fileName}`);
                                                                    }}
                                                                    className="w-5 h-5 p-0 min-w-0 flex items-center justify-center rounded flex-shrink-0"
                                                                />
                                                            </Tooltip>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                            <AssetStatsBadge totalParams={info.totalParams} filledParams={info.filledParams} />
                                            {/* hover 快捷操作：只留激活/移出一个（设计文档 §3.4），其余进资产检查器 */}
                                            <div className="hidden @[600px]:flex items-center gap-1.5 opacity-0 group-hover:opacity-100 ml-2">
                                                {!isActive ? (
                                                    <Tooltip title="添加至车型列">
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<PlusSquareOutlined className="!text-[14px] text-2 hover:text-brand" />}
                                                            onClick={(e) => { e.stopPropagation(); actions.toggleActive(info, false); }}
                                                            className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md active:scale-95 transition-transform"
                                                        />
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip title="移出车型列">
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<MinusSquareOutlined className="!text-[14px] text-2 hover:text-danger" />}
                                                            onClick={(e) => { e.stopPropagation(); actions.toggleActive(info, true); }}
                                                            className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md active:scale-95 transition-transform"
                                                        />
                                                    </Tooltip>
                                                )}
                                            </div>
                                        </div>
                                        {/* 标签行：只读 chips（编辑统一进资产检查器/摘要卡，设计文档 §3.4） */}
                                        <div className={`${batchMode ? 'pl-[78px]' : 'pl-[46px]'} mt-1.5 flex items-center gap-1.5 flex-wrap`}>
                                            {(assetTags[info.fileName] || []).map(tag => (
                                                <Tag
                                                    key={tag}
                                                    className="text-[12px] m-0 px-2.5 py-0.5 leading-[20px] rounded-lg surface-inset border-default text-2"
                                                >
                                                    {tag}
                                                </Tag>
                                            ))}
                                            {info.updatedAt && (
                                                <span className="text-[12px] text-3 flex items-center gap-1 ml-auto tabular-nums">
                                                    <EditOutlined className="text-[12px] opacity-0 group-hover:opacity-100 transition-opacity"/> {formatDate(info.updatedAt)}
                                                </span>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
                )}
                {!loading && filteredAssets.length === 0 && (
                    <div className="text-[13px] text-3 text-center py-4 border border-dashed border-default rounded-lg">
                        {searchKeyword.trim() ? '没有匹配的资产' : '资产库空空如也'}
                    </div>
                )}
            </div>

            {/* 资产重命名弹窗已移入 useAssetActions（PoolPane 渲染） */}

            {/* 车型组重命名：只写分组显示名，文件名与车型解耦、永不因此改动 */}
            <Modal
                title="重命名车型"
                open={groupRename.open}
                onOk={handleGroupRenameConfirm}
                onCancel={() => setGroupRename({ open: false, groupKey: null, name: '' })}
                okText="保存显示名"
                cancelText="取消"
                destroyOnClose
                width={560}
            >
                <div className="py-2">
                    <div className="text-[13px] text-2 mb-1.5">分组显示名</div>
                    <Input
                        value={groupRename.name}
                        onChange={e => setGroupRename(s => ({ ...s, name: e.target.value }))}
                        onPressEnter={handleGroupRenameConfirm}
                        placeholder="如：白犀牛 R3"
                        autoFocus
                    />
                    {groupRenameTarget && sanitizedGroupName === pickGroupAlias(groupRenameTarget.files, groupRenameTarget.groupKey) && (
                        <div className="text-[12px] text-3 mt-1.5">显示名未变化</div>
                    )}
                    {mergeTargetGroup && (
                        <div className="text-[12px] text-warning-text mt-1.5">
                            已有车型组「{pickGroupAlias(mergeTargetGroup.files, mergeTargetGroup.groupKey)}」使用同名——保存后两组将自动合并
                            （共 {groupRenameTarget ? groupRenameTarget.files.length + mergeTargetGroup.files.length : mergeTargetGroup.files.length} 个文件）。
                        </div>
                    )}
                </div>
            </Modal>

            <GroupFacetEditor
                open={groupFacetEditor.open}
                groupName={groupFacetEditor.groupName}
                groupKey={groupFacetEditor.groupKey || ''}
                value={(groupFacetEditor.groupKey && facetValues.groupLevel[groupFacetEditor.groupKey]) || {}}
                vocab={facetVocab}
                onConfirm={handleGroupFacetSave}
                onCancel={() => setGroupFacetEditor(prev => ({ ...prev, open: false }))}
            />
            <GovernanceReportModal
                open={governanceOpen}
                onClose={() => setGovernanceOpen(false)}
                report={governanceReport}
                onConvergeCars={handleConvergeCars}
                facetIssues={facetIssues}
                onOpenBatchEditor={() => { setGovernanceOpen(false); setBatchEditorOpen(true); }}
            />
            <AssetBatchFacetEditor
                open={batchEditorOpen}
                rows={batchEditorRows}
                vocab={facetVocab}
                onClose={() => setBatchEditorOpen(false)}
                onSaveOverrides={handleSaveFacetOverrides}
            />
            {ContextMenuPortal}
        </div>
    );
};

export default DataSourcePanel;
