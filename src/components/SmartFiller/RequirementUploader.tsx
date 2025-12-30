import React, { useState } from 'react';
import { Upload, Card, Typography, Spin, message, Button, Select, Tabs, Input } from 'antd';
import { UploadOutlined, FileExcelOutlined, FileTextOutlined } from '@ant-design/icons';
import { parseRequirementExcel } from '../../utils/excelParser';
import { useVehicleStore } from '../../store/vehicleStore';
import { findMatches } from '../../utils/matcher';

const { Text } = Typography;
const { Dragger } = Upload;

const RequirementUploader: React.FC = () => {
    const { setRequirementFile, setMatchResults, requirementFile, baseFile, selectedProduct, setSelectedProduct } = useVehicleStore();
    const [loading, setLoading] = useState(false);
    const [textInput, setTextInput] = useState('');
    const [activeTab, setActiveTab] = useState('file');

    // Compute available products from baseFile
    const productOptions = React.useMemo(() => {
        if (!baseFile?.data) return [];
        const products = Array.from(new Set(baseFile.data.map(p => p.productName).filter(Boolean)));
        return products.map(p => ({ label: p, value: p }));
    }, [baseFile]);

    const handleTextSubmit = () => {
        if (!textInput.trim()) {
            message.warning('请输入参数名称');
            return;
        }

        if (!baseFile) {
            message.error('请先在"差异比对"页面上传基准版本作为参数库');
            return;
        }

        setLoading(true);
        try {
            // Split by comma (English/Chinese) or newline
            const params = textInput.split(/[,，\n]+/).map(s => s.trim()).filter(Boolean);
            
            if (params.length === 0) {
                 message.warning('未识别到有效参数');
                 setLoading(false);
                 return;
            }

            // Create Virtual SheetData
            const virtualData = {
                fileName: '手动输入 (Manual Input)',
                rawHeaders: ['手动参数'],
                data: params.map((p, idx) => ({
                    id: `MANUAL_${idx}`,
                    group: 'Manual',
                    name: p,
                    value: '',
                    originSheet: 'Input'
                }))
            };

            setRequirementFile(virtualData);

            // Trigger Matching Logic (Same as File Upload)
            let searchScope = baseFile.data;
            if (selectedProduct) {
                searchScope = baseFile.data.filter(p => p.productName === selectedProduct);
            }

            const matches = findMatches(params, searchScope);
            setMatchResults(matches);
            message.success(`已识别并匹配 ${matches.length} 个参数`);

        } catch (error) {
            message.error('处理失败');
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (file: File) => {
        setLoading(true);
        try {
            if (!baseFile) {
                message.error('请先在"差异比对"页面上传基准版本作为参数库');
                setLoading(false);
                return false;
            }

            const data = await parseRequirementExcel(file);
            setRequirementFile(data);

            // Trigger Matching with Filtering
            const requirements = data.data.map(p => p.name).filter(n => n);

            // Filter base data by selected product if one is chosen
            let searchScope = baseFile.data;
            if (selectedProduct) {
                searchScope = baseFile.data.filter(p => p.productName === selectedProduct);
            }

            const matches = findMatches(requirements, searchScope);
            setMatchResults(matches);

            message.success(`需求文件解析成功，已自动匹配 ${matches.length} 个字段`);
        } catch (error) {
            console.error(error);
            message.error(`解析失败: ${(error as Error).message}`);
        } finally {
            setLoading(false);
        }
        return false;
    };

    if (requirementFile) {
        return (
            <div className="flex flex-col items-center justify-center py-6 bg-blue-50 rounded border border-blue-200 mb-6">
                <FileExcelOutlined className="text-4xl text-blue-600 mb-2" />
                <Text strong>{requirementFile.fileName}</Text>
                <Text type="secondary">{requirementFile.data.length} 个需求字段</Text>
                <Button
                    type="link"
                    danger
                    onClick={() => {
                        setRequirementFile(null!);
                        setMatchResults([]);
                    }}
                >
                    清除并重新上传
                </Button>
            </div>
        );
    }

    const renderFileUploader = () => (
        <Dragger
            name="file"
            accept=".xlsx,.xls,.csv"
            showUploadList={false}
            beforeUpload={handleUpload}
            disabled={loading}
            className="bg-gray-50 hover:bg-gray-100 transition-colors"
        >
            <p className="ant-upload-drag-icon">
                <UploadOutlined className="text-blue-500" />
            </p>
            <p className="ant-upload-text">点击或拖拽招标文件到此区域</p>
            <p className="ant-upload-hint">将自动提取"参数名"列并与参数库进行模糊匹配</p>
        </Dragger>
    );

    const renderTextInput = () => (
        <div className="flex flex-col gap-4 py-4">
            <Input.TextArea 
                rows={6} 
                placeholder="在此输入参数名称，支持批量输入。&#10;分隔符支持：逗号(,)，中文逗号(，)，或换行符。"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                className="text-base"
            />
            <Button type="primary" onClick={handleTextSubmit} loading={loading} icon={<FileTextOutlined />}>
                开始匹配 (Match Parameters)
            </Button>
        </div>
    );

    return (
        <Spin spinning={loading} tip="正在解析并匹配...">
            <Card title="上传招标文件 (Requirement Upload)" className="mb-6">
                <div className="mb-4">
                    <p className="mb-2 text-gray-600">选择要匹配的基准车型配置 (可选):</p>
                    <Select
                        style={{ width: '100%' }}
                        placeholder="不选择则匹配所有车型"
                        allowClear
                        options={productOptions}
                        value={selectedProduct}
                        onChange={setSelectedProduct}
                    />
                </div>
                
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        { label: '文件上传 (File Upload)', key: 'file', children: renderFileUploader() },
                        { label: '文本输入 (Text Input)', key: 'text', children: renderTextInput() }
                    ]}
                />
            </Card>
        </Spin>
    );
};

export default RequirementUploader;
