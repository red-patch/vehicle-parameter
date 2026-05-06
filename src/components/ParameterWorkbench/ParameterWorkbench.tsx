import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Tabs, Skeleton } from 'antd';
import { DatabaseOutlined, DiffOutlined, FormOutlined, AppstoreOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import DataSourcePanel from './DataSourcePanel';
import VehicleListPanel from './VehicleListPanel';
import AssetDataSynchronizer from './AssetDataSynchronizer';
import type { RepairSourceModule } from '../../types';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { clampPoolSidebarWidth } from '../../utils/poolLayout';

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
    const poolContainerRef = useRef<HTMLDivElement>(null);
    const { poolSidebarWidth, setPoolSidebarWidth } = useVehicleStore(useShallow((state) => ({
        poolSidebarWidth: state.poolSidebarWidth,
        setPoolSidebarWidth: state.setPoolSidebarWidth,
    })));
    const [draggingSidebar, setDraggingSidebar] = useState(false);

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

    const handleGoRepair = () => setActiveTab('purify');
    const handleReturnToModule = (sourceModule: RepairSourceModule) => {
        setActiveTab(repairModuleTabMap[sourceModule] as WorkbenchTabKey);
    };

    const [sidebarWidth, setSidebarWidth] = useState(() =>
        clampPoolSidebarWidth(poolSidebarWidth, 1400)
    );

    // DOM 更新后重新计算宽度，避免 display:none 时 clientWidth=0 导致误缩
    useLayoutEffect(() => {
        const containerWidth = poolContainerRef.current?.clientWidth;
        if (containerWidth && containerWidth > 0) {
            setSidebarWidth(clampPoolSidebarWidth(poolSidebarWidth, containerWidth));
        }
    }, [activeTab, poolSidebarWidth]);

    useEffect(() => {
        if (activeTab !== 'pool' || !draggingSidebar) return;

        const handlePointerMove = (event: PointerEvent) => {
            const rect = poolContainerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const nextWidth = clampPoolSidebarWidth(event.clientX - rect.left, rect.width);
            setPoolSidebarWidth(nextWidth);
        };

        const handlePointerUp = () => setDraggingSidebar(false);

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [activeTab, draggingSidebar, setPoolSidebarWidth]);

    const items: { key: WorkbenchTabKey; label: React.ReactNode; children: React.ReactNode }[] = [
        {
            key: 'pool',
            label: <span className="flex items-center gap-1.5"><DatabaseOutlined /> 数据池</span>,
            children: (
                <div
                    ref={poolContainerRef}
                    className="flex xl:h-[calc(100vh-190px)] h-[calc(100vh-160px)] bg-slate-200/50 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm backdrop-blur-sm"
                >
                    <div
                        className="flex-shrink-0 bg-slate-50/40"
                        style={{ width: sidebarWidth }}
                    >
                        <DataSourcePanel
                            focusedFile={focusedFile}
                            onFocusFile={handleFocusFile}
                        />
                    </div>

                    <div
                        className={`w-2 flex-shrink-0 cursor-col-resize bg-slate-200/70 hover:bg-blue-200 transition-colors relative ${draggingSidebar ? 'bg-blue-300' : ''}`}
                        onPointerDown={(event) => {
                            event.preventDefault();
                            setDraggingSidebar(true);
                        }}
                    >
                        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/80" />
                    </div>

                    <div className="flex-1 min-w-0 bg-white border-l border-slate-200/60">
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
    ];

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
                        items={items}
                        className="parameter-workbench-tabs"
                    />
                </>
            ) : (
                // 顶层 tab 切换时保持所有子 tab 内容不销毁
                items.map(item => (
                    <div key={item.key} style={{ display: item.key === activeTab ? 'block' : 'none' }}>
                        {item.children}
                    </div>
                ))
            )}
        </div>
    );
};

export default ParameterWorkbench;
