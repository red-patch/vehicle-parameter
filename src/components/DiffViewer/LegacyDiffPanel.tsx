import React, { useMemo, useState } from 'react';
import { Select, Steps } from 'antd';
import { UploadOutlined, FileSearchOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';

const ExcelUploader = React.lazy(() => import('../FileUpload/ExcelUploader'));
const ParametersTable = React.lazy(() => import('./ParametersTable'));
const DiffResultView = React.lazy(() => import('./DiffResultView'));

/**
 * 旧版「上传对比」页（从 App.tsx 抽出，逻辑保留但不在顶层菜单显示）。
 * 独立订阅 store + memo 化：顶层 activeTab 切换不再触发本面板重渲染。
 */
const LegacyDiffPanel: React.FC = () => {
  const { baseFile, targetFile } = useVehicleStore(useShallow(state => ({
    baseFile: state.baseFile,
    targetFile: state.targetFile,
  })));
  // V3.0: 多工作表筛选（改为数组支持多选）
  const [selectedBaseSheets, setSelectedBaseSheets] = useState<string[]>([]);

  // Computed Base Sheets and Filtered Data
  const baseSheets = useMemo(() => {
    if (!baseFile) return [];
    const sheets = new Set<string>();
    baseFile.data.forEach(p => p.originSheet && sheets.add(p.originSheet));
    return Array.from(sheets).sort();
  }, [baseFile]);

  // V3.0: 支持多工作表筛选
  const filteredBaseData = useMemo(() => {
    if (!baseFile) return [];
    if (selectedBaseSheets.length === 0) return baseFile.data; // 未选择则显示全部
    return baseFile.data.filter(p => p.originSheet && selectedBaseSheets.includes(p.originSheet));
  }, [baseFile, selectedBaseSheets]);

  return (
    <>
      <div className="mb-6">
        <Steps
          current={baseFile && targetFile ? 2 : (baseFile || targetFile ? 1 : 0)}
          items={[
            {
              title: '上传基准版本',
              description: baseFile ? baseFile.fileName : '请上传Excel文件',
              icon: <UploadOutlined />,
            },
            {
              title: '上传新版本',
              description: targetFile ? targetFile.fileName : '请上传对比文件',
              icon: <FileSearchOutlined />,
            },
            {
              title: '查看差异',
              description: baseFile && targetFile ? '对比结果已生成' : '等待文件上传',
              icon: <CheckCircleOutlined />,
            },
          ]}
        />
      </div>

      <ExcelUploader />

      {baseFile && !targetFile && (
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
             <h3 className="text-lg font-bold">基准版预览</h3>
             {baseSheets.length > 0 && (
                <div className="flex items-center gap-2">
                   <span>按工作表筛选:</span>
                   <Select
                     mode="multiple"
                     value={selectedBaseSheets}
                     onChange={setSelectedBaseSheets}
                     style={{ minWidth: 280 }}
                     placeholder="全部工作表"
                     allowClear
                     maxTagCount={2}
                     options={baseSheets.map(s => ({ label: s, value: s }))}
                   />
                </div>
             )}
          </div>
          <ParametersTable data={filteredBaseData} />
        </div>
      )}

      {targetFile && !baseFile && (
        <div className="mt-8">
          <h3 className="text-lg font-bold mb-4">新版本预览</h3>
          <ParametersTable data={targetFile.data} />
        </div>
      )}

      {baseFile && targetFile && (
        <div className="mt-8">
          <DiffResultView />
        </div>
      )}
    </>
  );
};

export default React.memo(LegacyDiffPanel);
