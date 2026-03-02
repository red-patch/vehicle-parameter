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
    const { 
        assetLibraryPath, 
        uploadedFiles, 
        activeAssets, 
        addActiveAsset, 
        removeActiveAsset, 
        renameActiveAsset,
        selectedProductNames
    } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        uploadedFiles: state.uploadedFiles,
        activeAssets: state.activeAssets,
        addActiveAsset: state.addActiveAsset,
        removeActiveAsset: state.removeActiveAsset,
        renameActiveAsset: state.renameActiveAsset,
        selectedProductNames: state.selectedProductNames
    })));

    // 智能联动逻辑：根据当前选中的车型，判断某个资产是否处于“激活”状态
    // 此处定义：如果该资产内含的车型（通常为 info.productName）已在 selectedProductNames 中，则视为已激活
    // 注意：如果是单文件多车型，这里可能需要更复杂的 mapped 逻辑，目前先处理 1:1 场景或首选名称匹配

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
                // 同步内存状态：若该资产已激活，更新其在 activeAssets 中的索引
                if (activeAssets.includes(oldFileName)) {
                    // newFileName 对应的默认 productName 通常也是去掉扩展名后的名字
                    renameActiveAsset(oldFileName, newFileName, newFileName.replace(/\.json$/i, ''));
                }

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

    const handleToggleAsset = (info: AssetFileInfo, currentlyActive: boolean) => {
        if (!currentlyActive) {
            // 一键激活：添加到 activeAssets 并勾选该车型
            addActiveAsset(info.fileName, info.productName);
            message.success(`已激活资产：${info.productName}`);
        } else {
            // 一键移出：从工作集和激活列表中移除
            removeActiveAsset(info.fileName, info.productName);
            message.info(`已停用资产：${info.productName}`);
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
        <div className="flex flex-col h-full bg-slate-50/40 backdrop-blur-sm">
            {/* Middle: Excel WorkSpace */}
            <div className="flex-none p-4 border-b border-slate-200/60 bg-white/40">
                <FileManager 
                    hiddenAssetButton={true} 
                    onSelectFile={onFocusFile} 
                    focusedFile={focusedFile} 
                />
            </div>

            {/* Bottom Half: Asset Library */}
            <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-4 px-1">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                        <span className="text-[14px] font-bold text-slate-800 tracking-tight">资产库 (Assets)</span>
                    </div>
                    {loading && <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />} />}
                </div>

                <div className="space-y-2">
                    {assets.map(info => {
                        const isFocused = focusedFile === info.fileName;
                        const isEditing = editingAsset === info.fileName;
                        // 智能感知：如果该资产下的车型已在工作集中，则视为激活
                        const isActive = selectedProductNames.includes(info.productName);

                        return (
                            <div 
                                key={info.fileName}
                                onClick={() => !isEditing && onFocusFile(info.fileName)}
                                className={`flex flex-col justify-center py-3 px-3.5 rounded-xl border cursor-pointer transition-all duration-200 group relative ${
                                    isEditing
                                        ? 'border-blue-400 bg-white shadow-md ring-1 ring-blue-100'
                                        : isFocused 
                                            ? 'bg-white border-blue-500 shadow-[0_4px_12px_rgba(59,130,246,0.08)] -translate-y-0.5' 
                                            : isActive
                                                ? 'bg-emerald-50/30 border-emerald-200/60'
                                                : 'bg-white/60 border-slate-200/60 hover:border-slate-300 hover:bg-white hover:shadow-sm hover:-translate-y-0.5'
                                }`}
                            >
                                {isEditing ? (
                                    <div className="flex items-center gap-2 w-full">
                                        <Input 
                                            size="small"
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            onPressEnter={() => handleConfirmRename(info.fileName)}
                                            autoFocus
                                            className="flex-1 text-[13px] h-7 px-2 border-blue-200 focus:border-blue-500"
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
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <Tooltip title={isActive ? "点击快速停用该资产" : "点击快速激活该资产"}>
                                                    <div 
                                                        onClick={(e) => { e.stopPropagation(); handleToggleAsset(info, isActive); }}
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 active:scale-95 ${
                                                            isFocused ? 'bg-blue-500 text-white shadow-lg shadow-blue-200' : isActive ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                                        }`}
                                                    >
                                                        <DatabaseOutlined className="text-[14px]" />
                                                    </div>
                                                </Tooltip>
                                                <Tooltip title={info.fileName}>
                                                    <span className={`text-[13px] truncate tracking-tight ${isFocused ? 'font-bold text-slate-900' : isActive ? 'font-semibold text-emerald-800' : 'text-slate-700'}`}>
                                                        {info.fileName}
                                                    </span>
                                                </Tooltip>
                                            </div>
                                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-1 group-hover:translate-x-0 ml-2">
                                                {!isActive ? (
                                                    <Tooltip title="添加至车型列">
                                                        <Button 
                                                            type="text" 
                                                            size="small"
                                                            icon={<PlusSquareOutlined className="!text-[14px] text-slate-400 hover:text-blue-600" />}
                                                            onClick={(e) => { e.stopPropagation(); handleToggleAsset(info, false); onFocusFile(null); }}
                                                            className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md hover:bg-blue-50"
                                                        />
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip title="移出车型列">
                                                        <Button 
                                                            type="text" 
                                                            size="small"
                                                            icon={<MinusSquareOutlined className="!text-[14px] text-emerald-500 hover:text-red-500" />}
                                                            onClick={(e) => { e.stopPropagation(); handleToggleAsset(info, true); }}
                                                            className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md hover:bg-emerald-50"
                                                        />
                                                    </Tooltip>
                                                )}
                                                <Tooltip title="重命名">
                                                    <Button 
                                                        type="text" 
                                                        size="small"
                                                        icon={<EditOutlined className="!text-[14px] text-slate-400 hover:text-blue-500" />}
                                                        onClick={(e) => { e.stopPropagation(); handleStartRename(info); }}
                                                        className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md hover:bg-blue-50"
                                                    />
                                                </Tooltip>
                                                <Tooltip title="删除资产">
                                                    <Button 
                                                        type="text" 
                                                        size="small"
                                                        icon={<DeleteOutlined className="!text-[14px] text-slate-400 hover:text-red-500" />}
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(info.fileName); }}
                                                        className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md hover:bg-red-50"
                                                    />
                                                </Tooltip>
                                            </div>
                                        </div>
                                        {info.updatedAt && (
                                            <div className="pl-[42px] mt-1.5 text-[10px] text-slate-400 font-medium flex items-center gap-3">
                                                <span className="flex items-center gap-1 opacity-80"><EditOutlined className="text-[10px]"/> {formatDate(info.updatedAt)}</span>
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
