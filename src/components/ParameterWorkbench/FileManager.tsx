import React, { useState } from 'react';
import { Upload, Button, message, Tooltip } from 'antd';
import { DeleteOutlined, FileExcelOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { parseExcel, readFileAsWorkbook, previewWorkbook, parseWorkbookWithConfig } from '../../utils/excelParser';
import type { SheetData, SheetPreview, SheetParseConfig } from '../../types';
import type * as XLSX from 'xlsx';
import ExcelPreviewDialog from './ExcelPreviewDialog';

const FileManager: React.FC = () => {
    const { uploadedFiles, addFile, removeFile, clearFiles } = useVehicleStore();
    const [uploading, setUploading] = useState(false);
    
    // 预览对话框状态
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState<SheetPreview[]>([]);
    const [pendingWorkbook, setPendingWorkbook] = useState<XLSX.WorkBook | null>(null);
    const [pendingFileName, setPendingFileName] = useState('');

    const handleUpload = async (file: File) => {
        setUploading(true);
        try {
            // 先尝试自动解析
            const data: SheetData = await parseExcel(file);
            
            if (!data.data || data.data.length === 0) {
                // 自动解析结果为空 → 打开预览框
                await openPreviewDialog(file);
                return false;
            }

            addFile(data);
            message.success(`已添加: ${file.name}`);
        } catch {
            // 自动解析失败 → 打开预览框让用户手动配置
            console.log('自动解析失败，打开预览对话框');
            await openPreviewDialog(file);
        } finally {
            setUploading(false);
        }
        return false;
    };

    // 打开预览对话框
    const openPreviewDialog = async (file: File) => {
        try {
            const workbook = await readFileAsWorkbook(file);
            const previews = previewWorkbook(workbook);
            setPendingWorkbook(workbook);
            setPendingFileName(file.name);
            setPreviewData(previews);
            setPreviewOpen(true);
        } catch (err) {
            message.error(`无法读取文件: ${(err as Error).message}`);
        } finally {
            setUploading(false);
        }
    };

    // 用户确认配置后，使用配置化解析
    const handlePreviewConfirm = (configs: SheetParseConfig[]) => {
        if (!pendingWorkbook) return;
        try {
            const data = parseWorkbookWithConfig(pendingWorkbook, pendingFileName, configs);
            addFile(data);
            message.success(`已添加: ${pendingFileName}（手动配置解析）`);
            setPreviewOpen(false);
            setPendingWorkbook(null);
        } catch (err) {
            message.error(`解析失败: ${(err as Error).message}`);
        }
    };

    // 主动打开预览对话框（重新配置已上传的文件）
    const handleReparse = async (fileName: string) => {
        // 这里暂不实现，因为已解析成功的文件通常不需要重新配置
        message.info(`如需重新配置 "${fileName}"，请先删除再重新上传`);
    };

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">文件池</span>
                {uploadedFiles.length > 0 && (
                    <button 
                        onClick={clearFiles}
                        className="text-xs text-gray-400 hover:text-red-500"
                    >
                        清空
                    </button>
                )}
            </div>

            <Upload
                beforeUpload={handleUpload}
                showUploadList={false}
                accept=".xlsx,.xls"
                multiple
            >
                <Button 
                    type="primary" 
                    icon={<PlusOutlined />} 
                    loading={uploading} 
                    block 
                    size="small"
                >
                    添加文件
                </Button>
            </Upload>

            {uploadedFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                    {uploadedFiles.map(item => (
                        <div 
                            key={item.fileName}
                            className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded text-xs group"
                        >
                            <div className="flex items-center gap-1.5 min-w-0">
                                <FileExcelOutlined className="text-green-600 flex-shrink-0" />
                                <Tooltip title={item.fileName}>
                                    <span className="truncate text-gray-700">{item.fileName}</span>
                                </Tooltip>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => handleReparse(item.fileName)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 flex-shrink-0"
                                    title="重新配置解析"
                                >
                                    <SettingOutlined />
                                </button>
                                <button
                                    onClick={() => removeFile(item.fileName)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 flex-shrink-0"
                                >
                                    <DeleteOutlined />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {uploadedFiles.length === 0 && (
                <p className="text-xs text-gray-400 text-center mt-2">暂无文件</p>
            )}

            {/* Excel 预览对话框 */}
            <ExcelPreviewDialog
                open={previewOpen}
                previews={previewData}
                fileName={pendingFileName}
                onConfirm={handlePreviewConfirm}
                onCancel={() => {
                    setPreviewOpen(false);
                    setPendingWorkbook(null);
                }}
            />
        </div>
    );
};

export default FileManager;
