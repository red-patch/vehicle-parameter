import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import AssetSidebar from './AssetSidebar';
import AssetFilterBar from './AssetFilterBar';
import AssetCart from './AssetCart';
import AssetCard from './AssetCard';
import AssetInspector from '../AssetInspector';
import { useAssetActions } from '../useAssetActions';
import { useContextMenu } from '../../../hooks/useContextMenu';
import { useVehicleStore } from '../../../store/vehicleStore';
import { useAssetLibrarySnapshot } from '../../../hooks/useAssetLibrarySnapshot';
import { buildVehicleInstanceKey } from '../../../utils/vehicleInstance';
import { matchFacets, type FacetSelection, EMPTY_FACET_SELECTION } from '../../../utils/facetFilters';
import { validateAssetName } from '../../../utils/assetNaming';
import { KEY_VEHICLE_TAG } from '../../../utils/assetGovernance';
import { isFieldRequired } from '../../../assets/requiredFields';
import { getProductData } from '../../../store/vehicleSelectors';
import { resolveAssetFacets, loadFacetVocab, loadFacetValues, DEFAULT_FACET_VOCAB, EMPTY_FACET_VALUES, type FacetVocab, type FacetValues, type ResolvedFacets } from '../../../utils/assetFacets';
import type { AssetFileInfo } from '../../../utils/assetManager';

/**
 * 资产池三栏布局（设计文档 2026-10-13-asset-panel-redesign-v2 §3.1）：
 * - 左栏（240px）：快速导航 + 治理视角 + 工具
 * - 中间主区（弹性）：筛选条 + 车型卡片列表
 * - 右栏（300px）：购物车（已选工作集）
 *
 * M2：筛选与列表 — 接入搜索/facet/治理视角筛选，渲染车型卡片列表。
 */
const AssetPoolLayout: React.FC = () => {
    const {
        assetLibraryPath,
        addActiveAsset,
        removeActiveAsset,
        activeAssets,
        assetFiles,
        uploadedFiles,
    } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        addActiveAsset: state.addActiveAsset,
        removeActiveAsset: state.removeActiveAsset,
        activeAssets: state.activeAssets,
        assetFiles: state.assetFiles,
        uploadedFiles: state.uploadedFiles,
    })));
    const snapshot = useAssetLibrarySnapshot();

    // ===== 筛选状态 =====
    const [searchKeyword, setSearchKeyword] = useState('');
    const [facetSelection, setFacetSelection] = useState<FacetSelection>(EMPTY_FACET_SELECTION);
    const [governanceView, setGovernanceView] = useState<string | null>(null);

    // ===== 选中态 =====
    const [focusedFile, setFocusedFile] = useState<string | null>(null);
    const [locateRequest, setLocateRequest] = useState<{ fileName: string; nonce: number } | null>(null);

    // ===== 资产检查器 =====
    const [inspectorTarget, setInspectorTarget] = useState<string | null>(null);
    const actions = useAssetActions({ focusedFile, onFocusFile: setFocusedFile });
    const { onContextMenu, ContextMenuPortal } = useContextMenu();

    // ===== Facet 词表与取值（用于 fileFacets 计算） =====
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

    // ===== 逐资产受控属性解析（fileFacets） =====
    const fileFacets = useMemo(() => {
        const map = new Map<string, ResolvedFacets>();
        snapshot.infos.forEach(info => {
            map.set(info.fileName, resolveAssetFacets({
                fileName: info.fileName,
                groupKey: '', // TODO M2: 接入 resolveVehicleGroupKey
                info,
                tags: snapshot.tags[info.fileName],
                values: facetValues,
                vocab: facetVocab,
            }));
        });
        return map;
    }, [snapshot, facetVocab, facetValues]);

    const handleClearFilters = useCallback(() => {
        setSearchKeyword('');
        setFacetSelection(EMPTY_FACET_SELECTION);
        setGovernanceView(null);
    }, []);

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
                    // TODO: 接入 governanceReport.unconvergedCars
                    return false;
                case 'incomplete': {
                    // TODO: 接入 fileFacets
                    return false;
                }
                case 'superseded':
                    return metaStatus === 'superseded';
                case 'deprecated':
                    return metaStatus === 'deprecated';
                default:
                    return true;
            }
        });
    }, [snapshot, governanceView]);

    // ===== 综合筛选（搜索 + facet + 治理视角） =====
    const filteredInfos = useMemo(() => {
        let result = governanceFilteredInfos;

        // facet 筛选
        const hasFacetSelection = Object.values(facetSelection).some(v =>
            Array.isArray(v) ? v.length > 0 : Boolean(v)
        );
        if (hasFacetSelection) {
            result = result.filter(info => {
                const facets = fileFacets.get(info.fileName);
                return facets ? matchFacets(facets, facetSelection) : true;
            });
        }

        // 搜索
        if (searchKeyword.trim()) {
            const kw = searchKeyword.trim().toLowerCase();
            result = result.filter(info => {
                const tags = snapshot.tags[info.fileName] || [];
                return (
                    info.fileName.toLowerCase().includes(kw) ||
                    info.productName.toLowerCase().includes(kw) ||
                    tags.some(t => t.toLowerCase().includes(kw)) ||
                    (info.announceNos || []).some(n => n.toLowerCase().includes(kw)) ||
                    (info.manufacturerRaw || '').toLowerCase().includes(kw)
                );
            });
        }

        return result;
    }, [governanceFilteredInfos, facetSelection, searchKeyword, fileFacets, snapshot.tags]);

    // ===== 已激活文件名集合 =====
    const activeFileNames = useMemo(() => new Set(activeAssets), [activeAssets]);

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

    // ===== 将筛选结果加入工作区 =====
    const handleAddFilteredToWorkspace = useCallback(() => {
        const toAdd = filteredInfos.filter(info => !activeFileNames.has(info.fileName));
        toAdd.forEach(info => addActiveAsset(info.fileName, info.productName));
    }, [filteredInfos, activeFileNames, addActiveAsset]);

    // ===== 购物车反向定位 =====
    const listRef = React.useRef<HTMLDivElement>(null);
    const locateRanRef = React.useRef(0);

    React.useEffect(() => {
        if (!locateRequest || locateRanRef.current === locateRequest.nonce) return;
        locateRanRef.current = locateRequest.nonce;
        const { fileName } = locateRequest;
        window.setTimeout(() => {
            const el = listRef.current?.querySelector(`[data-asset-file="${CSS.escape(fileName)}"]`);
            if (el) {
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                el.classList.add('vp-locate-flash');
                window.setTimeout(() => el.classList.remove('vp-locate-flash'), 1800);
            }
        }, 0);
    }, [locateRequest]);

    const handleLocateAsset = useCallback((fileName: string) => {
        setLocateRequest(prev => ({ fileName, nonce: (prev?.nonce ?? 0) + 1 }));
    }, []);

    // ===== 去对比（由 ParameterWorkbench 注入） =====
    const handleGoCompare = useCallback(() => {
        // TODO: 需要 ParameterWorkbench 提供 onGoCompare 回调
        console.log('去对比', activeFileNames);
    }, [activeFileNames]);

    // ===== 打开资产检查器 =====
    const handleOpenInspector = useCallback((info: AssetFileInfo) => {
        setInspectorTarget(buildVehicleInstanceKey('asset', info.fileName, info.productName));
    }, []);

    // ===== 检查器去对比 =====
    const setCompareProducts = useVehicleStore(useShallow(state => state.setCompareProducts));
    const handleInspectorGoCompare = useCallback((instanceKey: string) => {
        setCompareProducts([instanceKey]);
        // TODO: 跳转对比 tab（需要 ParameterWorkbench 提供回调）
    }, [setCompareProducts]);

    // ===== 右键菜单 =====
    const buildAssetContextMenu = useCallback((info: AssetFileInfo) => {
        const isActive = activeFileNames.has(info.fileName);
        return [
            {
                key: 'active',
                label: isActive ? '移出工作集' : '激活进工作集',
                onClick: () => handleToggleActive(info),
            },
            { key: 'copy-announce', label: '复制公告号', onClick: () => actions.copyAnnounceNo(info) },
            { key: 'finder', label: '在 Finder 中显示', onClick: () => void actions.revealInFinder(info) },
            { key: 'rename', label: '重命名', onClick: () => actions.startRename(info) },
            { key: 'batch', label: '批量选择', onClick: () => { /* TODO: 批量模式 */ } },
            { key: 'divider1', divider: true, onClick: () => {} },
            {
                key: 'inspector',
                label: '打开检查器…',
                onClick: () => handleOpenInspector(info),
            },
        ];
    }, [activeFileNames, handleToggleActive, actions, handleOpenInspector]);

    return (
        <div className="flex h-full gap-3">
            {/* 左栏：240px 固定 */}
            <div className="w-[240px] flex-shrink-0 surface-container border border-default rounded-xl overflow-hidden">
                <AssetSidebar
                    governanceView={governanceView}
                    onGovernanceViewChange={setGovernanceView}
                />
            </div>

            {/* 中间主区：弹性 */}
            <div className="flex-1 min-w-0 flex flex-col surface-container border border-default rounded-xl overflow-hidden">
                <AssetFilterBar
                    searchKeyword={searchKeyword}
                    onSearchKeywordChange={setSearchKeyword}
                    facetSelection={facetSelection}
                    onFacetSelectionChange={setFacetSelection}
                    onClearAll={handleClearFilters}
                />

                {/* 列表头 */}
                <div className="flex-none px-5 py-3 border-b border-[var(--border)] flex items-center justify-between text-[13px] text-2">
                    <span>
                        共 <span className="font-semibold text-1">{filteredInfos.length}</span> 个资产
                        {activeFileNames.size > 0 && (
                            <> · 已选 <span className="font-semibold text-1">{activeFileNames.size}</span></>
                        )}
                    </span>
                    {filteredInfos.length > 0 && filteredInfos.some(info => !activeFileNames.has(info.fileName)) && (
                        <span
                            className="text-[var(--brand)] cursor-pointer font-semibold hover:underline"
                            onClick={handleAddFilteredToWorkspace}
                        >
                            将筛选结果加入工作区 →
                        </span>
                    )}
                </div>

                {/* 车型卡片列表 */}
                <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar p-4">
                    {filteredInfos.length > 0 ? (
                        filteredInfos.map(info => (
                            <div key={info.fileName} data-asset-file={info.fileName}>
                                <AssetCard
                                    info={info}
                                    tags={snapshot.tags[info.fileName] || []}
                                    metaStatus={snapshot.meta[info.fileName]?.status}
                                    isLatest={snapshot.latestSet.has(info.fileName)}
                                    isActive={activeFileNames.has(info.fileName)}
                                    isFocused={focusedFile === info.fileName}
                                    requiredMissingCount={getRequiredMissingCount(info)}
                                    onFocus={() => setFocusedFile(info.fileName)}
                                    onToggleActive={() => handleToggleActive(info)}
                                    onOpenInspector={() => handleOpenInspector(info)}
                                    onContextMenu={onContextMenu(buildAssetContextMenu(info))}
                                />
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-3 py-12">
                            {searchKeyword || governanceView ? '没有匹配的资产' : '资产库空空如也'}
                        </div>
                    )}
                </div>
            </div>

            {/* 右栏购物车：300px 固定 */}
            <div className="w-[300px] flex-shrink-0 surface-container border border-default rounded-xl overflow-hidden">
                <AssetCart
                    focusedFile={focusedFile}
                    onFocusFile={setFocusedFile}
                    onLocateAsset={handleLocateAsset}
                    onGoCompare={handleGoCompare}
                />
            </div>

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
            {ContextMenuPortal}
        </div>
    );
};

export default AssetPoolLayout;
