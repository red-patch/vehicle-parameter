import React, { useState } from 'react';
import { Tabs } from 'antd';
import { DatabaseOutlined, DiffOutlined, FormOutlined, AppstoreOutlined } from '@ant-design/icons';
import FileManager from './FileManager';
import ProductSelector from './ProductSelector';
import DataPreview from './DataPreview';
import CompareView from './CompareView';
import SmartFillView from './SmartFillView';
import MultiVehicleView from './MultiVehicleView';

const ParameterWorkbench: React.FC = () => {
    const [activeTab, setActiveTab] = useState('pool');

    const items = [
        {
            key: 'pool',
            label: <span className="flex items-center gap-1.5"><DatabaseOutlined /> 数据池</span>,
            children: (
                <div className="flex h-[calc(100vh-180px)] gap-4">
                    {/* Left Sidebar - Narrower */}
                    <div className="w-60 flex-shrink-0 flex flex-col gap-3">
                        <FileManager />
                        <div className="flex-1 overflow-hidden">
                            <ProductSelector />
                        </div>
                    </div>
                    
                    {/* Main Content - Overview Cards */}
                    <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <DataPreview onGoCompare={() => setActiveTab('compare')} />
                    </div>
                </div>
            )
        },
        {
            key: 'compare',
            label: <span className="flex items-center gap-1.5"><DiffOutlined /> 版本对比</span>,
            children: <div className="h-[calc(100vh-180px)]"><CompareView /></div>
        },
        {
            key: 'fill',
            label: <span className="flex items-center gap-1.5"><FormOutlined /> 智能填报</span>,
            children: <div className="h-[calc(100vh-180px)] bg-white rounded-lg border border-gray-200 p-4"><SmartFillView /></div>
        },
        {
            key: 'multi',
            label: <span className="flex items-center gap-1.5"><AppstoreOutlined /> 多车型整理</span>,
            children: <div className="h-[calc(100vh-180px)] bg-white rounded-lg border border-gray-200 p-4"><MultiVehicleView /></div>
        }
    ];

    return (
        <div className="h-full">
            <div className="mb-3">
                <h1 className="text-lg font-semibold text-gray-900">参数工作台</h1>
                <p className="text-gray-500 text-sm">管理参数文件、版本对比、智能填报</p>
            </div>
            
            <Tabs 
                activeKey={activeTab} 
                onChange={setActiveTab} 
                items={items}
                size="small"
            />
        </div>
    );
};

export default ParameterWorkbench;
