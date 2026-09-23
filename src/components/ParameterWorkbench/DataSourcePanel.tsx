import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DatabaseOutlined, LoadingOutlined, EditOutlined, DeleteOutlined, CheckOutlined, ExclamationCircleOutlined, PlusSquareOutlined, MinusSquareOutlined, DownloadOutlined, ReloadOutlined, SearchOutlined, TagOutlined, CloudUploadOutlined, CopyOutlined, FolderOpenOutlined, FileTextOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Spin, Tooltip, Input, Button, Modal, message, Tag, Checkbox } from 'antd';
import FileManager from './FileManager';
import AssetBatchTagBar from './AssetBatchTagBar';
import AssetStatsBadge from './AssetStatsBadge';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { getAssetFilesWithInfo, renameAssetIdentity, deleteAssetFile, loadAssetFile, loadAssetTags, setAssetFileTags, batchAddAssetTags, type AssetFileInfo } from '../../utils/assetManager';
import { useLongPress } from '../../hooks/useLongPress';
import { getAssetSourceMeta } from '../../utils/assetSourceTags';
import { downloadCsv } from '../../utils/downloadCsv';
import AssetUpgradeModal from '../AssetLibrary/AssetUpgradeModal';
import { getAssetDisplayName, validateAssetName, fixAssetName } from '../../utils/assetNaming';
import { classifyAvailableTagsWithConfig, filterAssetInfos } from '../../utils/assetTagFilters';
import { getAssetTagGroupsSync, ensureTagsInDefaultGroup, getExclusiveGroupTagSets } from '../../utils/assetTagGroups';
import TagSelector from '../common/TagSelector';
import { buildVehicleInstanceKey } from '../../utils/vehicleInstance';
import { useContextMenu } from '../../hooks/useContextMenu';


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
        selectedProductNames,
        assetTagGroupsVersion,
        assetVersion,
        assetFiles,
        setAssetFiles,
        setAssetLibraryPath,
        bumpAssetTagGroupsVersion,
    } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        uploadedFiles: state.uploadedFiles,
        activeAssets: state.activeAssets,
        addActiveAsset: state.addActiveAsset,
        removeActiveAsset: state.removeActiveAsset,
        renameActiveAsset: state.renameActiveAsset,
        selectedProductNames: state.selectedProductNames,
        assetTagGroupsVersion: state.assetTagGroupsVersion,
        assetVersion: state.assetVersion,
        assetFiles: state.assetFiles,
        setAssetFiles: state.setAssetFiles,
        setAssetLibraryPath: state.setAssetLibraryPath,
        bumpAssetTagGroupsVersion: state.bumpAssetTagGroupsVersion,
    })));
    const panelRef = useRef<HTMLDivElement>(null);
    

    // 智能联动逻辑：根据当前选中的车型，判断某个资产是否处于“激活”状态
    // 此处定义：如果该资产内含的车型（通常为 info.productName）已在 selectedProductNames 中，则视为已激活
    // 注意：如果是单文件多车型，这里可能需要更复杂的 mapped 逻辑，目前先处理 1:1 场景或首选名称匹配

    const [assets, setAssets] = useState<AssetFileInfo[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Rename state
    const [renameModal, setRenameModal] = useState<{ open: boolean; info: AssetFileInfo | null }>({ open: false, info: null });
    const [editName, setEditName] = useState('');
    const [searchKeyword, setSearchKeyword] = useState('');

    // 标签系统
    const [assetTags, setAssetTags] = useState<Record<string, string[]>>({});
    const [selectedGroupTag, setSelectedGroupTag] = useState<Record<string, string | null>>({});
    const [selectedOtherFilterTags, setSelectedOtherFilterTags] = useState<string[]>([]);

    const [upgradeAsset, setUpgradeAsset] = useState<AssetFileInfo | null>(null);
    const [announceNoInput, setAnnounceNoInput] = useState('');

    // 批量打标签（长按卡片或右键菜单「批量选择」进入）
    const [batchMode, setBatchMode] = useState(false);
    const [selectedFileNames, setSelectedFileNames] = useState<Set<string>>(new Set());
    const longPressTargetRef = useRef<string | null>(null);


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
    }, [assetLibraryPath, uploadedFiles, assetVersion]); // Re-fetch if files uploaded or asset version bumped

    // 资产列表变化（删除/重命名/刷新）后，剔除选择集中已不存在的文件
    useEffect(() => {
        setSelectedFileNames(prev => {
            if (prev.size === 0) return prev;
            const alive = new Set(assets.map(a => a.fileName));
            const next = new Set([...prev].filter(f => alive.has(f)));
            return next.size === prev.size ? prev : next;
        });
    }, [assets]);

    // Esc 退出批量模式
    useEffect(() => {
        if (!batchMode) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setBatchMode(false);
                setSelectedFileNames(new Set());
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [batchMode]);

    // 更换资产库目录
    const handleSetAssetLibrary = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                directory: true,
                multiple: false,
                title: '选择资产库目录'
            });
            if (selected && typeof selected === 'string') {
                setAssetLibraryPath(selected);
                message.success(`已设置资产库目录: ${selected}`);
            }
        } catch (err) {
            console.error('Failed to select directory', err);
            message.error('选择目录失败');
        }
    };

    const handleStartFileRename = (info: AssetFileInfo) => {
        setEditName(getAssetDisplayName(info.fileName, info.productName));
        setRenameModal({ open: true, info });
    };

    const handleCancelRename = () => {
        setRenameModal({ open: false, info: null });
        setEditName('');
    };

    const handleQuickFix = async (info: AssetFileInfo, fixedName: string) => {
        if (!assetLibraryPath) return;
        const oldFileName = info.fileName;
        try {
            const result = await renameAssetIdentity(assetLibraryPath, oldFileName, fixedName.replace(/\.json$/i, ''));
            if (result.success) {
                if (activeAssets.includes(oldFileName)) {
                    renameActiveAsset(oldFileName, result.fileName, result.productName);
                }
                message.success(`已修复：${result.fileName}`);
                fetchAssets();
                if (focusedFile === oldFileName) onFocusFile(result.fileName);
            } else {
                message.error('修复失败');
            }
        } catch {
            message.error('操作异常');
        }
    };

    const handleConfirmFileRename = async (info: AssetFileInfo) => {
        if (!editName.trim() || !assetLibraryPath) return;
        const oldFileName = info.fileName;
        const nextDisplayName = editName.trim();
        if (nextDisplayName === getAssetDisplayName(info.fileName, info.productName)) {
            handleCancelRename();
            return;
        }

        try {
            const result = await renameAssetIdentity(assetLibraryPath, oldFileName, nextDisplayName);
            if (result.success) {
                if (activeAssets.includes(oldFileName)) {
                    renameActiveAsset(oldFileName, result.fileName, result.productName);
                }

                // 立即加载新名称的资产数据到 assetFiles，不等同步器
                const newLoaded = await loadAssetFile(assetLibraryPath, result.fileName);
                if (newLoaded) {
                    setAssetFiles(assetFiles
                        .filter(f => f.fileName !== oldFileName)
                        .concat(newLoaded)
                    );
                }

                message.success('资产名称更新成功');
                handleCancelRename();
                fetchAssets();
                if (focusedFile === oldFileName) {
                    onFocusFile(result.fileName);
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
            // 一键激活：添加到 activeAssets 并勾选该车型，同时弹出右侧面板
            addActiveAsset(info.fileName, info.productName);
            onFocusFile(info.fileName);
            message.success(`已激活资产：${info.productName}`);
        } else {
            // 一键移出：从工作集和激活列表中移除
            removeActiveAsset(info.fileName, info.productName);
            message.info(`已停用资产：${info.productName}`);
        }
    };

    const handleDelete = (fileName: string, productName: string) => {
        Modal.confirm({
            title: '确认删除该资产？',
            icon: <ExclamationCircleOutlined className="text-danger" />,
            content: `删除记录 "${fileName}" 后将无法找回，相关对比与填报配置也将失效。`,
            okText: '确认删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                if (!assetLibraryPath) return;
                try {
                    const success = await deleteAssetFile(assetLibraryPath, fileName);
                    if (success) {
                        removeActiveAsset(fileName, productName);
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

    // 在 Finder 中显示资产文件
    const handleRevealInFinder = async (info: AssetFileInfo) => {
        if (!assetLibraryPath) return;
        try {
            const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
            await revealItemInDir(`${assetLibraryPath}/${info.fileName}`);
        } catch (e) {
            message.error(`无法在 Finder 中打开: ${e}`);
        }
    };

    // 用默认编辑器打开资产文件
    const handleOpenInEditor = async (info: AssetFileInfo) => {
        if (!assetLibraryPath) return;
        try {
            const { openPath } = await import('@tauri-apps/plugin-opener');
            await openPath(`${assetLibraryPath}/${info.fileName}`);
        } catch (e) {
            message.error(`无法打开文件: ${e}`);
        }
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
    const handleSetTags = async (fileName: string, tags: string[]) => {
        if (!assetLibraryPath) return;
        await setAssetFileTags(assetLibraryPath, fileName, tags);
        const groupsUpdated = await ensureTagsInDefaultGroup(assetLibraryPath, tags);
        if (groupsUpdated) bumpAssetTagGroupsVersion();
        setAssetTags(prev => ({ ...prev, [fileName]: tags }));
    };

    const { onContextMenu, ContextMenuPortal } = useContextMenu();

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
        setSelectedOtherFilterTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    // 全局标签集合 = 资产上已使用的标签 ∪ 系统分组内的全部标签（分组里的标签还没绑到资产上也可见）
    const allTags = useMemo(() => {
        const set = new Set<string>();
        Object.values(assetTags).forEach(tags => tags.forEach(t => set.add(t)));
        getAssetTagGroupsSync().groups.forEach(g => g.tags.forEach(t => set.add(t)));
        return Array.from(set).sort();
    }, [assetTags]);

    const groupedTags = useMemo(
        () => classifyAvailableTagsWithConfig(allTags, getAssetTagGroupsSync()),
        [allTags, assetTagGroupsVersion]
    );

    // 分组行（筛选栏与批量打标签栏共用）：groupId → { id, name, tags, exclusive }
    const tagGroupRows = useMemo(() => {
        const groups = getAssetTagGroupsSync();
        const nameMap = new Map(groups.groups.map(g => [g.id, g.name]));
        return Object.entries(groupedTags).map(([gid, tags]) => ({
            id: gid,
            name: gid === '_other' ? '未分组' : (nameMap.get(gid) || gid),
            tags,
            exclusive: gid !== '_other' && groups.exclusiveGroups.includes(gid),
        }));
    }, [groupedTags]);

    
    // 按来源计算每个资产的有效公告号
    // 公告数据源 → 仅用车辆型号；其他源 → 用参数中的公告字段
    const effectiveAnnounceNos = useMemo(() => {
        return new Map(assets.map(a => {
            const sourceMeta = getAssetSourceMeta(assetTags[a.fileName] || []);
            if (sourceMeta?.filter === 'announcement' && a.vehicleModel) {
                return [a.fileName, [a.vehicleModel]] as [string, string[]];
            }
            return [a.fileName, a.announceNos] as [string, string[]];
        }));
    }, [assets, assetTags]);

    // 从所有资产中提取可用的公告号列表
    const availableAnnounceNos = useMemo(() => {
        const nos = new Set<string>();
        assets.forEach(a => {
            const effNos = effectiveAnnounceNos.get(a.fileName) || [];
            effNos.forEach(n => nos.add(n));
        });
        return Array.from(nos).sort();
    }, [assets, effectiveAnnounceNos]);

    // 解析用户输入的公告号（支持逗号、换行、空格、tab 分隔）
    const parsedAnnounceNos = useMemo(() => {
        if (!announceNoInput.trim()) return [];
        return announceNoInput
            .split(/[\s,，\n\t]+/)
            .map(s => s.trim().toUpperCase())
            .filter(Boolean);
    }, [announceNoInput]);

    // 匹配/未匹配分类
    const announceNoMatchResult = useMemo(() => {
        if (parsedAnnounceNos.length === 0) return { matched: [] as string[], unmatched: [] as string[] };
        const matched: string[] = [];
        const unmatched: string[] = [];
        const allNos = new Set(availableAnnounceNos);
        parsedAnnounceNos.forEach(no => {
            if (allNos.has(no)) matched.push(no);
            else unmatched.push(no);
        });
        return { matched, unmatched };
    }, [parsedAnnounceNos, availableAnnounceNos]);

    // 命名合规统计
    const namingCompliance = useMemo(() => {
        const nonCompliant: { name: string; errors: string[] }[] = [];
        assets.forEach(a => {
            const effNos = effectiveAnnounceNos.get(a.fileName) || [];
            const v = validateAssetName(a.fileName, effNos);
            if (!v.valid) nonCompliant.push({ name: a.fileName, errors: v.errors });
        });
        return { total: assets.length, nonCompliant };
    }, [assets]);

    // 按关键字 + 标签过滤资产列表
    const filteredAssets = useMemo(() => {
        let result = assets;

        // 标签过滤（取交集）
        result = filterAssetInfos({
            assets: result,
            assetTags,
            selectedGroupTags: selectedGroupTag,
            selectedOtherFilterTags,
        });

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

        // 公告号过滤（并集：资产包含任意一个匹配到的公告号即显示）
        if (announceNoMatchResult.matched.length > 0) {
            result = result.filter(a => {
                const effNos = effectiveAnnounceNos.get(a.fileName) || [];
                if (effNos.length === 0) return false;
                return announceNoMatchResult.matched.some(no => effNos.includes(no));
            });
        }

        return result;
    }, [assets, searchKeyword, assetTags, selectedGroupTag, selectedOtherFilterTags, announceNoMatchResult, assetTagGroupsVersion]);

    // ===== 批量打标签 =====
    const enterBatchMode = (fileName: string) => {
        setBatchMode(true);
        setSelectedFileNames(prev => new Set(prev).add(fileName));
    };

    const exitBatchMode = () => {
        setBatchMode(false);
        setSelectedFileNames(new Set());
    };

    const toggleBatchSelected = (fileName: string, checked: boolean) => {
        setSelectedFileNames(prev => {
            const next = new Set(prev);
            if (checked) next.add(fileName);
            else next.delete(fileName);
            return next;
        });
    };

    // 全选 = 把当前筛选结果并入选择集（可先筛选再全选，之后逐个反勾选）
    const handleBatchSelectAll = (checked: boolean) => {
        if (!checked) {
            setSelectedFileNames(new Set());
            return;
        }
        setSelectedFileNames(prev => {
            const next = new Set(prev);
            filteredAssets.forEach(a => next.add(a.fileName));
            return next;
        });
    };

    const handleBatchAddTags = async (tags: string[]) => {
        if (!assetLibraryPath || tags.length === 0) return;
        if (selectedFileNames.size === 0) {
            message.warning('请先勾选要打标签的资产');
            return;
        }
        const count = selectedFileNames.size;
        const exclusiveSets = getExclusiveGroupTagSets();
        const touchesExclusive = tags.some(t => exclusiveSets.some(set => set.includes(t)));
        try {
            const updated = await batchAddAssetTags(assetLibraryPath, [...selectedFileNames], tags, exclusiveSets);
            const groupsUpdated = await ensureTagsInDefaultGroup(assetLibraryPath, tags);
            if (groupsUpdated) bumpAssetTagGroupsVersion();
            setAssetTags(updated);
            const suffix = touchesExclusive ? '（互斥组标签已替换组内原有标签）' : '';
            message.success(`已为 ${count} 个资产添加标签：${tags.join('、')}${suffix}`);
        } catch (err) {
            console.error('Batch add tags failed', err);
            message.error('批量添加标签失败');
        }
    };

    // 全选态按「当前筛选结果」计算（选择集可包含被筛走的资产，一并生效）
    const batchSelectionStats = useMemo(() => {
        const inFiltered = filteredAssets.filter(a => selectedFileNames.has(a.fileName)).length;
        return {
            allSelected: filteredAssets.length > 0 && inFiltered === filteredAssets.length,
            indeterminate: inFiltered > 0 && inFiltered < filteredAssets.length,
        };
    }, [filteredAssets, selectedFileNames]);

    // 长按进入批量模式（目标卡片通过 ref 传入，避免在 map 里调 hook）
    const cardLongPress = useLongPress(() => {
        const fileName = longPressTargetRef.current;
        if (fileName) enterBatchMode(fileName);
    });

    return (
        <div ref={panelRef} className="flex flex-col h-full surface-layout">
            {/* Asset Library */}
            <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-2 px-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[16px] font-bold text-1">车型资产库</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <FileManager
                            hiddenAssetButton={true}
                            onSelectFile={onFocusFile}
                            focusedFile={focusedFile}
                        />
                        <Button
                            type="text"
                            size="small"
                            onClick={() => {}}
                            className="text-[12px] text-3 hover:text-brand"
                        >
                            恢复布局
                        </Button>
                        {loading && <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />} />}
                        <Tooltip title="刷新资产库">
                            <Button
                                type="text"
                                size="small"
                                icon={<ReloadOutlined className={`!text-[14px] text-3 hover:text-brand ${loading ? 'animate-spin' : ''}`} />}
                                onClick={fetchAssets}
                                disabled={loading}
                                className="w-7 h-7 p-0 min-w-0 flex items-center justify-center rounded-lg"
                            />
                        </Tooltip>
                        <Tooltip title={assetLibraryPath ? '更换资产库目录' : '设置资产库目录'}>
                            <Button
                                type="text"
                                size="small"
                                icon={<FolderOpenOutlined className={`!text-[14px] ${assetLibraryPath ? 'text-3 hover:text-[color:var(--warning)]' : 'text-danger animate-pulse'}`} />}
                                onClick={handleSetAssetLibrary}
                                className="w-7 h-7 p-0 min-w-0 flex items-center justify-center rounded-lg"
                            />
                        </Tooltip>
                    </div>
                </div>

                {/* 命名规范提醒 */}
                {namingCompliance.nonCompliant.length > 0 && (
                    <div className="mb-2 px-1">
                        <div className="text-[12px] text-[color:var(--warning-text)] surface-inset border border-[color:var(--warning)] rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                            <ExclamationCircleOutlined className="text-[13px] flex-shrink-0" />
                            <span>
                                <b>{namingCompliance.nonCompliant.length}</b>/{namingCompliance.total} 个资产命名未包含公告号，点击 <CheckOutlined className="text-[12px] text-[color:var(--warning-text)]" /> 一键修复
                            </span>
                        </div>
                    </div>
                )}

                {/* 搜索框 */}
                {assets.length > 5 && (
                    <div className="mb-2 px-1 space-y-2">
                        <Input
                            size="small"
                            placeholder="搜索资产、标签..."
                            prefix={<SearchOutlined className="text-3" />}
                            allowClear
                            value={searchKeyword}
                            onChange={e => setSearchKeyword(e.target.value)}
                            className="rounded-lg border-default"
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                        </div>
                    </div>
                )}

                {/* 公告号输入筛选 */}
                {availableAnnounceNos.length > 0 && (
                    <div className="mb-2 px-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <span className="text-[12px] text-2 font-medium flex-shrink-0">公告号</span>
                            <Input.TextArea
                                size="small"
                                rows={2}
                                placeholder="粘贴公告号，支持逗号、换行、空格分隔..."
                                value={announceNoInput}
                                onChange={e => setAnnounceNoInput(e.target.value)}
                                className="text-[13px] rounded-lg"
                                style={{ resize: 'none' }}
                            />
                        </div>
                        {announceNoInput.trim() && (
                            <div className="flex items-center gap-2 text-[12px] flex-wrap">
                                {announceNoMatchResult.matched.length > 0 && (
                                    <span className="text-success">
                                        公告号匹配 <b>{announceNoMatchResult.matched.length}</b> 个，筛选出 <b>{filteredAssets.length}</b> 个资产
                                    </span>
                                )}
                                {announceNoMatchResult.unmatched.length > 0 && (
                                    <Tooltip title={announceNoMatchResult.unmatched.join('、')}>
                                        <span className="text-[color:var(--warning-text)] cursor-help">
                                            未匹配 <b>{announceNoMatchResult.unmatched.length}</b> 个
                                        </span>
                                    </Tooltip>
                                )}
                                <span
                                    className="text-brand cursor-pointer hover:underline"
                                    onClick={() => setAnnounceNoInput('')}
                                >
                                    清除
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* 标签过滤栏 — 动态按标签分组展示 */}
                {allTags.length > 0 && (
                    <div className="mb-2 px-1 space-y-2">
                        {tagGroupRows.map(row => {
                            const isOther = row.id === '_other';
                            return (
                                <div key={row.id} className="flex flex-wrap gap-1.5 items-center">
                                    <TagOutlined className="text-[12px] text-3 mr-0.5" />
                                    <span className="text-[12px] text-2 font-medium">{row.name}</span>
                                    {row.tags.map(tag => {
                                        const isSelected = isOther
                                            ? selectedOtherFilterTags.includes(tag)
                                            : selectedGroupTag[row.id] === tag;
                                        return (
                                            <Tag
                                                key={tag}
                                                onClick={() => {
                                                    if (isOther) {
                                                        toggleFilterTag(tag);
                                                    } else {
                                                        setSelectedGroupTag(prev => ({
                                                            ...prev,
                                                            [row.id]: prev[row.id] === tag ? null : tag,
                                                        }));
                                                    }
                                                }}
                                                className={`text-[12px] m-0 px-2 py-0.5 leading-[20px] rounded-lg border cursor-pointer ${
                                                    isSelected
                                                        ? 'tag-checked font-medium'
                                                        : 'surface-inset border-default text-2 hover:border-brand'
                                                }`}
                                            >
                                                {tag}
                                            </Tag>
                                        );
                                    })}
                                </div>
                            );
                        })}

                        {(Object.values(selectedGroupTag).some(Boolean) || selectedOtherFilterTags.length > 0) && (
                            <div className="flex flex-wrap gap-2 items-center">
                                <span
                                    className="text-[12px] text-brand cursor-pointer hover:underline"
                                    onClick={() => {
                                        setSelectedGroupTag({});
                                        setSelectedOtherFilterTags([]);
                                    }}
                                >
                                    清除筛选
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* 全局一键激活按钮 — 不依赖特定筛选条件 */}
                {(() => {
                    const toActivate = filteredAssets.filter(a => !selectedProductNames.includes(buildVehicleInstanceKey('asset', a.fileName, a.productName)));
                    if (toActivate.length === 0 || filteredAssets.length === 0) return null;
                    return (
                        <div className="flex items-center gap-2 mb-2">
                            <span
                                className="text-[12px] text-brand cursor-pointer hover:underline font-medium"
                                onClick={() => {
                                    toActivate.forEach(a => addActiveAsset(a.fileName, a.productName));
                                    message.success(`已将 ${toActivate.length} 个资产新增到待分析工作区`);
                                }}
                            >
                                <ThunderboltOutlined /> 将筛选结果新增到工作区 ({toActivate.length})
                            </span>
                        </div>
                    );
                })()}

                {/* 批量打标签操作栏（批量模式下常驻列表顶部） */}
                {batchMode && (
                    <AssetBatchTagBar
                        selectedCount={selectedFileNames.size}
                        filteredCount={filteredAssets.length}
                        allSelected={batchSelectionStats.allSelected}
                        indeterminate={batchSelectionStats.indeterminate}
                        onSelectAll={handleBatchSelectAll}
                        onClearSelection={() => setSelectedFileNames(new Set())}
                        onExit={exitBatchMode}
                        groups={tagGroupRows}
                        onApplyTags={handleBatchAddTags}
                    />
                )}

                <div className="space-y-2">
                    {filteredAssets.map(info => {
                        const isFocused = focusedFile === info.fileName;
                        const isEditing = false;
                        // 智能感知：如果该资产下的车型已在工作集中，则视为激活
                        const isActive = selectedProductNames.includes(buildVehicleInstanceKey('asset', info.fileName, info.productName));
                        const sourceMeta = getAssetSourceMeta(assetTags[info.fileName] || []);
                        const isBatchChecked = batchMode && selectedFileNames.has(info.fileName);

                        return (
                            <div
                                key={info.fileName}
                                onClick={() => onFocusFile(info.fileName)}
                                onPointerDown={e => { longPressTargetRef.current = info.fileName; cardLongPress.onPointerDown(e); }}
                                onPointerMove={cardLongPress.onPointerMove}
                                onPointerUp={cardLongPress.onPointerUp}
                                onPointerLeave={cardLongPress.onPointerLeave}
                                onPointerCancel={cardLongPress.onPointerCancel}
                                onClickCapture={cardLongPress.onClickCapture}
                                onContextMenu={onContextMenu([
                                    { key: 'focus', label: '聚焦查看', onClick: () => onFocusFile(info.fileName) },
                                    { key: 'batch', label: '批量选择', onClick: () => enterBatchMode(info.fileName) },
                                    { key: 'rename', label: '重命名', onClick: () => handleStartFileRename(info) },
                                    { key: 'divider1', divider: true, onClick: () => {} },
                                    { key: 'finder', label: '在 Finder 中显示', onClick: () => handleRevealInFinder(info) },
                                    { key: 'open', label: '打开文件', onClick: () => handleOpenInEditor(info) },
                                    { key: 'divider2', divider: true, onClick: () => {} },
                                    { key: 'delete', label: '删除资产', danger: true, onClick: () => handleDelete(info.fileName, info.productName) },
                                ])}
                                className={`flex flex-col justify-center py-2.5 px-3.5 rounded-lg border group relative ${
                                    isEditing
                                        ? 'border-brand surface-container'
                                        : isBatchChecked
                                            ? 'surface-container border-brand bg-brand-weak'
                                            : isFocused
                                                ? 'surface-container border-brand ring-1 ring-brand'
                                                : isActive
                                                    ? 'surface-container border-default edge-success'
                                                    : 'surface-container border-default hover:border-line-strong'
                                }`}
                            >
                                {false ? null : (
                                    <>
                                        <div className="flex items-center min-w-0">
                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                {batchMode && (
                                                    <Checkbox
                                                        checked={selectedFileNames.has(info.fileName)}
                                                        onChange={e => toggleBatchSelected(info.fileName, e.target.checked)}
                                                        onClick={e => e.stopPropagation()}
                                                        className="flex-shrink-0"
                                                    />
                                                )}
                                                <Tooltip title={isActive ? "点击快速停用该资产" : "点击快速激活该资产"}>
                                                    <div
                                                        onClick={(e) => { e.stopPropagation(); handleToggleAsset(info, isActive); }}
                                                        className={`relative w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                            isFocused ? 'surface-brand text-white' : 'surface-inset text-3'
                                                        }`}
                                                    >
                                                        <DatabaseOutlined className="text-[15px]" />
                                                        {isActive && (
                                                            <span className="dot-ring absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full surface-success" />
                                                        )}
                                                    </div>
                                                </Tooltip>
                                                <div className="min-w-0 flex items-center gap-2">
                                                    {sourceMeta && (
                                                        <Tag className={`src-${sourceMeta.tone} m-0 text-[12px] leading-[18px] px-2.5 rounded-lg border-0`}>
                                                            {sourceMeta.icon} {sourceMeta.label}
                                                        </Tag>
                                                    )}
                                                    <Tooltip title={getAssetDisplayName(info.fileName, info.productName)}>
                                                        <span className={`text-sm truncate text-1 ${isFocused ? 'font-semibold' : 'font-medium'}`}>
                                                            {getAssetDisplayName(info.fileName, info.productName)}
                                                        </span>
                                                    </Tooltip>
                                                    {(() => {
                                                        const effNos = effectiveAnnounceNos.get(info.fileName) || [];
                                                        const v = validateAssetName(info.fileName, effNos);
                                                        const allMsgs = [...v.errors, ...v.suggestions.map(s => `💡 ${s}`)];
                                                        if (!v.valid) {
                                                            return (
                                                                <Tooltip
                                                                    title={allMsgs.map((m, i) => <div key={i}>• {m}</div>)}
                                                                    overlayStyle={{ maxWidth: 360 }}
                                                                >
                                                                    <Tag className="m-0 text-[12px] leading-[16px] px-1.5 rounded cursor-help flex-shrink-0 text-warning-text border-warning">
                                                                        ⚠ 命名不规范
                                                                    </Tag>
                                                                </Tooltip>
                                                            );
                                                        }
                                                        if (v.suggestions.length > 0) {
                                                            return (
                                                                <Tooltip
                                                                    title={v.suggestions.map((s, i) => <div key={i}>💡 {s}</div>)}
                                                                    overlayStyle={{ maxWidth: 360 }}
                                                                >
                                                                    <Tag className="m-0 text-[12px] leading-[16px] px-1.5 rounded cursor-help flex-shrink-0 text-3">
                                                                        命名建议
                                                                    </Tag>
                                                                </Tooltip>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                    {(() => {
                                                        const effNos = effectiveAnnounceNos.get(info.fileName) || [];
                                                        const v = validateAssetName(info.fileName, effNos);
                                                        if (v.valid || effNos.length === 0) return null;
                                                        const fixName = fixAssetName(info.fileName, effNos[0]);
                                                        return (
                                                            <Tooltip title={`修复为：${fixName}`}>
                                                                <Button
                                                                    type="text"
                                                                    size="small"
                                                                    icon={<CheckOutlined className="!text-[12px] text-warning-text hover:text-success" />}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleQuickFix(info, fixName);
                                                                    }}
                                                                    className="w-5 h-5 p-0 min-w-0 flex items-center justify-center rounded flex-shrink-0"
                                                                />
                                                            </Tooltip>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                            <AssetStatsBadge totalParams={info.totalParams} filledParams={info.filledParams} />
                                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 ml-2 flex-shrink-0">
                                                {!isActive ? (
                                                    <Tooltip title="添加至车型列">
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<PlusSquareOutlined className="!text-[14px] text-2 hover:text-brand" />}
                                                            onClick={(e) => { e.stopPropagation(); handleToggleAsset(info, false); onFocusFile(null); }}
                                                            className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md active:scale-95 transition-transform"
                                                        />
                                                    </Tooltip>
                                                ) : (
                                                    <Tooltip title="移出车型列">
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<MinusSquareOutlined className="!text-[14px] text-2 hover:text-danger" />}
                                                            onClick={(e) => { e.stopPropagation(); handleToggleAsset(info, true); }}
                                                            className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md active:scale-95 transition-transform"
                                                        />
                                                    </Tooltip>
                                                )}
                                                <Tooltip title="复制公告号">
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<CopyOutlined className="!text-[14px] text-2 hover:text-brand" />}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const effNos = effectiveAnnounceNos.get(info.fileName) || [];
                                                            if (effNos.length === 0) {
                                                                message.info('未找到公告号');
                                                                return;
                                                            }
                                                            const announceNo = effNos[0];
                                                            // 优先 Clipboard API，回退 execCommand
                                                            if (navigator.clipboard?.writeText) {
                                                                navigator.clipboard.writeText(announceNo).then(() => {
                                                                    message.success(`已复制公告号：${announceNo}`);
                                                                }).catch(() => {
                                                                    message.error('复制失败，请手动复制');
                                                                });
                                                            } else {
                                                                // fallback
                                                                const ta = document.createElement('textarea');
                                                                ta.value = announceNo;
                                                                ta.style.position = 'fixed';
                                                                ta.style.opacity = '0';
                                                                document.body.appendChild(ta);
                                                                ta.select();
                                                                try { document.execCommand('copy'); message.success(`已复制公告号：${announceNo}`); }
                                                                catch { message.error('复制失败，请手动复制'); }
                                                                finally { document.body.removeChild(ta); }
                                                            }
                                                        }}
                                                        className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md active:scale-95 transition-transform"
                                                    />
                                                </Tooltip>
                                                <Tooltip title="导出 CSV">
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<DownloadOutlined className="!text-[14px] text-2 hover:text-success" />}
                                                        onClick={(e) => { e.stopPropagation(); handleExportCsv(info); }}
                                                        className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md active:scale-95 transition-transform"
                                                    />
                                                </Tooltip>
                                                <Tooltip title="在 Finder 中显示">
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<FolderOpenOutlined className="!text-[14px] text-2 hover:text-brand" />}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRevealInFinder(info);
                                                        }}
                                                        className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md active:scale-95 transition-transform"
                                                    />
                                                </Tooltip>
                                                <Tooltip title="打开文件">
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<FileTextOutlined className="!text-[14px] text-2 hover:text-[color:var(--warning)]" />}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOpenInEditor(info);
                                                        }}
                                                        className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md active:scale-95 transition-transform"
                                                    />
                                                </Tooltip>
                                                <Tooltip title="重命名">
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<EditOutlined className="!text-[14px] text-2 hover:text-brand" />}
                                                        onClick={(e) => { e.stopPropagation(); handleStartFileRename(info); }}
                                                        className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md active:scale-95 transition-transform"
                                                    />
                                                </Tooltip>
                                                <Tooltip title="升级导入">
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<CloudUploadOutlined className="!text-[14px] text-2 hover:text-brand" />}
                                                        onClick={(e) => { e.stopPropagation(); handleOpenUpgradeModal(info); }}
                                                        className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md active:scale-95 transition-transform"
                                                    />
                                                </Tooltip>
                                                <Tooltip title="删除资产">
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<DeleteOutlined className="!text-[14px] text-2 hover:text-danger" />}
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(info.fileName, info.productName); }}
                                                        className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md active:scale-95 transition-transform"
                                                    />
                                                </Tooltip>
                                            </div>
                                        </div>
                                        {/* 标签行 */}
                                        <div className={`${batchMode ? 'pl-[78px]' : 'pl-[46px]'} mt-1.5 flex items-center gap-1.5 flex-wrap`}>
                                            {(assetTags[info.fileName] || []).map(tag => (
                                                <Tag
                                                    key={tag}
                                                    closable
                                                    onClose={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveTag(info.fileName, tag); }}
                                                    className="text-[12px] m-0 px-2.5 py-0.5 leading-[20px] rounded-lg surface-inset border-default text-2"
                                                >
                                                    {tag}
                                                </Tag>
                                            ))}
                                            <TagSelector
                                                selected={assetTags[info.fileName] || []}
                                                availableTags={allTags}
                                                onChange={tags => handleSetTags(info.fileName, tags)}
                                            />
                                            {info.updatedAt && (
                                                <span className="text-[12px] text-3 flex items-center gap-1 ml-auto tabular-nums">
                                                    <EditOutlined className="text-[12px] opacity-0 group-hover:opacity-100 transition-opacity"/> {formatDate(info.updatedAt)}
                                                </span>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                    {!loading && filteredAssets.length === 0 && (
                        <div className="text-[13px] text-3 text-center py-4 border border-dashed border-default rounded-lg">
                            {searchKeyword.trim() ? '没有匹配的资产' : '资产库空空如也'}
                        </div>
                    )}
                </div>
            </div>

            {/* 重命名弹窗 */}
            <Modal
                title="重命名资产"
                open={renameModal.open}
                onOk={() => renameModal.info && handleConfirmFileRename(renameModal.info)}
                onCancel={handleCancelRename}
                okText="确认重命名"
                cancelText="取消"
                destroyOnClose
            >
                <div className="py-3">
                    <div className="text-[13px] text-2 mb-2">输入新的资产名称</div>
                    <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onPressEnter={() => renameModal.info && handleConfirmFileRename(renameModal.info)}
                        placeholder="输入资产名称"
                        autoFocus
                        addonAfter=".json"
                    />
                </div>
            </Modal>

            <AssetUpgradeModal
                open={Boolean(upgradeAsset)}
                assetInfo={upgradeAsset}
                assetTags={upgradeAsset ? (assetTags[upgradeAsset.fileName] || []) : []}
                onClose={() => setUpgradeAsset(null)}
                onSaved={fetchAssets}
            />
            {ContextMenuPortal}
        </div>
    );
};

export default DataSourcePanel;
