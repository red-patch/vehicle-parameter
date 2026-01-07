import React, { useEffect, useState, useMemo } from 'react';
import { ConfigProvider, message, Select, Steps, theme } from 'antd';
import ErrorBoundary from './components/ErrorBoundary';
import zhCN from 'antd/locale/zh_CN';
import MainLayout from './components/Layout/MainLayout';
import ExcelUploader from './components/FileUpload/ExcelUploader';
import ParametersTable from './components/DiffViewer/ParametersTable';
import { useVehicleStore } from './store/vehicleStore';
import { useThemeStore } from './store/themeStore';
import { compareSheets } from './utils/comparator';
import DiffResultView from './components/DiffViewer/DiffResultView';
import SmartLayout from './components/SmartFiller/SmartLayout';
import AnnouncementQuery from './components/AnnouncementQuery/AnnouncementQuery';
import { UploadOutlined, FileSearchOutlined, CheckCircleOutlined } from '@ant-design/icons';

const App: React.FC = () => {
  const { baseFile, targetFile, setDiffResult, compareMode } = useVehicleStore();
  const { isDarkMode } = useThemeStore();
  const [activeTab, setActiveTab] = React.useState('diff');
  // Base Preview Sheet State
  const [selectedBaseSheet, setSelectedBaseSheet] = useState<string>('all');

  // Computed Base Sheets and Filtered Data
  const baseSheets = useMemo(() => {
    if (!baseFile) return [];
    const sheets = new Set<string>();
    baseFile.data.forEach(p => p.originSheet && sheets.add(p.originSheet));
    return Array.from(sheets).sort();
  }, [baseFile]);

  const filteredBaseData = useMemo(() => {
    if (!baseFile) return [];
    if (selectedBaseSheet === 'all') return baseFile.data;
    return baseFile.data.filter(p => p.originSheet === selectedBaseSheet);
  }, [baseFile, selectedBaseSheet]);

  // Auto-run diff when both files are present or mode changes
  useEffect(() => {
    if (baseFile && targetFile) {
      try {
        const result = compareSheets(baseFile, targetFile, compareMode);
        setDiffResult(result);
      } catch (err) {
        console.error('Comparison error:', err);
        message.error('比对失败，请检查文件格式或数据完整性');
      }
    }
  }, [baseFile, targetFile, setDiffResult, compareMode]);

  // Calculate current step for the Steps component
  const currentStep = useMemo(() => {
    if (baseFile && targetFile) return 2;
    if (baseFile || targetFile) return 1;
    return 0;
  }, [baseFile, targetFile]);

  return (
    <ConfigProvider 
      locale={zhCN}
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      <ErrorBoundary>
        <MainLayout activeTab={activeTab} onTabChange={setActiveTab}>
          {/* Tab内容渲染 */}
          {activeTab === 'diff' && (
            <>
              {/* Steps Flow Guide */}
              <div className="mb-6">
                <Steps
                  current={currentStep}
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
                             value={selectedBaseSheet}
                             onChange={setSelectedBaseSheet}
                             style={{ width: 220 }}
                             options={[
                               { label: '全部工作表 (All Sheets)', value: 'all' },
                               ...baseSheets.map(s => ({ label: s, value: s }))
                             ]}
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
          )}

          {activeTab === 'search' && <SmartLayout />}

          {activeTab === 'announcement' && <AnnouncementQuery />}

        </MainLayout>
      </ErrorBoundary>
    </ConfigProvider>
  );
};

export default App;
