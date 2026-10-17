import React, { useState, useEffect, useRef } from 'react';
import { Drawer, Input, List, Button, message, Tooltip, Modal, Tag } from 'antd';
import GuideEmpty from '../common/GuideEmpty';
import { LIBRARY_PATH_MISSING_TEXT, openLibraryPathSettings } from '../../utils/libraryPathPrompt';
import type { InputRef } from 'antd';
import { CloudDownloadOutlined, SearchOutlined, FolderOpenOutlined, EditOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, UndoOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { getAssetFiles, loadAssetFile, renameAssetFile, archiveAssetFile, loadAssetMeta, saveAssetMeta, type AssetMetaMap } from '../../utils/assetManager';
import { buildDeprecateMeta, buildRestoreMeta } from '../../utils/assetGovernance';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';

interface AssetListDrawerProps {
    visible: boolean;
    onClose: () => void;
}

const AssetListDrawer: React.FC<AssetListDrawerProps> = ({ visible, onClose }) => {
    const { assetLibraryPath, addFile, uploadedFiles, renameFileName, removeActiveAsset, bumpAssetVersion } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        addFile: state.addFile,
        uploadedFiles: state.uploadedFiles,
        renameFileName: state.renameFileName,
        removeActiveAsset: state.removeActiveAsset,
        bumpAssetVersion: state.bumpAssetVersion,
    })));
    const [files, setFiles] = useState<string[]>([]);
    const [metaMap, setMetaMap] = useState<AssetMetaMap>({});
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Rename State
    const [editingFile, setEditingFile] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const renameInputRef = useRef<InputRef>(null);

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
            const [list, meta] = await Promise.all([
                getAssetFiles(assetLibraryPath!),
                loadAssetMeta(assetLibraryPath!),
            ]);
            setFiles(list.sort((a, b) => b.localeCompare(a)));
            setMetaMap(meta);
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

    // 软删除（ADR-0002）：标记废弃并隐藏，文件保留可恢复
    const handleDeleteAsset = (e: React.MouseEvent, fileName: string) => {
        e.stopPropagation();
        if (!assetLibraryPath) return;
        Modal.confirm({
            title: '确认删除该资产？',
            icon: <ExclamationCircleOutlined className="text-danger" />,
            content: `「${fileName}」将标记为废弃并从资产库列表隐藏（文件保留、可恢复）。彻底删除请在废弃后使用「归档清理」。`,
            okText: '确认删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    await saveAssetMeta(assetLibraryPath, buildDeprecateMeta(metaMap, [fileName]));
                    removeActiveAsset(fileName, fileName.replace(/\.json$/i, ''));
                    bumpAssetVersion();
                    message.success(`已标记废弃: ${fileName}（可恢复）`);
                    loadFiles();
                } catch (error) {
                    console.error('删除失败', error);
                    message.error('删除资产时发生意外错误');
                }
            }
        });
    };

    // 恢复：清除废弃/历史标记
    const handleRestoreAsset = async (e: React.MouseEvent, fileName: string) => {
        e.stopPropagation();
        if (!assetLibraryPath) return;
        try {
            await saveAssetMeta(assetLibraryPath, buildRestoreMeta(metaMap, [fileName]));
            bumpAssetVersion();
            message.success(`已恢复: ${fileName}`);
            loadFiles();
        } catch (error) {
            console.error('恢复失败', error);
            message.error('恢复资产时发生意外错误');
        }
    };

    // 彻底删除 = 归档清理：移入 _archive/ 并清除标注
    const handleArchiveAsset = (e: React.MouseEvent, fileName: string) => {
        e.stopPropagation();
        if (!assetLibraryPath) return;
        Modal.confirm({
            title: '彻底删除该资产？',
            icon: <ExclamationCircleOutlined className="text-danger" />,
            content: `「${fileName}」将移入归档目录 _archive/，标签与治理标注一并清除。此操作不可在界面内撤销。`,
            okText: '彻底删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    const success = await archiveAssetFile(assetLibraryPath, fileName);
                    if (success) {
                        removeActiveAsset(fileName, fileName.replace(/\.json$/i, ''));
                        bumpAssetVersion();
                        message.success(`已归档清理: ${fileName}`);
                        loadFiles();
                    } else {
                        message.error('归档失败，文件可能不存在');
                    }
                } catch (error) {
                    console.error('归档失败', error);
                    message.error('归档资产时发生意外错误');
                }
            }
        });
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
                <GuideEmpty
                    title={LIBRARY_PATH_MISSING_TEXT}
                    action={<Button onClick={openLibraryPathSettings}>设置资产库目录</Button>}
                />
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
                                        className={`hover:bg-brand-weak transition-colors group px-3 py-2 rounded mb-1 border ${isEditing ? 'border-brand bg-brand-weak' : 'border-transparent hover:border-[color:var(--border-strong)]'} ${!isEditing && ''}`}
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
                                                        {metaMap[item]?.status && (
                                                            <span className="text-[10px] text-3 mt-0.5">
                                                                {metaMap[item]?.status === 'deprecated' && (
                                                                    <Tag className="m-0 text-[10px] leading-[14px] px-1" color="error">废弃</Tag>
                                                                )}
                                                                {metaMap[item]?.status === 'superseded' && (
                                                                    <Tag className="m-0 text-[10px] leading-[14px] px-1" color="default">历史</Tag>
                                                                )}
                                                            </span>
                                                        )}
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
                                                        {metaMap[item]?.status ? (
                                                            <>
                                                                <Tooltip title="恢复（清除标记）">
                                                                    <Button
                                                                        type="text"
                                                                        size="small"
                                                                        icon={<UndoOutlined className="text-3 hover:text-brand" />}
                                                                        onClick={(e) => handleRestoreAsset(e, item)}
                                                                    />
                                                                </Tooltip>
                                                                <Tooltip title="彻底删除（归档）">
                                                                    <Button
                                                                        type="text"
                                                                        size="small"
                                                                        danger
                                                                        icon={<DeleteOutlined />}
                                                                        onClick={(e) => handleArchiveAsset(e, item)}
                                                                    />
                                                                </Tooltip>
                                                            </>
                                                        ) : (
                                                            <Tooltip title="删除档案（可恢复）">
                                                                <Button
                                                                    type="text"
                                                                    size="small"
                                                                    danger
                                                                    icon={<DeleteOutlined />}
                                                                    onClick={(e) => handleDeleteAsset(e, item)}
                                                                />
                                                            </Tooltip>
                                                        )}
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
