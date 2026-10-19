import React, { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Dropdown, Modal, Segmented, Space, Tooltip, Typography, message } from 'antd';
import GuideEmpty from '../common/GuideEmpty';
import { LIBRARY_PATH_MISSING_TEXT, openLibraryPathSettings } from '../../utils/libraryPathPrompt';
import {
    DownOutlined, FileAddOutlined, ImportOutlined, ReloadOutlined, SwapOutlined,
} from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../store/vehicleStore';
import { useAnnouncementStore } from '../../store/announcementStore';
import ParametersTable from '../DiffViewer/ParametersTable';
import { getAssetFilesWithInfo, type AssetFileInfo } from '../../utils/assetManager';
import {
    ANNOUNCEMENT_DIR_NAME,
    copyFilesToClipboard,
    moveToTrash,
    normalizeAnnounceNo,
    readAnnouncementRecord,
    type AnnouncementInfo,
} from '../../utils/announcementRecord';
import {
    ARCHIVE_CHIPS,
    buildAnnouncementTree,
    collectExpandableKeys,
    collectGroupAnnounceNos,
    filterArchiveInfos,
    type ArchiveChip,
    type AnnounceNode,
    type JoinedAsset,
    type VehicleGroup,
} from '../../utils/announcementGrouping';
import type { VehicleParameter } from '../../types';
import AnnouncementImportModal, { type AnnouncementImportPrefill } from './AnnouncementImportModal';
import AnnouncementBatchImportModal from './AnnouncementBatchImportModal';
import AnnouncementMigrationModal from './AnnouncementMigrationModal';
import AnnouncementFlatTable from './AnnouncementFlatTable';
import AnnouncementGroupedTable from './AnnouncementGroupedTable';
import AnnouncementBatchDiffDrawer from './AnnouncementBatchDiffDrawer';
import ListToolbar from '../common/ListToolbar';
import SearchInput from '../common/SearchInput';
import FacetChips from '../common/FacetChips';

const { Text } = Typography;

interface AnnouncementArchiveListProps {
    /** 「查看关联资产」跳转工作台并按公告号过滤（由外层接 App 的 tab 切换） */
    onOpenWorkbench?: () => void;
}

type ArchiveView = 'grouped' | 'flat';

const VIEW_STORAGE_KEY = 'announcement-archive-view';

const initialView = (): ArchiveView => {
    try {
        return localStorage.getItem(VIEW_STORAGE_KEY) === 'flat' ? 'flat' : 'grouped';
    } catch {
        return 'grouped';
    }
};

/**
 * 公告归档（设计文档 2026-10-02）：分组树为主视图（车型→公告号→批次），
 * 平铺表格保留为辅视图；chips + 搜索两视图共用；纯视图层聚合。
 * 关联 = 纯公告号运行时 join（资产侧口径：announceNos ∪ vehicleModel），多对一。
 */
const AnnouncementArchiveList: React.FC<AnnouncementArchiveListProps> = ({ onOpenWorkbench }) => {
    const { assetLibraryPath, setPendingAnnounceNoFilter } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        setPendingAnnounceNoFilter: state.setPendingAnnounceNoFilter,
    })));
    const { infos, loading, loadFor, refresh } = useAnnouncementStore(useShallow(state => ({
        infos: state.infos,
        loading: state.loading,
        loadFor: state.loadFor,
        refresh: state.refresh,
    })));

    const [assets, setAssets] = useState<AssetFileInfo[]>([]);
    const [view, setView] = useState<ArchiveView>(initialView);
    const [chip, setChip] = useState<ArchiveChip>('all');
    const [search, setSearch] = useState('');
    // 分组树受控展开（默认全折叠，不持久化；搜索时由派生值全展开）
    const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
    const [importOpen, setImportOpen] = useState(false);
    const [importPrefill, setImportPrefill] = useState<AnnouncementImportPrefill | null>(null);
    const [orphanPdfPath, setOrphanPdfPath] = useState<string | null>(null);
    const [migrationOpen, setMigrationOpen] = useState(false);
    const [batchImportOpen, setBatchImportOpen] = useState(false);
    // 公告参数查看抽屉：按需懒加载记录 JSON（scan 只回传元信息）
    const [paramsDrawer, setParamsDrawer] = useState<{ open: boolean; info: AnnouncementInfo | null }>({ open: false, info: null });
    const [recordParams, setRecordParams] = useState<VehicleParameter[] | null>(null);
    const [paramsLoading, setParamsLoading] = useState(false);
    // 批次对比抽屉
    const [diffState, setDiffState] = useState<{ open: boolean; announceNo: string; batches: AnnouncementInfo[] }>({
        open: false, announceNo: '', batches: [],
    });

    useEffect(() => {
        loadFor(assetLibraryPath);
    }, [assetLibraryPath, loadFor]);

    useEffect(() => {
        let cancelled = false;
        if (!assetLibraryPath) {
            setAssets([]);
            return;
        }
        getAssetFilesWithInfo(assetLibraryPath).then(list => {
            if (!cancelled) setAssets(list);
        }).catch(e => console.error('扫描资产失败', e));
        return () => { cancelled = true; };
    }, [assetLibraryPath]);

    /** 公告号 → 关联资产（announceNos ∪ vehicleModel 命中即关联） */
    const linkedAssets = useMemo(() => {
        const map = new Map<string, JoinedAsset[]>();
        infos.forEach(info => {
            const no = normalizeAnnounceNo(info.announceNo);
            if (!no) return;
            map.set(no, []);
        });
        assets.forEach(a => {
            const nos = new Set([...(a.announceNos || []), ...(a.vehicleModel ? [a.vehicleModel] : [])]
                .map(normalizeAnnounceNo));
            nos.forEach(no => {
                const list = map.get(no);
                if (list) list.push({
                    fileName: a.fileName,
                    productName: a.productName,
                    totalParams: a.totalParams,
                    filledParams: a.filledParams,
                    updatedAt: a.updatedAt,
                });
            });
        });
        return map;
    }, [infos, assets]);

    const filtered = useMemo(
        () => filterArchiveInfos(infos, chip, search, linkedAssets),
        [infos, chip, search, linkedAssets],
    );
    const groups = useMemo(() => buildAnnouncementTree(filtered, linkedAssets), [filtered, linkedAssets]);

    // 搜索时全展开命中路径；清空搜索回到用户手动展开态（当前实现：回到全折叠）
    const searching = search.trim() !== '';
    const effectiveExpanded = searching ? collectExpandableKeys(groups) : expandedKeys;

    const switchView = (v: ArchiveView) => {
        setView(v);
        try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch { /* 忽略 */ }
    };

    const handleRefresh = async () => {
        await refresh();
        if (assetLibraryPath) {
            try {
                setAssets(await getAssetFilesWithInfo(assetLibraryPath));
            } catch { /* 保持旧数据 */ }
        }
    };

    const handleOpenPdf = async (info: AnnouncementInfo) => {
        if (!assetLibraryPath || !info.pdfFile) return;
        try {
            const { openPath } = await import('@tauri-apps/plugin-opener');
            const { join } = await import('@tauri-apps/api/path');
            await openPath(await join(assetLibraryPath, ANNOUNCEMENT_DIR_NAME, info.pdfFile));
        } catch (e) {
            console.error('打开 PDF 失败', e);
            message.error('打开 PDF 失败');
        }
    };

    const handleReveal = async (info: AnnouncementInfo) => {
        if (!assetLibraryPath) return;
        const name = info.orphan ? info.pdfFile : (info.pdfFile || info.jsonFile);
        if (!name) return;
        try {
            const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
            const { join } = await import('@tauri-apps/api/path');
            await revealItemInDir(await join(assetLibraryPath, ANNOUNCEMENT_DIR_NAME, name));
        } catch (e) {
            console.error('定位文件失败', e);
            message.error('定位文件失败');
        }
    };

    const handleDelete = (info: AnnouncementInfo) => {
        if (!assetLibraryPath) return;
        const label = [info.vehicleName, info.announceNo, info.batch].filter(Boolean).join(' ') || info.pdfFile;
        Modal.confirm({
            title: '删除这条公告归档？',
            content: `「${label}」的${[info.jsonFile ? '记录' : null, info.hasPdf ? 'PDF' : null].filter(Boolean).join('和')}将移入废纸篓（可恢复）。`,
            okText: '移入废纸篓',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: async () => {
                try {
                    const { join } = await import('@tauri-apps/api/path');
                    const paths: string[] = [];
                    if (info.jsonFile) paths.push(await join(assetLibraryPath, ANNOUNCEMENT_DIR_NAME, info.jsonFile));
                    if (info.pdfFile) paths.push(await join(assetLibraryPath, ANNOUNCEMENT_DIR_NAME, info.pdfFile));
                    await moveToTrash(paths);
                    await refresh();
                    message.success('已移入废纸篓');
                } catch (e) {
                    console.error('删除公告归档失败', e);
                    message.error('删除失败');
                }
            },
        });
    };

    const handleCopyPdf = async (info: AnnouncementInfo) => {
        if (!assetLibraryPath || !info.pdfFile) return;
        try {
            const { join } = await import('@tauri-apps/api/path');
            await copyFilesToClipboard([await join(assetLibraryPath, ANNOUNCEMENT_DIR_NAME, info.pdfFile)]);
            message.success('PDF 已复制到剪贴板，可直接粘贴发送');
        } catch (e) {
            console.error('复制 PDF 失败', e);
            message.error(`复制失败：${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const handleClaimOrphan = (info: AnnouncementInfo) => {
        if (!assetLibraryPath || !info.pdfFile) return;
        import('@tauri-apps/api/path').then(async ({ join }) => {
            setImportPrefill({
                vehicleName: info.vehicleName ?? '',
                announceNo: info.announceNo,
                batch: info.batch ?? '',
            });
            setOrphanPdfPath(await join(assetLibraryPath, ANNOUNCEMENT_DIR_NAME, info.pdfFile!));
            setImportOpen(true);
        });
    };

    /** 跳工作台并按公告号（可多值）过滤（一次性信号，DataSourcePanel 消费后清空） */
    const handleViewLinkedByNos = (nos: string[]) => {
        const clean = nos.map(normalizeAnnounceNo).filter(Boolean);
        if (onOpenWorkbench && clean.length > 0) {
            setPendingAnnounceNoFilter(clean);
            onOpenWorkbench();
        } else {
            message.info('该记录没有可关联的公告号');
        }
    };

    const handleViewLinked = (info: AnnouncementInfo) => handleViewLinkedByNos([info.announceNo]);
    const handleViewGroupLinked = (group: VehicleGroup) => handleViewLinkedByNos(collectGroupAnnounceNos(group));

    const handleViewParams = async (info: AnnouncementInfo) => {
        if (!assetLibraryPath || !info.jsonFile) return;
        setParamsDrawer({ open: true, info });
        setRecordParams(null);
        setParamsLoading(true);
        try {
            const record = await readAnnouncementRecord(assetLibraryPath, info.jsonFile);
            if (!record) {
                message.error('读取公告记录失败');
                setParamsDrawer({ open: false, info: null });
                return;
            }
            setRecordParams(record.parameters);
        } catch (e) {
            console.error('读取公告参数失败', e);
            message.error('读取公告参数失败');
            setParamsDrawer({ open: false, info: null });
        } finally {
            setParamsLoading(false);
        }
    };

    const handleImportForGroup = (vehicleName: string) => {
        setImportPrefill({ vehicleName });
        setOrphanPdfPath(null);
        setImportOpen(true);
    };

    const handleImportNewBatch = (vehicleName: string, announceNo: string) => {
        setImportPrefill({ vehicleName, announceNo });
        setOrphanPdfPath(null);
        setImportOpen(true);
    };

    const handleCompareBatches = (_group: VehicleGroup, node: AnnounceNode) => {
        setDiffState({
            open: true,
            announceNo: node.announceNo,
            batches: [node.head, ...node.history],
        });
    };

    return (
        <>
        <ListToolbar
            title="公告归档"
            count={assetLibraryPath ? { shown: filtered.length, total: infos.length } : undefined}
            actions={
                <>
                    {/* §5.1：≥3 个同类动作收进下拉 */}
                    <Dropdown
                        menu={{
                            items: [
                                { key: 'single', icon: <SwapOutlined />, label: '导入公告 PDF' },
                                { key: 'batch', icon: <FileAddOutlined />, label: '批量导入 PDF' },
                                { type: 'divider' as const },
                                { key: 'migrate', icon: <ImportOutlined />, label: '从资产库迁移公告数据' },
                            ],
                            onClick: ({ key }) => {
                                if (key === 'batch') { setBatchImportOpen(true); return; }
                                if (key === 'migrate') { setMigrationOpen(true); return; }
                                setImportPrefill(null);
                                setOrphanPdfPath(null);
                                setImportOpen(true);
                            },
                        }}
                        trigger={['click']}
                    >
                        {/* primary 只给「产出/终点动作」（设计语言 §5.1 Q19）：
                            本页主任务是浏览与治理已归档记录，导入只是补充手段，
                            故用 default——本页没有 primary 是合法状态。 */}
                        <Button icon={<ImportOutlined />}>
                            导入 <DownOutlined className="text-3" />
                        </Button>
                    </Dropdown>
                    <Tooltip title="刷新公告归档">
                        <Button icon={<ReloadOutlined />} aria-label="刷新公告归档" onClick={handleRefresh} />
                    </Tooltip>
                </>
            }
            filters={
                <>
                    <Segmented
                        value={view}
                        onChange={v => switchView(v as ArchiveView)}
                        options={[
                            { label: '分组', value: 'grouped' },
                            { label: '平铺', value: 'flat' },
                        ]}
                    />
                    <FacetChips
                        options={ARCHIVE_CHIPS.map(c => ({ value: c.key, label: c.label }))}
                        value={chip}
                        onChange={v => setChip(v as ArchiveChip)}
                    />
                    <span className="ml-auto" />
                    <SearchInput
                        width="sm"
                        placeholder="搜索车型名 / 公告号 / 批次"
                        value={search}
                        onChange={v => {
                            setSearch(v);
                            if (!v.trim()) setExpandedKeys([]);
                        }}
                    />
                </>
            }
            padded={false}
        >
            {!assetLibraryPath ? (
                <GuideEmpty
                    title={LIBRARY_PATH_MISSING_TEXT}
                    description="公告归档保存在资产库目录下，设置后即可查看"
                    action={<Button onClick={openLibraryPathSettings}>设置资产库目录</Button>}
                />
            ) : (
                <>
                    {view === 'grouped' ? (
                        <AnnouncementGroupedTable
                            groups={groups}
                            linkedAssets={linkedAssets}
                            expandedKeys={effectiveExpanded}
                            onExpandedKeysChange={setExpandedKeys}
                            onViewLinked={handleViewLinked}
                            onOpenPdf={handleOpenPdf}
                            onCopyPdf={handleCopyPdf}
                            onViewParams={handleViewParams}
                            onReveal={handleReveal}
                            onDelete={handleDelete}
                            onClaimOrphan={handleClaimOrphan}
                            onViewGroupLinked={handleViewGroupLinked}
                            onImportForGroup={handleImportForGroup}
                            onImportNewBatch={handleImportNewBatch}
                            onCompareBatches={handleCompareBatches}
                        />
                    ) : (
                        <AnnouncementFlatTable
                            infos={filtered}
                            linkedAssets={linkedAssets}
                            loading={loading}
                            onViewLinked={handleViewLinked}
                            onOpenPdf={handleOpenPdf}
                            onCopyPdf={handleCopyPdf}
                            onViewParams={handleViewParams}
                            onReveal={handleReveal}
                            onDelete={handleDelete}
                            onClaimOrphan={handleClaimOrphan}
                        />
                    )}
                </>
            )}
        </ListToolbar>
            <AnnouncementImportModal
                open={importOpen}
                onClose={() => setImportOpen(false)}
                prefill={importPrefill}
                orphanPdfPath={orphanPdfPath}
            />
            <Drawer
                title={
                    <Space size={8} wrap>
                        <span>公告参数</span>
                        <Text type="secondary" className="text-xs font-normal">
                            {paramsDrawer.info
                                ? [paramsDrawer.info.vehicleName || paramsDrawer.info.announceNo, paramsDrawer.info.batch].filter(Boolean).join(' · ')
                                : ''}
                        </Text>
                    </Space>
                }
                open={paramsDrawer.open}
                onClose={() => setParamsDrawer({ open: false, info: null })}
                width={560}
                destroyOnHidden
            >
                {paramsLoading ? (
                    <div className="py-10 text-center text-3 text-sm">加载中…</div>
                ) : recordParams ? (
                    <ParametersTable data={recordParams} />
                ) : null}
            </Drawer>
            <AnnouncementBatchDiffDrawer
                open={diffState.open}
                onClose={() => setDiffState(s => ({ ...s, open: false }))}
                announceNo={diffState.announceNo}
                batches={diffState.batches}
            />
            <AnnouncementBatchImportModal
                open={batchImportOpen}
                onClose={() => setBatchImportOpen(false)}
            />
            <AnnouncementMigrationModal
                open={migrationOpen}
                onClose={() => setMigrationOpen(false)}
            />
        </>
    );
};

export default AnnouncementArchiveList;
