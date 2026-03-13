import React, { useState } from 'react';
import { Tabs, Skeleton } from 'antd';
import { DatabaseOutlined, DiffOutlined, FormOutlined, AppstoreOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import DataSourcePanel from './DataSourcePanel';
import VehicleListPanel from './VehicleListPanel';
import AssetDataSynchronizer from './AssetDataSynchronizer';

const CompareView = React.lazy(() => import('./CompareView'));
const SmartFillView = React.lazy(() => import('./SmartFillView'));
const MultiVehicleView = React.lazy(() => import('./MultiVehicleView'));
const DataPurifyView = React.lazy(() => import('../DataPurify/DataPurifyView'));

const ParameterWorkbench: React.FC = () => {
    const [activeTab, setActiveTab] = useState('pool');
    const [focusedFile, setFocusedFile] = useState<string | null>(null);
    const [focusedProduct, setFocusedProduct] = useState<string | null>(null);

    const handleFocusFile = (fileName: string | null) => {
        setFocusedFile(fileName);
        setFocusedProduct(null);
    };

    const items = [
        {
            key: 'pool',
            label: <span className="flex items-center gap-1.5"><DatabaseOutlined /> 数据池</span>,
            children: (
                <div className="flex xl:h-[calc(100vh-190px)] h-[calc(100vh-160px)] gap-0.5 bg-slate-200/50 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm backdrop-blur-sm">
                    <div className="w-[28%] min-w-[300px] max-w-[380px] flex-shrink-0 bg-slate-50/40">
                        <DataSourcePanel
                            focusedFile={focusedFile}
                            onFocusFile={handleFocusFile}
                        />
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
