import React from 'react';
import { Tabs } from 'antd';
import { FormOutlined, DatabaseOutlined, AppstoreOutlined } from '@ant-design/icons';
import RequirementUploader from './RequirementUploader';
import MatchResultTable from './MatchResultTable';
import ConfigManagerView from './ConfigManagerView';
import MultiVehicleOrganizer from './MultiVehicleOrganizer';

const SmartLayout: React.FC = () => {
    const items = [
        {
            key: 'filler',
            label: (
                <span>
                    <FormOutlined />
                    智能填报
                </span>
            ),
            children: (
                <>
                    <RequirementUploader />
                    <MatchResultTable />
                </>
            )
        },
        {
            key: 'multi',
            label: (
                <span>
                    <AppstoreOutlined />
                    多车型整理
                </span>
            ),
            children: <MultiVehicleOrganizer />
        },
        {
            key: 'dictionary',
            label: (
                <span>
                    <DatabaseOutlined />
                    系统配置
                </span>
            ),
            children: <ConfigManagerView />
        }
    ];

    return (
        <div className="max-w-7xl mx-auto p-4">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-1">智能参数填报</h2>
                <p className="text-3 mt-1">
                    根据参数需求，系统将自动从基准参数库中模糊匹配并填充参数。
                </p>
            </div>

            <Tabs items={items} defaultActiveKey="filler" />
        </div>
    );
};

export default SmartLayout;
