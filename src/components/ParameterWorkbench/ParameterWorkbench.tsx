import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Tabs, Skeleton } from 'antd';
import { DatabaseOutlined, DiffOutlined, FormOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import AssetPoolLayout from './AssetPool/AssetPoolLayout';
import { useViewportPaneHeight } from '../../hooks/useViewportPaneHeight';
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
 * 资产管理三栏（设计文档 2026-10-13-asset-panel-redesign-v2）：
 * 左导航（240px）+ 中列表（弹性）+ 右购物车（300px）。
 *
 * 视口锁高（设计 2026-10-01 §3.1，V2 重构时丢失、此处恢复）：
 * 外壳 MainLayout 是 min-h-screen 整页滚动，高度链在 Content 处断开；
 * 这里把面板钉在视口内，让“筛选条/列表头固定、仅列表内部滚动”成立。
 */
const PoolPane: React.FC<{ onGoCompare: () => void }> = React.memo(({ onGoCompare }) => {
    const paneRef = useRef<HTMLDivElement>(null);
    const paneHeight = useViewportPaneHeight(paneRef);
    return (
        <div ref={paneRef} className="h-full" style={paneHeight ? { height: paneHeight } : undefined}>
            <AssetPoolLayout onGoCompare={onGoCompare} />
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
    const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['pool'])); // 懒挂载：只渲染激活过的 tab

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
            label: <span className="flex items-center gap-1.5"><DatabaseOutlined /> 车型资产</span>,
            children: <PoolPane onGoCompare={handleGoCompare} />
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
    ], [handleGoRepair, handleReturnToModule, handleGoCompare]);

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
