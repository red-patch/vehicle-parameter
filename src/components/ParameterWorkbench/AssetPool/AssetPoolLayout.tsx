import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import AssetSidebar from './AssetSidebar';
import AssetFilterBar from './AssetFilterBar';
import AssetCart from './AssetCart';
import AssetCard from './AssetCard';
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
    }, [governanceFilteredInfos, facetSelection, searchKeyword, snapshot]);

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
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                    {filteredInfos.length > 0 ? (
                        filteredInfos.map(info => (
                            <AssetCard
                                key={info.fileName}
                                info={info}
                                tags={snapshot.tags[info.fileName] || []}
                                metaStatus={snapshot.meta[info.fileName]?.status}
                                isLatest={snapshot.latestSet.has(info.fileName)}
                                isActive={activeFileNames.has(info.fileName)}
                                isFocused={focusedFile === info.fileName}
                                requiredMissingCount={getRequiredMissingCount(info)}
                                onFocus={() => setFocusedFile(info.fileName)}
                                onToggleActive={() => handleToggleActive(info)}
                            />
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
                <AssetCart focusedFile={focusedFile} onFocusFile={setFocusedFile} />
            </div>
        </div>
    );
};

export default AssetPoolLayout;
