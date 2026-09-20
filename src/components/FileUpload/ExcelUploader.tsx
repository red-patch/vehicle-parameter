import React, { useState } from 'react';
import { Upload, Button, Card, Typography, Spin, message, Modal } from 'antd';
import { UploadOutlined, FileExcelOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { ParseError, type ParseDiagnostics } from '../../utils/excelParser';
import { parseExcelAsync } from '../../utils/excelParserAsync';
import { useVehicleStore } from '../../store/vehicleStore';
import type { SheetData } from '../../types';

const { Text } = Typography;
const { Dragger } = Upload;

// 格式化诊断信息为用户友好的文本
const formatDiagnostics = (diagnostics: ParseDiagnostics): React.ReactNode => {
    return (
        <div className="text-left space-y-2">
            <div>
                <Text strong>文件概况：</Text>
                <Text>共 {diagnostics.totalSheets} 个 Sheet</Text>
            </div>
            
            {diagnostics.sheetsProcessed.length > 0 && (
                <div>
                    <Text type="success">✓ 已处理：</Text>
                    <Text>{diagnostics.sheetsProcessed.join('、')}</Text>
                </div>
            )}
            
            {diagnostics.sheetsSkipped.length > 0 && (
                <div>
                    <Text type="warning">⚠ 已跳过：</Text>
                    <ul className="mt-1 ml-4 text-sm text-2">
                        {diagnostics.sheetsSkipped.map((s, i) => (
                            <li key={i}>「{s.name}」- {s.reason}</li>
                        ))}
                    </ul>
                </div>
            )}
            
            <div className="mt-4 p-3 bg-brand-weak rounded border border-brand/20">
                <Text strong className="text-brand">建议：</Text>
                <Text className="text-brand">{diagnostics.suggestion}</Text>
            </div>
        </div>
    );
};

const ExcelUploader: React.FC = () => {
    const { setBaseFile, setTargetFile, baseFile, targetFile } = useVehicleStore();
    const [loading, setLoading] = useState(false);

    const handleUpload = async (file: File, type: 'base' | 'target') => {
        setLoading(true);
        try {
            const data = await parseExcelAsync(file);
            if (type === 'base') {
                setBaseFile(data);
                message.success(`基准版本 "${file.name}" 解析成功`);
            } else {
                setTargetFile(data);
                message.success(`新版本 "${file.name}" 解析成功`);
            }
        } catch (error) {
            console.error(error);
            
            if (error instanceof ParseError) {
                // 显示详细错误信息
                Modal.error({
                    title: `无法解析文件 "${file.name}"`,
                    icon: <ExclamationCircleOutlined />,
                    content: formatDiagnostics(error.diagnostics),
                    width: 500,
                    okText: '我知道了'
                });
            } else {
                message.error(`解析失败: ${(error as Error).message}`);
            }
        } finally {
            setLoading(false);
        }
        return false; // Prevent auto upload
    };

// Helper to count parameters
    const getUniqueCount = (data: { originSheet?: string; group: string; name: string }[]) => {
        const uniqueKeys = new Set<string>();
        data.forEach(item => {
            uniqueKeys.add(`${item.originSheet || ''}::${item.group}::${item.name}`);
        });
        return uniqueKeys.size;
    };

    const renderUploader = (type: 'base' | 'target', title: string, currentFile: SheetData | null) => (
        <Card className="w-full" title={title} bordered={false}>
            {currentFile ? (
                <div className="flex flex-col items-center justify-center py-6 bg-success-weak rounded border border-success/25">
                    <FileExcelOutlined className="text-4xl text-success mb-2" />
                    <Text strong>{currentFile.fileName}</Text>
                    <Text type="secondary">{getUniqueCount(currentFile.data)} 个参数</Text>
                    <Button
                        type="link"
                        danger
                        onClick={() => type === 'base' ? setBaseFile(null!) : setTargetFile(null!)}
                    >
                        清除并重新上传
                    </Button>
                </div>
            ) : (
                <Dragger
                    name="file"
                    accept=".xlsx,.xls,.csv"
                    showUploadList={false}
                    beforeUpload={(file) => handleUpload(file, type)}
                    disabled={loading}
                    className="surface-inset hover:surface-container transition-colors"
                >
                    <p className="ant-upload-drag-icon">
                        <UploadOutlined className="text-brand" />
                    </p>
                    <p className="ant-upload-text">点击或拖拽文件到此区域</p>
                    <p className="ant-upload-hint">支持 .xlsx, .xls</p>
                </Dragger>
            )}
        </Card>
    );

    return (
        <Spin spinning={loading} tip="正在解析 Excel...">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
                {renderUploader('base', '基准版本 (Base Version)', baseFile)}
                {renderUploader('target', '新版本 (Target Version)', targetFile)}
            </div>
        </Spin>
    );
};

export default ExcelUploader;
