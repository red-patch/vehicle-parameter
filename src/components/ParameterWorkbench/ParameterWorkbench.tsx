import React, { useState } from 'react';
import { Tabs, Skeleton } from 'antd';
import { DatabaseOutlined, DiffOutlined, FormOutlined, AppstoreOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import DataSourcePanel from './DataSourcePanel';
import VehicleListPanel from './VehicleListPanel';
import DataPreview from './DataPreview';
import AssetDataSynchronizer from './AssetDataSynchronizer';

const CompareView = React.lazy(() => import('./CompareView'));
const SmartFillView = React.lazy(() => import('./SmartFillView'));
const MultiVehicleView = React.lazy(() => import('./MultiVehicleView'));
const DataPurifyView = React.lazy(() => import('../DataPurify/DataPurifyView'));

const ParameterWorkbench: React.FC = () => {
    const [activeTab, setActiveTab] = useState('pool');
    
    // Miller Columns State Management
    const [focusedFile, setFocusedFile] = useState<string | null>(null);
    const [focusedProduct, setFocusedProduct] = useState<string | null>(null);

    const handleFocusFile = (fileName: string | null) => {
        setFocusedFile(fileName);
        // Reset focused product when changing source file
        setFocusedProduct(null);
    };

    const items = [
        {
            key: 'pool',
            label: <span className="flex items-center gap-1.5"><DatabaseOutlined /> 数据池</span>,
            children: (
                <div className="flex xl:h-[calc(100vh-190px)] h-[calc(100vh-160px)] gap-0.5 bg-slate-200/50 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm backdrop-blur-sm">
                    {/* Column 1: Data Sources (Sidebar style) */}
                    <div className="w-[24%] min-w-[240px] flex-shrink-0 bg-slate-50/40">
                        <DataSourcePanel 
                            focusedFile={focusedFile}
                            onFocusFile={handleFocusFile}
                        />
                    </div>
                    
                    {/* Column 2: Vehicle List (The Bridge) */}
                    <div className="w-[34%] min-w-[280px] flex-shrink-0 bg-white border-l border-slate-200/60">
                        <VehicleListPanel 
                            focusedProduct={focusedProduct}
                            onFocusProduct={setFocusedProduct}
                        />
                    </div>
                    
                    {/* Column 3: Dashboard Preview (The Canvas) */}
                    <div className="w-[42%] min-w-[380px] flex-grow bg-white border-l border-slate-200/60 relative">
                        <DataPreview 
                            focusedProduct={focusedProduct}
                            onGoCompare={() => setActiveTab('compare')}
                        />
                        
                        {/* Empty Slate When No Product Focused */}
                        {!focusedProduct && (
                            <div className="absolute inset-0 z-10 bg-slate-50/80 flex items-center justify-center backdrop-blur-sm pointer-events-none">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100/60">
                                        <DatabaseOutlined className="text-2xl text-blue-500" />
                                    </div>
                                    <h3 className="text-[16px] font-bold text-slate-800 mb-1">车型数据极速概览</h3>
                                    <p className="text-[13px] text-slate-400 max-w-[250px] mx-auto leading-relaxed">
                                        点击左侧勾选以多选对比；或在中列点击某款车型，即可在此沉浸式审阅其参数大纲。
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )
        },
        {
            key: 'compare',
            label: <span className="flex items-center gap-1.5"><DiffOutlined /> 版本对比</span>,
            children: (
                <React.Suspense fallback={<Skeleton active />}>
                    <CompareView />
                </React.Suspense>
            )
        },
        {
            key: 'fill',
            label: <span className="flex items-center gap-1.5"><FormOutlined /> 智能填报</span>,
            children: (
                <React.Suspense fallback={<Skeleton active />}>
                    <SmartFillView />
                </React.Suspense>
            )
        },
        {
            key: 'multi',
            label: <span className="flex items-center gap-1.5"><AppstoreOutlined /> 多车型管理</span>,
            children: (
                <React.Suspense fallback={<Skeleton active />}>
                    <MultiVehicleView />
                </React.Suspense>
            )
        },
        {
            key: 'purify',
            label: <span className="flex items-center gap-1.5"><SafetyCertificateOutlined /> 数据体检与修复</span>,
            children: (
                <React.Suspense fallback={<Skeleton active />}>
                    <DataPurifyView />
                </React.Suspense>
            )
        }
    ];

    return (
        <div className="h-full bg-slate-50/50 p-6">
            <AssetDataSynchronizer />
            <div className="mb-6">
                <h1 className="text-3xl font-extrabold text-slate-900 m-0 tracking-tight">参数工作台</h1>
                <p className="text-slate-400 text-[13px] mt-1.5 mb-0 font-medium tracking-wide uppercase">Workspace / Parameter Data Management</p>
            </div>
            
            <Tabs 
                activeKey={activeTab}
                onChange={setActiveTab}
                items={items}
                className="parameter-workbench-tabs"
            />
        </div>
    );
};

export default ParameterWorkbench;
