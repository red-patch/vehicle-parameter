import React, { useState, useEffect } from 'react';
import { DatabaseOutlined, LoadingOutlined, EditOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, ExclamationCircleOutlined, PlusSquareOutlined, MinusSquareOutlined } from '@ant-design/icons';
import { Spin, Tooltip, Input, Button, Modal, message } from 'antd';
import FileManager from './FileManager';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { getAssetFilesWithInfo, renameAssetFile, deleteAssetFile, type AssetFileInfo } from '../../utils/assetManager';

// 简易格式化函数，替代 date-fns 避免依赖问题
const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

interface DataSourcePanelProps {
    focusedFile: string | null;
    onFocusFile: (fileName: string | null) => void;
}

const DataSourcePanel: React.FC<DataSourcePanelProps> = ({ focusedFile, onFocusFile }) => {
    const { assetLibraryPath, uploadedFiles, activeAssets, addActiveAsset, removeActiveAsset } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        uploadedFiles: state.uploadedFiles,
        activeAssets: state.activeAssets,
        addActiveAsset: state.addActiveAsset,
        removeActiveAsset: state.removeActiveAsset
    })));

    const [assets, setAssets] = useState<AssetFileInfo[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Rename state
    const [editingAsset, setEditingAsset] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const fetchAssets = async () => {
        if (!assetLibraryPath) return;
        setLoading(true);
        try {
            const infos = await getAssetFilesWithInfo(assetLibraryPath);
            // 按照更新时间倒序
            infos.sort((a, b) => {
                if (!a.updatedAt) return 1;
                if (!b.updatedAt) return -1;
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            });
            setAssets(infos);
        } catch (err) {
            console.error("Failed to load assets with info", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAssets();
    }, [assetLibraryPath, uploadedFiles]); // Re-fetch if files uploaded

    const handleStartRename = (info: AssetFileInfo) => {
        setEditingAsset(info.fileName);
        setEditName(info.fileName.replace(/\.json$/i, ''));
    };

    const handleConfirmRename = async (oldFileName: string) => {
        if (!editName.trim() || !assetLibraryPath) return;
        const newFileName = editName.trim().endsWith('.json') ? editName.trim() : `${editName.trim()}.json`;
        
        if (newFileName === oldFileName) {
            setEditingAsset(null);
            return;
        }

        try {
            const success = await renameAssetFile(assetLibraryPath, oldFileName, newFileName);
            if (success) {
                message.success('资产重命名成功');
                setEditingAsset(null);
                fetchAssets();
                // 如果当前选中的是这个文件，需要同步更新父组件状态
                if (focusedFile === oldFileName) {
                    onFocusFile(newFileName);
                }
            } else {
                message.error('重命名失败');
            }
        } catch (e) {
            message.error('操作异常');
        }
    };

    const handleDelete = (fileName: string) => {
        Modal.confirm({
            title: '确认删除该资产？',
            icon: <ExclamationCircleOutlined className="text-red-500" />,
            content: `删除记录 "${fileName}" 后将无法找回，相关对比与填报配置也将失效。`,
            okText: '确认删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                if (!assetLibraryPath) return;
                try {
                    const success = await deleteAssetFile(assetLibraryPath, fileName);
                    if (success) {
                        message.success('资产已移除');
                        fetchAssets();
                        if (focusedFile === fileName) {
                            onFocusFile(null);
                        }
                    }
                } catch (e) {
                    message.error('删除失败');
                }
            }
        });
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Middle: Excel WorkSpace */}
            <div className="flex-none p-3 border-b border-slate-200">
                <FileManager 
                    hiddenAssetButton={true} 
                    onSelectFile={onFocusFile} 
                    focusedFile={focusedFile} 
                />
            </div>

            {/* Bottom Half: Asset Library */}
            <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-3 px-1">
                    <span className="text-[13px] font-semibold text-slate-700">资产库 (Assets)</span>
                    {loading && <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />} />}
                </div>

                <div className="space-y-1.5">
                    {assets.map(info => {
                        const isFocused = focusedFile === info.fileName;
                        const isEditing = editingAsset === info.fileName;
                        const isActive = activeAssets.includes(info.fileName);

                        return (
                            <div 
                                key={info.fileName}
                                onClick={() => !isEditing && onFocusFile(info.fileName)}
                                className={`flex flex-col justify-center py-2 px-2.5 rounded-md border cursor-pointer transition-all group ${
                                    isEditing
                                        ? 'border-blue-400 bg-white ring-1 ring-blue-100'
                                        : isFocused 
                                            ? 'bg-emerald-50/60 border-emerald-400 shadow-sm ring-1 ring-emerald-200' 
                                            : isActive
                                                ? 'bg-emerald-50/20 border-emerald-200 hover:border-emerald-300'
                                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                {isEditing ? (
                                    <div className="flex items-center gap-1.5 w-full">
                                        <Input 
                                            size="small"
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            onPressEnter={() => handleConfirmRename(info.fileName)}
                                            autoFocus
                                            className="flex-1 text-[12px] h-6 px-1.5"
                                        />
                                        <div className="flex items-center gap-0.5">
                                            <Button 
                                                type="text" 
                                                size="small" 
                                                icon={<CheckOutlined className="text-green-600 !text-[12px]" />} 
                                                onClick={(e) => { e.stopPropagation(); handleConfirmRename(info.fileName); }}
                                                className="w-6 h-6 p-0 min-w-0 flex items-center justify-center"
                                            />
                                            <Button 
                                                type="text" 
                                                size="small" 
                                                icon={<CloseOutlined className="text-slate-400 !text-[12px]" />} 
                                                onClick={(e) => { e.stopPropagation(); setEditingAsset(null); }}
                                                className="w-6 h-6 p-0 min-w-0 flex items-center justify-center"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between min-w-0">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <DatabaseOutlined className={isFocused ? 'text-emerald-700 flex-shrink-0' : isActive ? 'text-emerald-500 flex-shrink-0' : 'text-slate-400 flex-shrink-0'} />
                                                <Tooltip title={info.fileName}>
                                                    <span className={`text-[13px] truncate ${isFocused ? 'font-semibold text-emerald-800' : isActive ? 'font-medium text-emerald-700' : 'text-slate-700'}`}>
                                                        {info.fileName}
                                                    </span>
                                                </Tooltip>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                                {!isActive ? (
                                                    <Tooltip title="添加至车型列">
                                                        <Button 
                                                            type="text" 
                                                            size="small"
                                                            icon={<PlusSquareOutlined className="!text-[12px] text-slate-400 hover:text-emerald-600" />}
                                                            onClick={(e) => { e.stopPropagation(); addActiveAsset(info.fileName, info.productName); message.success('已添加到车型列并自动激活'); onFocusFile(null); }}
                                                            className="w-5 h-5 p-0 min-w-0 flex items-center justify-center"
                                                        />
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip title="移出车型列">
                                                        <Button 
                                                            type="text" 
                                                            size="small"
                                                            icon={<MinusSquareOutlined className="!text-[12px] text-emerald-500 hover:text-red-500" />}
                                                            onClick={(e) => { e.stopPropagation(); removeActiveAsset(info.fileName, info.productName); message.info('已从车型列移除'); }}
                                                            className="w-5 h-5 p-0 min-w-0 flex items-center justify-center"
                                                        />
                                                    </Tooltip>
                                                )}
                                                <Tooltip title="重命名">
                                                    <Button 
                                                        type="text" 
                                                        size="small"
                                                        icon={<EditOutlined className="!text-[12px] text-slate-400 hover:text-blue-500" />}
                                                        onClick={(e) => { e.stopPropagation(); handleStartRename(info); }}
                                                        className="w-5 h-5 p-0 min-w-0 flex items-center justify-center"
                                                    />
                                                </Tooltip>
                                                <Tooltip title="删除资产">
                                                    <Button 
                                                        type="text" 
                                                        size="small"
                                                        icon={<DeleteOutlined className="!text-[12px] text-slate-400 hover:text-red-500" />}
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(info.fileName); }}
                                                        className="w-5 h-5 p-0 min-w-0 flex items-center justify-center"
                                                    />
                                                </Tooltip>
                                            </div>
                                        </div>
                                        {info.updatedAt && (
                                            <div className="pl-6 mt-1 text-[11px] text-slate-400 font-mono flex items-center gap-2">
                                                <span>更新: {formatDate(info.updatedAt)}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}
                    {!loading && assets.length === 0 && (
                        <div className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                            资产库空空如也
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DataSourcePanel;
