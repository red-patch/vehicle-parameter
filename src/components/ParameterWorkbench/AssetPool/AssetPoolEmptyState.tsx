import React from 'react';
import { Button } from 'antd';
import GuideEmpty from '../../common/GuideEmpty';
import { LIBRARY_PATH_MISSING_TEXT, openLibraryPathSettings } from '../../../utils/libraryPathPrompt';
import type { AssetPoolEmptyKind } from './assetPoolEmptyKind';

/**
 * 资产池列表为空时的状态区（仅替换原「资产库空空如也」一行字，不动外层布局）。
 *
 * 四种情况各给一句准确的话 + 下一步：
 * - 未设置资产库目录 → 去设置
 * - 正在加载 → 只提示，不给动作
 * - 有筛选条件但无结果 → 清除筛选（此前只看搜索词/治理视图，facet/标签/状态筛空时误报「资产库空空如也」）
 * - 资产库确实没有车型 → 打开导航，用「导入车型数据」
 */
export interface AssetPoolEmptyStateProps {
    kind: AssetPoolEmptyKind;
    onClearFilters: () => void;
    /** 左侧导航当前是否展开（展开时不再显示「打开导航」按钮） */
    navOpen: boolean;
    onOpenNav: () => void;
}

const AssetPoolEmptyState: React.FC<AssetPoolEmptyStateProps> = ({ kind, onClearFilters, navOpen, onOpenNav }) => {
    switch (kind) {
        case 'noLibrary':
            return (
                <GuideEmpty
                    title={LIBRARY_PATH_MISSING_TEXT}
                    description="设置后，这里会列出目录里的全部车型"
                    action={<Button onClick={openLibraryPathSettings}>设置资产库目录</Button>}
                />
            );
        case 'loading':
            return <GuideEmpty title="正在加载资产库…" />;
        case 'noMatch':
            return (
                <GuideEmpty
                    title="没有匹配的资产"
                    description="换个关键词，或放宽筛选条件"
                    action={<Button onClick={onClearFilters}>清除筛选</Button>}
                />
            );
        case 'emptyLibrary':
        default:
            return (
                <GuideEmpty
                    title="资产库里还没有车型"
                    description="在左侧导航用「导入车型数据」添加 Excel 车型表"
                    action={navOpen ? undefined : <Button onClick={onOpenNav}>打开导航</Button>}
                />
            );
    }
};

export default AssetPoolEmptyState;
