import React, { useState, useCallback } from 'react';
import AssetSidebar from './AssetSidebar';
import AssetFilterBar from './AssetFilterBar';
import AssetCart from './AssetCart';
import type { FacetSelection } from '../../../utils/facetFilters';
import { EMPTY_FACET_SELECTION } from '../../../utils/facetFilters';

/**
 * 资产池三栏布局（设计文档 2026-10-13-asset-panel-redesign-v2 §3.1）：
 * - 左栏（240px）：快速导航 + 治理视角 + 工具
 * - 中间主区（弹性）：筛选条 + 车型卡片列表
 * - 右栏（300px）：购物车（已选工作集）
 *
 * M1 只搭骨架：三栏布局渲染正常，筛选状态与列表逻辑在 M2 接入。
 */
export interface AssetPoolLayoutProps {
    children?: React.ReactNode;
}

const AssetPoolLayout: React.FC<AssetPoolLayoutProps> = ({ children }) => {
    // ===== 筛选状态（M2 接入列表筛选逻辑） =====
    const [searchKeyword, setSearchKeyword] = useState('');
    const [facetSelection, setFacetSelection] = useState<FacetSelection>(EMPTY_FACET_SELECTION);
    const [governanceView, setGovernanceView] = useState<string | null>(null); // 治理视角选中项（keyVehicle/namingIssue/versionIssue/incomplete/superseded/deprecated）

    // ===== 选中态（点卡片选中，M3 接入） =====
    const [focusedFile, setFocusedFile] = useState<string | null>(null);

    const handleClearFilters = useCallback(() => {
        setSearchKeyword('');
        setFacetSelection(EMPTY_FACET_SELECTION);
        setGovernanceView(null);
    }, []);

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
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                    {children || (
                        <div className="text-center text-3 py-12">
                            车型卡片列表（M2 接入）
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
