import React, { useState, useEffect, useRef } from 'react';
import { Drawer, Input, List, Button, message, Tooltip } from 'antd';
import { CloudDownloadOutlined, SearchOutlined, FolderOpenOutlined, EditOutlined, DeleteOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { getAssetFiles, loadAssetFile, renameAssetFile, deleteAssetFile } from '../../utils/assetManager';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';

interface AssetListDrawerProps {
    visible: boolean;
    onClose: () => void;
}

const AssetListDrawer: React.FC<AssetListDrawerProps> = ({ visible, onClose }) => {
    const { assetLibraryPath, addFile, uploadedFiles, renameFileName } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        addFile: state.addFile,
        uploadedFiles: state.uploadedFiles,
        renameFileName: state.renameFileName,
    })));
    const [files, setFiles] = useState<string[]>([]);
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Rename State
    const [editingFile, setEditingFile] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const renameInputRef = useRef<any>(null);

    // 进入编辑时聚焦一次，避免 autoFocus 每次渲染重置光标
    useEffect(() => {
        if (editingFile && renameInputRef.current) {
            setTimeout(() => renameInputRef.current?.focus(), 0);
        }
    }, [editingFile]);

    useEffect(() => {
        if (visible && assetLibraryPath) {
            loadFiles();
        }
    }, [visible, assetLibraryPath]);

    const loadFiles = async () => {
        setLoading(true);
        try {
            const list = await getAssetFiles(assetLibraryPath!);
            setFiles(list.sort((a, b) => b.localeCompare(a)));
        } catch (error) {
            console.error('获取资产列表失败', error);
            message.error('获取资产列表失败');
        } finally {
            setLoading(false);
        }
    };

    const handleLoadAsset = async (fileName: string) => {
        if (!assetLibraryPath) return;
        
        try {
            const sheetData = await loadAssetFile(assetLibraryPath, fileName);
            if (sheetData) {
                addFile(sheetData);
                message.success(`已闪电极速加载: ${fileName.replace('.json', '')}`);
                onClose();
            } else {
                message.error('加载资产失败，文件可能已损坏或移动');
            }
        } catch (error) {
            console.error('加载失败', error);
            message.error('加载资产失败');
        }
    };

    const handleDeleteAsset = async (e: React.MouseEvent, fileName: string) => {
        e.stopPropagation();
        if (!assetLibraryPath) return;
        
        try {
            const success = await deleteAssetFile(assetLibraryPath, fileName);
            if (success) {
                message.success(`已删除资产: ${fileName}`);
                loadFiles(); // 刷新列表
            } else {
                message.error('删除资产失败，文件可能不存在');
            }
        } catch (error) {
            console.error('删除失败', error);
            message.error('删除资产时发生意外错误');
        }
    };

    const handleStartRename = (e: React.MouseEvent, fileName: string) => {
        e.stopPropagation();
        setEditingFile(fileName);
        // 去掉 .json 后缀以便编辑
        setEditName(fileName.replace('.json', ''));
    };

    const handleConfirmRename = async (e: React.MouseEvent | React.KeyboardEvent, oldFileName: string) => {
        e.stopPropagation();
        if (!assetLibraryPath || !editName.trim()) return;
        
        const newNameClean = editName.trim();
        const oldNameClean = oldFileName.replace('.json', '');
        
        if (newNameClean === oldNameClean) {
            setEditingFile(null);
            return;
        }

        try {
            const success = await renameAssetFile(assetLibraryPath, oldFileName, newNameClean);
            if (success) {
                message.success('重命名成功');
                setEditingFile(null);
                loadFiles(); // 刷新列表
                
                // 补充数据联动逻辑：如果重命名的且已被加载到数据池，同步更新池内名称
                const finalOldName = oldFileName.endsWith('.json') ? oldFileName : `${oldFileName}.json`;
                const finalNewName = newNameClean.endsWith('.json') ? newNameClean : `${newNameClean}.json`;
                
                if (uploadedFiles.some(f => f.fileName === finalOldName)) {
                    renameFileName(finalOldName, finalNewName);
                }

            } else {
                message.error('重命名失败，名称可能已存在');
            }
        } catch (error) {
            console.error('重命名失败', error);
            message.error('重命名时发生意外错误');
        }
    };

    const handleCancelRename = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingFile(null);
    };

    const filteredFiles = files.filter(f => f.toLowerCase().includes(searchText.toLowerCase()));

    return (
        <Drawer
            title={
                <div className="flex items-center gap-2 text-1">
                    <FolderOpenOutlined className="text-brand" />
                    <span>我的资产中心</span>
                </div>
            }
            placement="left"
            width={340}
            onClose={onClose}
            open={visible}
            bodyStyle={{ padding: '16px 12px' }}
        >
            {!assetLibraryPath ? (
                <div className="text-center mt-10 text-3">
                    请先在应用右上角("设置")配置您的资产库路径
                </div>
            ) : (
                <div className="flex flex-col h-full">
                    <Input
                        placeholder="搜索车型资产..."
                        prefix={<SearchOutlined className="text-3" />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        className="mb-4"
                        allowClear
                    />
                    
                    <div className="flex-1 overflow-auto">
                        <List
                            loading={loading}
                            dataSource={filteredFiles}
                            size="small"
                            renderItem={item => {
                                const isEditing = editingFile === item;
                                
                                return (
                                    <List.Item
                                        className={`hover:bg-brand-weak transition-colors group px-3 py-2 rounded mb-1 border ${isEditing ? 'border-brand bg-brand-weak' : 'border-transparent hover:border-blue-100'} ${!isEditing && ''}`}
                                        onClick={() => {
                                            if (!isEditing) handleLoadAsset(item);
                                        }}
                                    >
                                        <div className="flex items-center justify-between w-full gap-2">
                                            {isEditing ? (
                                                <div className="flex items-center w-full gap-2" onClick={e => e.stopPropagation()}>
                                                    <Input 
                                                        ref={renameInputRef}
                                                        size="small"
                                                        value={editName}
                                                        onChange={e => setEditName(e.target.value)}
                                                        onPressEnter={(e) => handleConfirmRename(e, item)}
                                                        className="flex-1 text-sm"
                                                    />
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        <Button 
                                                            type="text" 
                                                            size="small" 
                                                            icon={<CheckOutlined className="text-success" />} 
                                                            onClick={(e) => handleConfirmRename(e, item)}
                                                        />
                                                        <Button 
                                                            type="text" 
                                                            size="small" 
                                                            icon={<CloseOutlined className="text-3" />} 
                                                            onClick={handleCancelRename}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span className="text-sm font-medium text-2 truncate" title={item}>
                                                            {item.replace('.json', '')}
                                                        </span>
                                                        <span className="text-[10px] text-3 mt-0.5">.json 孪生档案</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                                        <Tooltip title="重命名">
                                                            <Button 
                                                                type="text" 
                                                                size="small" 
                                                                icon={<EditOutlined className="text-3 hover:text-brand" />} 
                                                                onClick={(e) => handleStartRename(e, item)}
                                                            />
                                                        </Tooltip>
                                                        <Tooltip title="一键加入工作台">
                                                            <Button 
                                                                type="text" 
                                                                size="small" 
                                                                icon={<CloudDownloadOutlined className="text-brand" />} 
                                                            />
                                                        </Tooltip>
                                                        <Tooltip title="删除档案">
                                                            <Button 
                                                                type="text" 
                                                                size="small" 
                                                                danger
                                                                icon={<DeleteOutlined />} 
                                                                onClick={(e) => handleDeleteAsset(e, item)}
                                                            />
                                                        </Tooltip>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </List.Item>
                                );
                            }}
                            locale={{ emptyText: '暂无符合条件的资产数据' }}
                        />
                    </div>
                </div>
            )}
        </Drawer>
    );
};

export default AssetListDrawer;
