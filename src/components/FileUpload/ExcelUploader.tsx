import React, { useState } from 'react';
import { Upload, Button, Card, Typography, Spin, message } from 'antd';
import { UploadOutlined, FileExcelOutlined } from '@ant-design/icons';
import { parseExcel } from '../../utils/excelParser';
import { useVehicleStore } from '../../store/vehicleStore';
import type { SheetData } from '../../types';

const { Text } = Typography;
const { Dragger } = Upload;

const ExcelUploader: React.FC = () => {
    const { setBaseFile, setTargetFile, baseFile, targetFile } = useVehicleStore();
    const [loading, setLoading] = useState(false);

    const handleUpload = async (file: File, type: 'base' | 'target') => {
        setLoading(true);
        try {
            const data = await parseExcel(file);
            if (type === 'base') {
                setBaseFile(data);
                message.success(`基准版本 "${file.name}" 解析成功`);
            } else {
                setTargetFile(data);
                message.success(`新版本 "${file.name}" 解析成功`);
            }
        } catch (error) {
            console.error(error);
            message.error(`解析失败: ${(error as Error).message}`);
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
                <div className="flex flex-col items-center justify-center py-6 bg-green-50 rounded border border-green-200">
                    <FileExcelOutlined className="text-4xl text-green-600 mb-2" />
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
                    className="bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                    <p className="ant-upload-drag-icon">
                        <UploadOutlined className="text-blue-500" />
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
