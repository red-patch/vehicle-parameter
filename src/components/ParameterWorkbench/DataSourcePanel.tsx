import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DatabaseOutlined, LoadingOutlined, EditOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, ExclamationCircleOutlined, PlusSquareOutlined, MinusSquareOutlined, DownloadOutlined, ReloadOutlined, SearchOutlined, TagOutlined, PlusOutlined, FormOutlined, CloudUploadOutlined } from '@ant-design/icons';
import { Spin, Tooltip, Input, Button, Modal, message, Tag, Popover } from 'antd';
import FileManager from './FileManager';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { getAssetFilesWithInfo, renameAssetFile, renameAssetProductName, deleteAssetFile, loadAssetFile, loadAssetTags, setAssetFileTags, type AssetFileInfo } from '../../utils/assetManager';
import { ASSET_SOURCE_META, getAssetSourceMeta, type AssetSourceFilter } from '../../utils/assetSourceTags';
import { downloadCsv } from '../../utils/downloadCsv';
import AssetUpgradeModal from '../AssetLibrary/AssetUpgradeModal';

// 标签颜色池，根据标签内容确定性地分配颜色
const TAG_COLORS = ['blue', 'green', 'orange', 'purple', 'cyan', 'magenta', 'geekblue', 'gold', 'lime', 'volcano'];
const getTagColor = (tag: string) => TAG_COLORS[Math.abs([...tag].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % TAG_COLORS.length];
const SOURCE_FILTER_HOVER_CLASS: Record<string, string> = {
    blue: 'hover:border-blue-300 hover:text-blue-500',
    green: 'hover:border-emerald-300 hover:text-emerald-600',
    cyan: 'hover:border-cyan-300 hover:text-cyan-600',
    purple: 'hover:border-purple-300 hover:text-purple-600',
};

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
        renameAssetProduct,
        selectedProductNames
    } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        uploadedFiles: state.uploadedFiles,
        activeAssets: state.activeAssets,
        addActiveAsset: state.addActiveAsset,
        removeActiveAsset: state.removeActiveAsset,
        renameActiveAsset: state.renameActiveAsset,
        renameAssetProduct: state.renameAssetProduct,
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
    const [editMode, setEditMode] = useState<'file' | 'product' | null>(null);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [sourceFilter, setSourceFilter] = useState<AssetSourceFilter>('all');

    // 标签系统
    const [assetTags, setAssetTags] = useState<Record<string, string[]>>({});
    const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
    const [tagEditingAsset, setTagEditingAsset] = useState<string | null>(null);
    const [newTagInput, setNewTagInput] = useState('');
    const [upgradeAsset, setUpgradeAsset] = useState<AssetFileInfo | null>(null);

    const fetchAssets = useCallback(async () => {
        if (!assetLibraryPath) return;
        setLoading(true);
        try {
            const [infos, tags] = await Promise.all([
                getAssetFilesWithInfo(assetLibraryPath),
                loadAssetTags(assetLibraryPath)
            ]);
            // 按照更新时间倒序
            infos.sort((a, b) => {
                if (!a.updatedAt) return 1;
                if (!b.updatedAt) return -1;
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            });
            setAssets(infos);
            setAssetTags(tags);
        } catch (err) {
            console.error("Failed to load assets with info", err);
        } finally {
            setLoading(false);
        }
    }, [assetLibraryPath]);

    useEffect(() => {
        fetchAssets();
    }, [assetLibraryPath, uploadedFiles]); // Re-fetch if files uploaded

    const handleStartFileRename = (info: AssetFileInfo) => {
        setEditingAsset(info.fileName);
        setEditName(info.fileName.replace(/\.json$/i, ''));
        setEditMode('file');
    };

    const handleStartProductRename = (info: AssetFileInfo) => {
        setEditingAsset(info.fileName);
        setEditName(info.productName);
        setEditMode('product');
    };

    const handleCancelRename = () => {
        setEditingAsset(null);
        setEditName('');
        setEditMode(null);
    };

    const handleConfirmFileRename = async (info: AssetFileInfo) => {
        if (!editName.trim() || !assetLibraryPath) return;
        const oldFileName = info.fileName;
        const newFileName = editName.trim().endsWith('.json') ? editName.trim() : `${editName.trim()}.json`;
        
        if (newFileName === oldFileName) {
            handleCancelRename();
            return;
        }

        try {
            const success = await renameAssetFile(assetLibraryPath, oldFileName, newFileName);
            if (success) {
                if (activeAssets.includes(oldFileName)) {
                    renameActiveAsset(oldFileName, newFileName, info.productName);
                }

                message.success('资产文件重命名成功');
                handleCancelRename();
                fetchAssets();
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

    const handleConfirmProductRename = async (info: AssetFileInfo) => {
        if (!editName.trim() || !assetLibraryPath) return;
        const newProductName = editName.trim();

        if (newProductName === info.productName) {
            handleCancelRename();
            return;
        }

        try {
            const success = await renameAssetProductName(assetLibraryPath, info.fileName, newProductName);
            if (success) {
                renameAssetProduct(info.fileName, info.productName, newProductName);
                message.success('车型名称更新成功');
                handleCancelRename();
                fetchAssets();
            } else {
                message.error('车型名称更新失败');
            }
        } catch (e) {
            console.error(e);
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

    const handleOpenUpgradeModal = (info: AssetFileInfo) => {
        setUpgradeAsset(info);
    };

    const handleExportCsv = async (info: AssetFileInfo) => {
        if (!assetLibraryPath) return;
        try {
            const data = await loadAssetFile(assetLibraryPath, info.fileName);
            if (!data || data.data.length === 0) {
                message.warning('该资产无可导出的数据');
                return;
            }
            const header = '分组,参数名,参数值';
            const rows = data.data.map(p => {
                const escape = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
                return [escape(p.group || ''), escape(p.name || ''), escape(String(p.value ?? ''))].join(',');
            });
            const csvContent = [header, ...rows].join('\n');
            const csvFileName = info.fileName.replace(/\.json$/i, '.csv');
            await downloadCsv(csvContent, csvFileName);
        } catch (e) {
            message.error('导出失败');
        }
    };

    // 标签管理
    const handleAddTag = async (fileName: string, tag: string) => {
        if (!assetLibraryPath || !tag.trim()) return;
        const trimmed = tag.trim();
        const current = assetTags[fileName] || [];
        if (current.includes(trimmed)) return;
        const updated = [...current, trimmed];
        setAssetTags(prev => ({ ...prev, [fileName]: updated }));
        await setAssetFileTags(assetLibraryPath, fileName, updated);
    };

    const handleRemoveTag = async (fileName: string, tag: string) => {
        if (!assetLibraryPath) return;
        const current = assetTags[fileName] || [];
        const updated = current.filter(t => t !== tag);
        setAssetTags(prev => {
            const next = { ...prev };
            if (updated.length === 0) delete next[fileName];
            else next[fileName] = updated;
            return next;
        });
        await setAssetFileTags(assetLibraryPath, fileName, updated);
    };

    const toggleFilterTag = (tag: string) => {
        setSelectedFilterTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    // 全局标签集合
    const allTags = useMemo(() => {
        const set = new Set<string>();
        Object.values(assetTags).forEach(tags => tags.forEach(t => set.add(t)));
        return Array.from(set).sort();
    }, [assetTags]);

    const availableSourceFilters = useMemo(() => {
        const present = new Set<AssetSourceFilter>();
        assets.forEach(asset => {
            const sourceMeta = getAssetSourceMeta(assetTags[asset.fileName] || []);
            if (sourceMeta) present.add(sourceMeta.filter);
        });

        return (Object.values(ASSET_SOURCE_META)).filter(source => present.has(source.filter));
    }, [assets, assetTags]);

    // 按关键字 + 标签过滤资产列表
    const filteredAssets = useMemo(() => {
        let result = assets;

        if (sourceFilter !== 'all') {
            result = result.filter(asset => {
                const sourceMeta = getAssetSourceMeta(assetTags[asset.fileName] || []);
                return sourceMeta?.filter === sourceFilter;
            });
        }

        // 标签过滤（取交集）
        if (selectedFilterTags.length > 0) {
            result = result.filter(a => {
                const tags = assetTags[a.fileName] || [];
                return selectedFilterTags.every(ft => tags.includes(ft));
            });
        }

        // 关键字过滤（同时匹配文件名、产品名、标签）
        if (searchKeyword.trim()) {
            const kw = searchKeyword.trim().toLowerCase();
            result = result.filter(a => {
                const tags = assetTags[a.fileName] || [];
                return a.fileName.toLowerCase().includes(kw) ||
                    a.productName.toLowerCase().includes(kw) ||
                    tags.some(t => t.toLowerCase().includes(kw));
            });
        }

        return result;
    }, [assets, searchKeyword, selectedFilterTags, assetTags, sourceFilter]);

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
                <div className="flex justify-between items-center mb-3 px-1">
                    <div className="flex items-center gap-2">
                        <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                        <span className="text-[14px] font-bold text-slate-800 tracking-tight">资产库 (Assets)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {loading && <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />} />}
                        <Tooltip title="刷新资产库">
                            <Button
                                type="text"
                                size="small"
                                icon={<ReloadOutlined className={`!text-[14px] text-slate-400 hover:text-blue-500 ${loading ? 'animate-spin' : ''}`} />}
                                onClick={fetchAssets}
                                disabled={loading}
                                className="w-7 h-7 p-0 min-w-0 flex items-center justify-center rounded-lg hover:bg-blue-50"
                            />
                        </Tooltip>
                    </div>
                </div>

                {/* 搜索框 */}
                {assets.length > 5 && (
                    <div className="mb-3 px-1 space-y-2">
                        <Input
                            size="small"
                            placeholder="搜索资产、标签..."
                            prefix={<SearchOutlined className="text-slate-300" />}
                            allowClear
                            value={searchKeyword}
                            onChange={e => setSearchKeyword(e.target.value)}
                            className="rounded-lg border-slate-200 hover:border-blue-300 focus:border-blue-400"
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                            {availableSourceFilters.map(source => (
                                <Tag
                                    key={source.filter}
                                    color={sourceFilter === source.filter ? source.color : undefined}
                                    onClick={() => setSourceFilter(prev => prev === source.filter ? 'all' : source.filter)}
                                    className={`cursor-pointer text-[10px] m-0 px-2 py-0 leading-[20px] rounded-md border transition-all select-none ${
                                        sourceFilter === source.filter
                                            ? 'font-bold shadow-sm'
                                            : `bg-slate-50 border-slate-200 text-slate-500 ${SOURCE_FILTER_HOVER_CLASS[source.color]}`
                                    }`}
                                >
                                    {source.label}
                                </Tag>
                            ))}
                            {sourceFilter !== 'all' && (
                                <span
                                    className="text-[10px] text-blue-500 cursor-pointer hover:underline"
                                    onClick={() => setSourceFilter('all')}
                                >
                                    取消来源筛选
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* 标签过滤栏 */}
                {allTags.length > 0 && (
                    <div className="mb-3 px-1 flex flex-wrap gap-1.5 items-center">
                        <TagOutlined className="text-[11px] text-slate-300 mr-0.5" />
                        {allTags.map(tag => (
                            <Tag
                                key={tag}
                                color={selectedFilterTags.includes(tag) ? getTagColor(tag) : undefined}
                                onClick={() => toggleFilterTag(tag)}
                                className={`cursor-pointer text-[10px] m-0 px-1.5 py-0 leading-[18px] rounded-md border transition-all select-none ${
                                    selectedFilterTags.includes(tag)
                                        ? 'font-bold shadow-sm'
                                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-500'
                                }`}
                            >
                                {tag}
                            </Tag>
                        ))}
                        {selectedFilterTags.length > 0 && (
                            <>
                                <span
                                    className="text-[10px] text-blue-500 cursor-pointer hover:underline ml-1"
                                    onClick={() => setSelectedFilterTags([])}
                                >
                                    清除筛选
                                </span>
                                <span
                                    className="text-[10px] text-emerald-600 cursor-pointer hover:underline ml-1 font-medium"
                                    onClick={() => {
                                        const toActivate = filteredAssets.filter(a => !selectedProductNames.includes(a.productName));
                                        if (toActivate.length === 0) {
                                            message.info('筛选结果中的资产均已激活');
                                            return;
                                        }
                                        toActivate.forEach(a => addActiveAsset(a.fileName, a.productName));
                                        message.success(`已批量激活 ${toActivate.length} 个资产到车型大纲`);
                                    }}
                                >
                                    ⚡ 批量激活 ({filteredAssets.filter(a => !selectedProductNames.includes(a.productName)).length})
                                </span>
                            </>
                        )}
                    </div>
                )}

                <div className="space-y-2">
                    {filteredAssets.map(info => {
                        const isFocused = focusedFile === info.fileName;
                        const isEditing = editingAsset === info.fileName;
                        // 智能感知：如果该资产下的车型已在工作集中，则视为激活
                        const isActive = selectedProductNames.includes(info.productName);
                        const sourceMeta = getAssetSourceMeta(assetTags[info.fileName] || []);

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
                                            onPressEnter={() => {
                                                if (editMode === 'product') handleConfirmProductRename(info);
                                                else handleConfirmFileRename(info);
                                            }}
                                            autoFocus
                                            placeholder={editMode === 'product' ? '输入车型名称' : '输入资产文件名'}
                                            className="flex-1 text-[13px] h-7 px-2 border-blue-200 focus:border-blue-500"
                                        />
                                        <div className="flex items-center gap-0.5">
                                            <Button 
                                                type="text" 
                                                size="small" 
                                                icon={<CheckOutlined className="text-green-600 !text-[12px]" />} 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (editMode === 'product') handleConfirmProductRename(info);
                                                    else handleConfirmFileRename(info);
                                                }}
                                                className="w-6 h-6 p-0 min-w-0 flex items-center justify-center"
                                            />
                                            <Button 
                                                type="text" 
                                                size="small" 
                                                icon={<CloseOutlined className="text-slate-400 !text-[12px]" />} 
                                                onClick={(e) => { e.stopPropagation(); handleCancelRename(); }}
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
                                                <div className="min-w-0 flex items-center gap-1.5">
                                                    {sourceMeta && (
                                                        <Tag color={sourceMeta.color} className="m-0 text-[9px] leading-[14px] px-1.5 rounded-md border-0">
                                                            {sourceMeta.label}
                                                        </Tag>
                                                    )}
                                                    <Tooltip title={info.fileName}>
                                                        <span className={`text-[13px] truncate tracking-tight ${isFocused ? 'font-bold text-slate-900' : isActive ? 'font-semibold text-emerald-800' : 'text-slate-700'}`}>
                                                            {info.fileName}
                                                        </span>
                                                    </Tooltip>
                                                </div>
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
                                                <Tooltip title="导出 CSV">
                                                    <Button 
                                                        type="text" 
                                                        size="small"
                                                        icon={<DownloadOutlined className="!text-[14px] text-slate-400 hover:text-emerald-500" />}
                                                        onClick={(e) => { e.stopPropagation(); handleExportCsv(info); }}
                                                        className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md hover:bg-emerald-50"
                                                    />
                                                </Tooltip>
                                                <Tooltip title="重命名">
                                                    <Button 
                                                        type="text" 
                                                        size="small"
                                                        icon={<EditOutlined className="!text-[14px] text-slate-400 hover:text-blue-500" />}
                                                        onClick={(e) => { e.stopPropagation(); handleStartFileRename(info); }}
                                                        className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md hover:bg-blue-50"
                                                    />
                                                </Tooltip>
                                                <Tooltip title="更新车型名称">
                                                    <Button 
                                                        type="text" 
                                                        size="small"
                                                        icon={<FormOutlined className="!text-[14px] text-slate-400 hover:text-emerald-600" />}
                                                        onClick={(e) => { e.stopPropagation(); handleStartProductRename(info); }}
                                                        className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md hover:bg-emerald-50"
                                                    />
                                                </Tooltip>
                                                <Tooltip title="升级导入">
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<CloudUploadOutlined className="!text-[14px] text-slate-400 hover:text-violet-600" />}
                                                        onClick={(e) => { e.stopPropagation(); handleOpenUpgradeModal(info); }}
                                                        className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md hover:bg-violet-50"
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
                                        <div className="pl-[42px] mt-1 text-[11px] text-slate-400 truncate" title={info.productName}>
                                            车型名: {info.productName}
                                        </div>
                                        {/* 标签行 */}
                                        <div className="pl-[42px] mt-1.5 flex items-center gap-1 flex-wrap">
                                            {(assetTags[info.fileName] || []).map(tag => (
                                                <Tag
                                                    key={tag}
                                                    color={getTagColor(tag)}
                                                    closable
                                                    onClose={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveTag(info.fileName, tag); }}
                                                    className="text-[9px] m-0 px-1.5 py-0 leading-[16px] rounded-md"
                                                >
                                                    {tag}
                                                </Tag>
                                            ))}
                                            <Popover
                                                open={tagEditingAsset === info.fileName}
                                                onOpenChange={(open) => { if (!open) { setTagEditingAsset(null); setNewTagInput(''); } }}
                                                trigger="click"
                                                placement="bottomLeft"
                                                content={
                                                    <div className="w-48" onClick={e => e.stopPropagation()}>
                                                        <div className="text-[11px] font-bold text-slate-500 mb-2">添加标签</div>
                                                        <Input
                                                            size="small"
                                                            placeholder="输入标签名称…"
                                                            value={newTagInput}
                                                            autoFocus
                                                            onChange={e => setNewTagInput(e.target.value)}
                                                            onPressEnter={() => {
                                                                if (newTagInput.trim()) {
                                                                    handleAddTag(info.fileName, newTagInput);
                                                                    setNewTagInput('');
                                                                }
                                                            }}
                                                            className="mb-2"
                                                        />
                                                        {/* 已有标签快速选择 */}
                                                        {allTags.filter(t => !(assetTags[info.fileName] || []).includes(t)).length > 0 && (
                                                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                                                {allTags.filter(t => !(assetTags[info.fileName] || []).includes(t)).map(t => (
                                                                    <Tag
                                                                        key={t}
                                                                        color={getTagColor(t)}
                                                                        className="cursor-pointer text-[10px] m-0 px-1.5 py-0 leading-[18px] rounded-md hover:opacity-80"
                                                                        onClick={() => handleAddTag(info.fileName, t)}
                                                                    >
                                                                        + {t}
                                                                    </Tag>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                }
                                            >
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); setTagEditingAsset(info.fileName); }}
                                                    className="w-4 h-4 rounded border border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-blue-400 hover:text-blue-400 text-slate-300 transition-colors"
                                                >
                                                    <PlusOutlined className="!text-[8px]" />
                                                </div>
                                            </Popover>
                                            {info.updatedAt && (
                                                <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1 opacity-80 ml-auto">
                                                    <EditOutlined className="text-[10px]"/> {formatDate(info.updatedAt)}
                                                </span>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                    {!loading && filteredAssets.length === 0 && (
                        <div className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">
                            {searchKeyword.trim() ? '没有匹配的资产' : '资产库空空如也'}
                        </div>
                    )}
                </div>
            </div>

            <AssetUpgradeModal
                open={Boolean(upgradeAsset)}
                assetInfo={upgradeAsset}
                assetTags={upgradeAsset ? (assetTags[upgradeAsset.fileName] || []) : []}
                onClose={() => setUpgradeAsset(null)}
                onSaved={fetchAssets}
            />
        </div>
    );
};

export default DataSourcePanel;
