import React from 'react';
import RequirementUploader from './RequirementUploader';
import MatchResultTable from './MatchResultTable';

const SmartLayout: React.FC = () => {
    return (
        <div className="max-w-7xl mx-auto p-4">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800">智能参数填报</h2>
                <p className="text-gray-500 mt-1">
                    根据参数需求，系统将自动从基准参数库中模糊匹配并填充参数。
                </p>
            </div>

            <RequirementUploader />
            <MatchResultTable />
        </div>
    );
};

export default SmartLayout;
