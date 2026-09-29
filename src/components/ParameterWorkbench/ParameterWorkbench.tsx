import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Tabs, Skeleton } from 'antd';
import { DatabaseOutlined, DiffOutlined, FormOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import DataSourcePanel from './DataSourcePanel';
import VehicleListPanel from './VehicleListPanel';
import AssetDataSynchronizer from './AssetDataSynchronizer';
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
 * 四个视图 pane 各自 memo 化：items 因焦点状态（focusedFile/Product）重建时，
 * 未受影响的重组件（CompareView/SmartFillView/DataPurifyView）不再被连带重渲染。
 */
interface PoolPaneProps {
    focusedFile: string | null;
    focusedProduct: string | null;
    onFocusFile: (fileName: string | null) => void;
    onFocusProduct: React.Dispatch<React.SetStateAction<string | null>>;
    onGoCompare: () => void;
}

const PoolPane: React.FC<PoolPaneProps> = React.memo(({ focusedFile, focusedProduct, onFocusFile, onFocusProduct, onGoCompare }) => (
    <div className="flex gap-3 h-full">
        <div className="flex-1 min-w-0 surface-container border border-default rounded-xl">
            <DataSourcePanel
                focusedFile={focusedFile}
                onFocusFile={onFocusFile}
            />
        </div>
        <div className="flex-1 min-w-0 surface-container border border-default rounded-xl">
            <VehicleListPanel
                focusedProduct={focusedProduct}
                onFocusProduct={onFocusProduct}
                onGoCompare={onGoCompare}
            />
        </div>
    </div>
));

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
    const [focusedProduct, setFocusedProduct] = useState<string | null>(null);
    const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['pool'])); // 懒挂载：只渲染激活过的 tab

    const handleFocusFile = useCallback((fileName: string | null) => {
        setFocusedFile(fileName);
        setFocusedProduct(null);
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
                    focusedProduct={focusedProduct}
                    onFocusFile={handleFocusFile}
                    onFocusProduct={setFocusedProduct}
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
    ], [handleGoRepair, handleReturnToModule, handleFocusFile, handleGoCompare, focusedFile, focusedProduct]);

    // 懒挂载：激活过的 tab 才渲染，之后保活
    useEffect(() => {
        if (!mountedTabs.has(activeTab)) {
            setMountedTabs(prev => new Set([...prev, activeTab]));
        }
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
                    <div key={item.key} className="h-full" style={{ display: item.key === activeTab ? undefined : 'none' }}>
                        {item.children}
                    </div>
                ) : null)
            )}
        </div>
    );
};

export default ParameterWorkbench;
