import React, { useCallback, useMemo, useState } from 'react';
import { Tabs, Skeleton } from 'antd';
import { DatabaseOutlined, DiffOutlined, FormOutlined, AppstoreOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import DataSourcePanel from './DataSourcePanel';
import VehicleListPanel from './VehicleListPanel';
import AssetDataSynchronizer from './AssetDataSynchronizer';
import type { RepairSourceModule } from '../../types';

const CompareView = React.lazy(() => import('./CompareView'));
const SmartFillView = React.lazy(() => import('./SmartFillView'));
const MultiVehicleView = React.lazy(() => import('./MultiVehicleView'));
const DataPurifyView = React.lazy(() => import('../DataPurify/DataPurifyView'));

type WorkbenchTabKey = 'pool' | 'compare' | 'fill' | 'multi' | 'purify';

const repairModuleTabMap: Record<RepairSourceModule, string> = {
    compare: 'compare',
    smart_fill: 'fill',
    multi_vehicle: 'multi',
};

interface ParameterWorkbenchProps {
    activeTab?: WorkbenchTabKey;
    onTabChange?: (key: WorkbenchTabKey) => void;
    showTabs?: boolean;
}

const ParameterWorkbench: React.FC<ParameterWorkbenchProps> = ({
    activeTab: controlledActiveTab,
    onTabChange,
    showTabs = true,
}) => {
    const [innerActiveTab, setInnerActiveTab] = useState<WorkbenchTabKey>('pool');
    const [focusedFile, setFocusedFile] = useState<string | null>(null);
    const [focusedProduct, setFocusedProduct] = useState<string | null>(null);

    const handleFocusFile = (fileName: string | null) => {
        setFocusedFile(fileName);
        setFocusedProduct(null);
    };

    const activeTab = controlledActiveTab ?? innerActiveTab;
    const setActiveTab = (next: WorkbenchTabKey) => {
        onTabChange?.(next);
        if (controlledActiveTab === undefined) {
            setInnerActiveTab(next);
        }
    };

    const handleGoRepair = useCallback(() => setActiveTab('purify'), [setActiveTab]);
    const handleReturnToModule = useCallback(
        (sourceModule: RepairSourceModule) => {
            setActiveTab(repairModuleTabMap[sourceModule] as WorkbenchTabKey);
        },
        [setActiveTab],
    );

    const items: { key: WorkbenchTabKey; label: React.ReactNode; children: React.ReactNode }[] = useMemo(() => [
        {
            key: 'pool',
            label: <span className="flex items-center gap-1.5"><DatabaseOutlined /> 资产管理</span>,
            children: (
                <div className="flex gap-3 h-full">
                    <div className="flex-1 min-w-0 bg-slate-200/50 border border-slate-200/60 rounded-2xl shadow-sm backdrop-blur-sm">
                        <DataSourcePanel
                            focusedFile={focusedFile}
                            onFocusFile={handleFocusFile}
                        />
                    </div>
                    <div className="flex-1 min-w-0 bg-white border border-slate-200/60 rounded-2xl shadow-sm">
                        <VehicleListPanel
                            focusedProduct={focusedProduct}
                            onFocusProduct={setFocusedProduct}
                            onGoCompare={() => setActiveTab('compare')}
                        />
                    </div>
                </div>
            )
        },
        {
            key: 'compare',
            label: <span className="flex items-center gap-1.5"><DiffOutlined /> 版本对比</span>,
            children: (
                <React.Suspense fallback={<Skeleton active />}>
                    <CompareView onGoRepair={handleGoRepair} />
                </React.Suspense>
            )
        },
        {
            key: 'fill',
            label: <span className="flex items-center gap-1.5"><FormOutlined /> 智能填报</span>,
            children: (
                <React.Suspense fallback={<Skeleton active />}>
                    <SmartFillView onGoRepair={handleGoRepair} />
                </React.Suspense>
            )
        },
        {
            key: 'multi',
            label: <span className="flex items-center gap-1.5"><AppstoreOutlined /> 多车型管理</span>,
            children: (
                <React.Suspense fallback={<Skeleton active />}>
                    <MultiVehicleView onGoRepair={handleGoRepair} />
                </React.Suspense>
            )
        },
        {
            key: 'purify',
            label: <span className="flex items-center gap-1.5"><SafetyCertificateOutlined /> 数据体检与修复</span>,
            children: (
                <React.Suspense fallback={<Skeleton active />}>
                    <DataPurifyView onReturnToSource={handleReturnToModule} />
                </React.Suspense>
            )
        }
    ], [handleGoRepair, handleReturnToModule, focusedFile, activeTab]);

    return (
        <div className="h-full bg-slate-50/50 p-4">
            <AssetDataSynchronizer />
            {showTabs ? (
                <>
                    <div className="mb-3">
                        <h1 className="text-[28px] font-extrabold text-slate-900 m-0 tracking-tight">参数工作台</h1>
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
                // 子模块嵌入模式：父级菜单控制切换，这里只负责 content 保活
                items.map(item => (
                    <div key={item.key} className="h-full" style={{ display: item.key === activeTab ? undefined : 'none' }}>
                        {item.children}
                    </div>
                ))
            )}
        </div>
    );
};

export default ParameterWorkbench;
