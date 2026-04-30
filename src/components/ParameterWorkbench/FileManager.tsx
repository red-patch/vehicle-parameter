import React, { useState } from 'react';
import { Upload, Button, message, Tooltip } from 'antd';
import { DeleteOutlined, FileExcelOutlined, PlusOutlined, SettingOutlined, BankOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { parseExcel, readFileAsWorkbook, previewWorkbook, parseWorkbookWithConfig } from '../../utils/excelParser';
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import type { SheetData, SheetPreview, SheetParseConfig } from '../../types';
import type * as XLSX from 'xlsx';
import ExcelPreviewDialog from './ExcelPreviewDialog';
import AssetListDrawer from '../AssetLibrary/AssetListDrawer';
import SheetPickerModal from './SheetPickerModal';
import { FolderOpenOutlined } from '@ant-design/icons';

interface FileManagerProps {
    hiddenAssetButton?: boolean;
    onSelectFile?: (fileName: string | null) => void;
    focusedFile?: string | null;
}

const FileManager: React.FC<FileManagerProps> = ({ hiddenAssetButton, onSelectFile, focusedFile }) => {
    const { uploadedFiles, addFile, removeFile, clearFiles } = useVehicleStore();
    const [uploading, setUploading] = useState(false);
    
    // 内存中的原生文件缓存区（用于支持二次重解析预览）
    const [fileCache, setFileCache] = useState<Map<string, File>>(new Map());
    
    // 预览对话框状态
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState<SheetPreview[]>([]);
    const [pendingWorkbook, setPendingWorkbook] = useState<XLSX.WorkBook | null>(null);
    const [pendingFileName, setPendingFileName] = useState('');
    const [assetDrawerVisible, setAssetDrawerVisible] = useState(false);
    const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
    const [sheetPickerData, setSheetPickerData] = useState<{ name: string; totalRows: number }[]>([]);
    const [preselectedDisabledSheets, setPreselectedDisabledSheets] = useState<Set<string>>(new Set());

    // Inline Rename State
    const [editingFile, setEditingFile] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const handleUpload = async (file: File) => {
        setUploading(true);
        // 先无条件存入缓存以备后用
        setFileCache(prev => {
            const next = new Map(prev);
            next.set(file.name, file);
            return next;
        });
        
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
            // 多 sheet 时先弹出 sheet 选择器
            if (previews.length > 1) {
                setSheetPickerData(previews.map(p => ({ name: p.sheetName, totalRows: p.totalRows })));
                setSheetPickerOpen(true);
            } else {
                setPreviewOpen(true);
            }
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
    const handleSheetPickerConfirm = (disabledSheets: Set<string>) => {
        setSheetPickerOpen(false);
        setPreselectedDisabledSheets(disabledSheets);
        setPreviewOpen(true);
    };

    const handleSheetPickerSkip = () => {
        setSheetPickerOpen(false);
        setPreselectedDisabledSheets(new Set());
        setPreviewOpen(true);
    };

    const handleSheetPickerCancel = () => {
        setSheetPickerOpen(false);
        setPendingWorkbook(null);
        setPreselectedDisabledSheets(new Set());
    };

    const handleReparse = async (fileName: string) => {
        const cachedFile = fileCache.get(fileName);
        if (!cachedFile) {
            message.warning(`内存中未找到 "${fileName}" 的原始文件档案，请重新上传后重试。`);
            return;
        }
        setUploading(true);
        await openPreviewDialog(cachedFile);
        message.info('正为您重新打开该文件的解析配置流...');
    };

    const handleRemoveFile = (fileName: string) => {
        removeFile(fileName);
        setFileCache(prev => {
            const next = new Map(prev);
            next.delete(fileName);
            return next;
        });
        if (focusedFile === fileName && onSelectFile) {
            onSelectFile(null);
        }
    };

    const handleClearFilesBase = () => {
        clearFiles();
        setFileCache(new Map());
        if (onSelectFile) {
            onSelectFile(null);
        }
    };

    // V6.0 处理重命名逻辑
    const handleStartRename = (fileName: string) => {
        setEditingFile(fileName);
        // 如果原本是以 .json 或其他后缀结尾，我们在编辑时暂时截去后缀，方便输入
        const display = fileName.replace(/\.[^/.]+$/, "");
        setEditName(display);
    };

    const handleConfirmRename = (oldName: string) => {
        if (!editName.trim()) return;
        
        let newName = editName.trim();
        // 尝试维持原先的后缀，如果没有就补一个自定义的后缀标记以便识别
        const match = oldName.match(/(\.[^/.]+)$/);
        const ext = match ? match[1] : '';
        if (ext && !newName.endsWith(ext)) {
             newName = newName + ext;
        }

        if (newName === oldName) {
            setEditingFile(null);
            return;
        }

        useVehicleStore.getState().renameFileName(oldName, newName);

        // 同步修改内存文件缓存区键值对
        setFileCache(prev => {
            const next = new Map(prev);
            const cachedFile = next.get(oldName);
            if (cachedFile) {
                // 利用原本的原生 File 对象，我们直接更换它的映射 key
                next.set(newName, cachedFile);
                next.delete(oldName);
            }
            return next;
        });

        message.success(`工作台文件重命名成功: ${newName}`);
        setEditingFile(null);
    };

    return (
        <div className="bg-transparent mb-2">
            <div className="flex justify-between items-center mb-3 px-1">
                <span className="text-[13px] font-semibold text-slate-700">工作区 (Excel)</span>
                {uploadedFiles.length > 0 && (
                    <button 
                        onClick={handleClearFilesBase}
                        className="text-xs text-gray-400 hover:text-red-500"
                    >
                        清空
                    </button>
                )}
            </div>

            <div className="flex flex-col gap-2">
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
                {!hiddenAssetButton && (
                    <Button 
                        type="dashed" 
                        icon={<FolderOpenOutlined />} 
                        block 
                        size="small"
                        className="text-blue-500 border-blue-300 hover:text-blue-400 hover:border-blue-400"
                        onClick={() => setAssetDrawerVisible(true)}
                    >
                        我的资产库
                    </Button>
                )}
            </div>

            {uploadedFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                    {uploadedFiles.map(item => {
                        const isEditing = editingFile === item.fileName;
                        const isFocused = focusedFile === item.fileName;
                        
                        return (
                            <div 
                                key={item.fileName}
                                onClick={() => onSelectFile && onSelectFile(item.fileName)}
                                className={`flex items-center justify-between py-1.5 px-2.5 rounded-md text-[13px] group border cursor-pointer transition-all ${
                                    isEditing 
                                        ? 'border-blue-300 bg-blue-50' 
                                        : isFocused 
                                            ? 'bg-blue-50/50 border-blue-200 shadow-sm text-blue-700' 
                                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                {isEditing ? (
                                    <div className="flex items-center w-full gap-2">
                                        <Input 
                                            size="small"
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            onPressEnter={() => handleConfirmRename(item.fileName)}
                                            autoFocus
                                            className="flex-1 text-xs py-0"
                                        />
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <Button 
                                                type="text" 
                                                size="small" 
                                                icon={<CheckOutlined className="text-green-600" />} 
                                                onClick={() => handleConfirmRename(item.fileName)}
                                                className="w-6 h-6 p-0 min-w-0"
                                            />
                                            <Button 
                                                type="text" 
                                                size="small" 
                                                icon={<CloseOutlined className="text-gray-400" />} 
                                                onClick={() => setEditingFile(null)}
                                                className="w-6 h-6 p-0 min-w-0"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-2 min-w-0">
                                            {item.data.some(p => p.originSheet === '工信部官网') ? (
                                                <BankOutlined className={`${isFocused ? 'text-blue-500' : 'text-amber-500'} flex-shrink-0`} />
                                            ) : (
                                                <FileExcelOutlined className={`${isFocused ? 'text-blue-500' : 'text-emerald-600'} flex-shrink-0`} />
                                            )}
                                            <Tooltip title={item.fileName}>
                                                <span className={`truncate ${isFocused ? 'font-medium text-blue-800' : 'text-slate-700'}`}>{item.fileName}</span>
                                            </Tooltip>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Tooltip title="重命名该数据源">
                                                <button
                                                    onClick={() => handleStartRename(item.fileName)}
                                                    className="text-gray-400 hover:text-blue-500 flex-shrink-0 focus:outline-none"
                                                >
                                                    <EditOutlined />
                                                </button>
                                            </Tooltip>
                                            <Tooltip title="重新配置解析">
                                                <button
                                                    onClick={() => handleReparse(item.fileName)}
                                                    className="text-gray-400 hover:text-blue-500 flex-shrink-0 focus:outline-none"
                                                >
                                                    <SettingOutlined />
                                                </button>
                                            </Tooltip>
                                            <button
                                                onClick={() => handleRemoveFile(item.fileName)}
                                                className="text-gray-400 hover:text-red-500 flex-shrink-0 focus:outline-none"
                                            >
                                                <DeleteOutlined />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
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
                    setPreselectedDisabledSheets(new Set());
                }}
                preselectedDisabledSheets={preselectedDisabledSheets}
            />
            
            <SheetPickerModal
                open={sheetPickerOpen}
                sheets={sheetPickerData}
                onConfirm={handleSheetPickerConfirm}
                onSkip={handleSheetPickerSkip}
                onCancel={handleSheetPickerCancel}
            />

            <AssetListDrawer
                visible={assetDrawerVisible}
                onClose={() => setAssetDrawerVisible(false)}
            />
        </div>
    );
};

export default FileManager;
