import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Tabs, Skeleton } from 'antd';
import { DatabaseOutlined, DiffOutlined, FormOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import DataSourcePanel from './DataSourcePanel';
import VehicleListPanel from './VehicleListPanel';
import AssetSummaryCard from './AssetSummaryCard';
import AssetInspector from './AssetInspector';
import { useAssetActions } from './useAssetActions';
import AssetDataSynchronizer from './AssetDataSynchronizer';
import { useAssetLibrarySnapshot } from '../../hooks/useAssetLibrarySnapshot';
import { useViewportPaneHeight } from '../../hooks/useViewportPaneHeight';
import { useVehicleStore } from '../../store/vehicleStore';
import type { RepairSourceModule } from '../../types';

const CompareView = React.lazy(() => import('./CompareView'));
const SmartFillView = React.lazy(() => import('./SmartFillView'));
const DataPurifyView = React.lazy(() => import('../DataPurify/DataPurifyView'));

type WorkbenchTabKey = 'pool' | 'compare' | 'fill' | 'purify';

const repairModuleTabMap: Record<RepairSourceModule, string> = {
    compare: 'compare',
    smart_fill: 'fill',
    multi_vehicle: 'fill',
};

interface ParameterWorkbenchProps {
    activeTab?: WorkbenchTabKey;
    onTabChange?: (key: WorkbenchTabKey) => void;
    showTabs?: boolean;
}

/**
 * 四个视图 pane 各自 memo 化：items 因焦点状态（focusedFile）重建时，
 * 未受影响的重组件（CompareView/SmartFillView/DataPurifyView）不再被连带重渲染。
 */
interface PoolPaneProps {
    focusedFile: string | null;
    onFocusFile: (fileName: string | null) => void;
    onGoCompare: () => void;
}

/**
 * 资产管理两栏（设计文档 2026-10-01-asset-panel-layout-redesign）：
 * - 视口锁定：面板高度钉在视口内，两栏各自内部滚动，购物车常驻可见；
 * - 右栏双段式：选中资产摘要卡（点选即刷新）+ 待分析车型购物车；
 * - 资产检查器抽屉与对象级动作弹层在此统一挂载（actions.modals）。
 */
const PoolPane: React.FC<PoolPaneProps> = React.memo(({ focusedFile, onFocusFile, onGoCompare }) => {
    const paneRef = useRef<HTMLDivElement>(null);
    const paneHeight = useViewportPaneHeight(paneRef);
    const snapshot = useAssetLibrarySnapshot();
    const actions = useAssetActions({ focusedFile, onFocusFile });
    const setCompareProducts = useVehicleStore(useShallow(state => state.setCompareProducts));

    const [inspectorTarget, setInspectorTarget] = useState<string | null>(null);
    const [locateRequest, setLocateRequest] = useState<{ fileName: string; nonce: number } | null>(null);

    const handleOpenInspector = useCallback((instanceKey: string) => {
        setInspectorTarget(instanceKey);
    }, []);

    // 购物车反向定位：左栏滚动定位 + 摘要卡切换（设计文档 §3.5）
    const handleLocateAsset = useCallback((fileName: string) => {
        setLocateRequest(prev => ({ fileName, nonce: (prev?.nonce ?? 0) + 1 }));
        onFocusFile(fileName);
    }, [onFocusFile]);

    const handleInspectorGoCompare = useCallback((instanceKey: string) => {
        setCompareProducts([instanceKey]);
        onGoCompare();
    }, [setCompareProducts, onGoCompare]);

    return (
        <div ref={paneRef} className="flex gap-3" style={paneHeight ? { height: paneHeight } : undefined}>
            <div className="flex-1 min-w-0 surface-container border border-default rounded-xl overflow-hidden">
                <DataSourcePanel
                    focusedFile={focusedFile}
                    onFocusFile={onFocusFile}
                    onOpenInspector={handleOpenInspector}
                    locateRequest={locateRequest}
                    actions={actions}
                />
            </div>
            <div className="flex-1 min-w-0 surface-container border border-default rounded-xl overflow-hidden flex flex-col">
                {focusedFile && (
                    <AssetSummaryCard
                        fileName={focusedFile}
                        snapshot={snapshot}
                        actions={actions}
                        onOpenInspector={handleOpenInspector}
                    />
                )}
                <div className="flex-1 min-h-0">
                    <VehicleListPanel
                        onLocateAsset={handleLocateAsset}
                        onOpenInspector={handleOpenInspector}
                        onGoCompare={onGoCompare}
                        snapshot={snapshot}
                    />
                </div>
            </div>
            <AssetInspector
                open={Boolean(inspectorTarget)}
                instanceKey={inspectorTarget}
                snapshot={snapshot}
                actions={actions}
                onClose={() => setInspectorTarget(null)}
                onGoCompare={handleInspectorGoCompare}
            />
            {actions.modals}
        </div>
    );
});

const ComparePane: React.FC<{ onGoRepair: () => void }> = React.memo(({ onGoRepair }) => (
    <React.Suspense fallback={<Skeleton active />}>
        <CompareView onGoRepair={onGoRepair} />
    </React.Suspense>
));

const SmartFillPane: React.FC<{ onGoRepair: () => void }> = React.memo(({ onGoRepair }) => (
    <React.Suspense fallback={<Skeleton active />}>
        <SmartFillView onGoRepair={onGoRepair} />
    </React.Suspense>
));

const PurifyPane: React.FC<{ onReturnToSource: (sourceModule: RepairSourceModule) => void }> = React.memo(({ onReturnToSource }) => (
    <React.Suspense fallback={<Skeleton active />}>
        <DataPurifyView onReturnToSource={onReturnToSource} />
    </React.Suspense>
));

const ParameterWorkbench: React.FC<ParameterWorkbenchProps> = ({
    activeTab: controlledActiveTab,
    onTabChange,
    showTabs = true,
}) => {
    const [innerActiveTab, setInnerActiveTab] = useState<WorkbenchTabKey>('pool');
    const [focusedFile, setFocusedFile] = useState<string | null>(null);
    const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['pool'])); // 懒挂载：只渲染激活过的 tab

    const handleFocusFile = useCallback((fileName: string | null) => {
        setFocusedFile(fileName);
    }, []);

    const activeTab = controlledActiveTab ?? innerActiveTab;
    // useCallback 稳定引用：下游 items/pane 的 memo 依赖链才不会每次 render 失效
    const setActiveTab = useCallback((next: WorkbenchTabKey) => {
        onTabChange?.(next);
        if (controlledActiveTab === undefined) {
            setInnerActiveTab(next);
        }
    }, [onTabChange, controlledActiveTab]);

    const handleGoRepair = useCallback(() => setActiveTab('purify'), [setActiveTab]);
    const handleReturnToModule = useCallback(
        (sourceModule: RepairSourceModule) => {
            setActiveTab(repairModuleTabMap[sourceModule] as WorkbenchTabKey);
        },
        [setActiveTab],
    );
    const handleGoCompare = useCallback(() => setActiveTab('compare'), [setActiveTab]);

    const items: { key: WorkbenchTabKey; label: React.ReactNode; children: React.ReactNode }[] = useMemo(() => [
        {
            key: 'pool',
            label: <span className="flex items-center gap-1.5"><DatabaseOutlined /> 资产管理</span>,
            children: (
                <PoolPane
                    focusedFile={focusedFile}
                    onFocusFile={handleFocusFile}
                    onGoCompare={handleGoCompare}
                />
            )
        },
        {
            key: 'compare',
            label: <span className="flex items-center gap-1.5"><DiffOutlined /> 版本对比</span>,
            children: <ComparePane onGoRepair={handleGoRepair} />
        },
        {
            key: 'fill',
            label: <span className="flex items-center gap-1.5"><FormOutlined /> 智能填报</span>,
            children: <SmartFillPane onGoRepair={handleGoRepair} />
        },
        {
            key: 'purify',
            label: <span className="flex items-center gap-1.5"><SafetyCertificateOutlined /> 数据体检与修复</span>,
            children: <PurifyPane onReturnToSource={handleReturnToModule} />
        }
        // 注意：不依赖 activeTab——切换 tab 不应重建任何 pane 的元素树
    ], [handleGoRepair, handleReturnToModule, handleFocusFile, handleGoCompare, focusedFile]);

    // 懒挂载：激活过的 tab 才渲染，之后保活
    React.useEffect(() => {
        setMountedTabs(prev => {
            if (prev.has(activeTab)) return prev;
            return new Set([...prev, activeTab]);
        });
    }, [activeTab]);

    return (
        <div className="h-full surface-layout p-4">
            <AssetDataSynchronizer />
            {showTabs ? (
                <>
                    <div className="mb-3">
                        <h1 className="text-[28px] font-bold text-1 m-0">参数工作台</h1>
                    </div>
                    <Tabs
                        activeKey={activeTab}
                        onChange={(key) => setActiveTab(key as WorkbenchTabKey)}
                        className="parameter-workbench-tabs"
                        destroyInactiveTabPane={false}
                        items={items}
                    />
                </>
            ) : (
                // 子模块嵌入模式：懒挂载，首次激活后保活
                items.map(item => mountedTabs.has(item.key) ? (
                    <div key={item.key} className="h-full vp-fade-in" style={{ display: item.key === activeTab ? undefined : 'none' }}>
                        {item.children}
                    </div>
                ) : null)
            )}
        </div>
    );
};

export default ParameterWorkbench;
