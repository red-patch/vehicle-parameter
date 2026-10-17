import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Collapse, Input, Modal, Progress, Segmented, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import { warnLibraryPathMissing } from '../../utils/libraryPathPrompt';
import type { ColumnsType } from 'antd/es/table';
import { DesktopOutlined, DownloadOutlined, FileSearchOutlined, FolderOpenOutlined, ScanOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../store/vehicleStore';
import { useAnnouncementStore } from '../../store/announcementStore';
import { getAssetFilesWithInfo } from '../../utils/assetManager';
import {
    ANNOUNCEMENT_DIR_NAME,
    buildAnnouncementBaseName,
    buildQueryUrl,
    buildRecordFileNames,
    importPdfToArchive,
    moveToTrash,
    normalizeAnnounceNo,
    readAnnouncementRecord,
    uniquifyBaseName,
    writeAnnouncementRecord,
} from '../../utils/announcementRecord';
import {
    adjudicateCandidates,
    buildAssetNamingIndex,
    cancelPdfScan,
    collectArchivedHashes,
    resolveCandidateNaming,
    scanPdfCandidates,
    type AdjudicatedCandidate,
    type CandidateNaming,
    type PdfCandidate,
    type PdfScanProgress,
} from '../../utils/announcementScan';

const { Text } = Typography;

interface AnnouncementBatchImportModalProps {
    open: boolean;
    onClose: () => void;
}

type Phase = 'pick' | 'scanning' | 'review' | 'importing';

type GroupFilter = 'all' | 'fresh' | 'suspectFresh' | 'notDownloaded' | 'superseded' | 'duplicate' | 'archived';

const LAST_DIR_KEY = 'announcement-batch-scan-dir';

/** 候选行编辑态（文件路径 → 三要素） */
type EditMap = Record<string, CandidateNaming>;

const GROUP_META: Record<string, { label: string; color: string }> = {
    fresh: { label: '新公告', color: 'success' },
    suspectFresh: { label: '疑似', color: 'warning' },
    notDownloaded: { label: '未下载', color: 'processing' },
    superseded: { label: '旧版本', color: 'default' },
    duplicate: { label: '重复副本', color: 'default' },
    archived: { label: '已归档过', color: 'default' },
    other: { label: '非公告', color: 'default' },
};

const rowTag = (item: AdjudicatedCandidate): { label: string; color: string } => {
    if (item.group === 'fresh') {
        return item.candidate.confidence === 'announcement' ? GROUP_META.fresh : GROUP_META.suspectFresh;
    }
    return GROUP_META[item.group] ?? GROUP_META.other;
};

/**
 * 批量导入公告 PDF（设计文档 2026-10-01-announcement-batch-import）：
 * 选目录 → Rust 递归扫描+嗅探 → 候选表格（勾选/行内编辑）→ 批量归档。
 * 人工确认制：识别只预填与排序，勾选才入库。
 */
const AnnouncementBatchImportModal: React.FC<AnnouncementBatchImportModalProps> = ({ open, onClose }) => {
    const { assetLibraryPath } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
    })));
    const { infos: announcementInfos, refresh: refreshAnnouncements } = useAnnouncementStore(useShallow(state => ({
        infos: state.infos,
        refresh: state.refresh,
    })));

    const [phase, setPhase] = useState<Phase>('pick');
    const [rootDir, setRootDir] = useState('');
    const [progress, setProgress] = useState<PdfScanProgress>({ scanned: 0, total: 0, currentFile: '' });
    const [items, setItems] = useState<AdjudicatedCandidate[]>([]);
    const [truncated, setTruncated] = useState(false);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [edits, setEdits] = useState<EditMap>({});
    const [cleanupSource, setCleanupSource] = useState(false);
    /** 仅扫描已下载到本地的文件（默认开：iCloud 占位不 open、不触发下载） */
    const [onlyDownloaded, setOnlyDownloaded] = useState(true);
    const [importDone, setImportDone] = useState(0);
    const [scanCancelled, setScanCancelled] = useState(false);
    /** 分类查看（Q: 扫描结果按分组过滤展示） */
    const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');

    useEffect(() => {
        if (!open) return;
        setPhase('pick');
        setRootDir(() => {
            try { return localStorage.getItem(LAST_DIR_KEY) ?? ''; } catch { return ''; }
        });
        setItems([]);
        setChecked(new Set());
        setEdits({});
        setTruncated(false);
        setCleanupSource(false);
        setOnlyDownloaded(true);
        setImportDone(0);
        setScanCancelled(false);
        setGroupFilter('all');
    }, [open]);

    const pickDirectory = async () => {
        try {
            const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
            const picked = await openDialog({ directory: true, title: '选择要扫描的目录' });
            if (typeof picked === 'string' && picked) setRootDir(picked);
        } catch {
            message.error('选择目录失败（仅桌面端可用）');
        }
    };

    const jumpToQuickDir = async (kind: 'downloads' | 'desktop') => {
        try {
            const pathApi = await import('@tauri-apps/api/path');
            const dir = kind === 'downloads' ? await pathApi.downloadDir() : await pathApi.desktopDir();
            setRootDir(dir);
        } catch {
            message.error('获取系统目录失败');
        }
    };

    const startScan = async () => {
        if (!rootDir.trim()) {
            message.warning('请先选择要扫描的目录');
            return;
        }
        try { localStorage.setItem(LAST_DIR_KEY, rootDir); } catch { /* 忽略 */ }
        setPhase('scanning');
        setProgress({ scanned: 0, total: 0, currentFile: '' });
        try {
            const result = await scanPdfCandidates(rootDir.trim(), 6, !onlyDownloaded, p => setProgress(p));
            if (result.cancelled) {
                setScanCancelled(true);
                setPhase('pick');
                return;
            }
            setTruncated(result.truncated);
            await buildReview(result.candidates);
        } catch (e) {
            console.error('扫描失败', e);
            message.error(`扫描失败：${e instanceof Error ? e.message : String(e)}`);
            setPhase('pick');
        }
    };

    const handleCancelScan = async () => {
        await cancelPdfScan();
    };

    /** 扫描完成 → 采集已归档哈希 + 资产命名索引 → 三层裁决 → 初始化勾选与编辑态 */
    const buildReview = async (candidates: PdfCandidate[]) => {
        let adjudicated: AdjudicatedCandidate[] = [];
        if (assetLibraryPath) {
            const [archivedHashes, assets] = await Promise.all([
                collectArchivedHashes(assetLibraryPath, announcementInfos.filter(i => i.pdfFile).map(i => i.pdfFile!)),
                getAssetFilesWithInfo(assetLibraryPath).catch(() => []),
            ]);
            const recordKeys = new Set(
                announcementInfos
                    .filter(i => !i.orphan)
                    .map(i => `${normalizeAnnounceNo(i.announceNo)}|${i.batch ?? ''}`),
            );
            adjudicated = adjudicateCandidates(candidates, archivedHashes, recordKeys);
            const assetIndex = buildAssetNamingIndex(assets);
            const nextEdits: EditMap = {};
            adjudicated.forEach(item => {
                nextEdits[item.candidate.path] = resolveCandidateNaming(item.candidate, assetIndex);
            });
            setEdits(nextEdits);
        } else {
            adjudicated = adjudicateCandidates(candidates, new Set(), new Set());
            const nextEdits: EditMap = {};
            adjudicated.forEach(item => {
                nextEdits[item.candidate.path] = resolveCandidateNaming(item.candidate, new Map());
            });
            setEdits(nextEdits);
            message.warning('未设置资产库目录：无法反查车型名与已归档去重，仅按 PDF 内容预填');
        }
        setItems(adjudicated);
        setChecked(new Set(
            adjudicated
                .filter(i => i.group === 'fresh' && i.candidate.confidence === 'announcement')
                .map(i => i.candidate.path),
        ));
        setPhase('review');
    };

    const editableRows = useMemo(
        () => items.filter(i => i.group !== 'other'),
        [items],
    );
    const otherRows = useMemo(() => items.filter(i => i.group === 'other'), [items]);

    /** 分类计数（Segmented 标签上的数字） */
    const groupCounts = useMemo(() => {
        const counts: Record<GroupFilter, number> = {
            all: editableRows.length, fresh: 0, suspectFresh: 0,
            notDownloaded: 0, superseded: 0, duplicate: 0, archived: 0,
        };
        editableRows.forEach(i => {
            if (i.group === 'fresh') {
                counts[i.candidate.confidence === 'announcement' ? 'fresh' : 'suspectFresh']++;
            } else if (i.group !== 'other') {
                counts[i.group]++;
            }
        });
        return counts;
    }, [editableRows]);

    /** 当前分类下展示的行（分类只影响展示，勾选状态与导入范围不受影响） */
    const displayRows = useMemo(() => {
        if (groupFilter === 'all') return editableRows;
        return editableRows.filter(i => {
            if (groupFilter === 'fresh') return i.group === 'fresh' && i.candidate.confidence === 'announcement';
            if (groupFilter === 'suspectFresh') return i.group === 'fresh' && i.candidate.confidence !== 'announcement';
            return i.group === groupFilter;
        });
    }, [editableRows, groupFilter]);

    /** 用系统默认应用打开（未下载文件会先触发 iCloud 下载） */
    const openInDefaultApp = async (path: string) => {
        try {
            const { openPath } = await import('@tauri-apps/plugin-opener');
            await openPath(path);
        } catch (e) {
            console.error('打开文件失败', e);
            message.error('打开文件失败');
        }
    };

    /** 在 Finder 中定位 */
    const revealInFinder = async (path: string) => {
        try {
            const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
            await revealItemInDir(path);
        } catch (e) {
            console.error('定位文件失败', e);
            message.error('定位文件失败');
        }
    };

    const updateEdit = (path: string, patch: Partial<CandidateNaming>) => {
        setEdits(prev => ({ ...prev, [path]: { ...prev[path], ...patch } }));
    };

    /** 批量归档：逐份落盘，替换/并存策略与单文件导入一致（Q12） */
    const startImport = async () => {
        if (!assetLibraryPath) {
            warnLibraryPathMissing();
            return;
        }
        const selected = editableRows.filter(i => checked.has(i.candidate.path));
        if (selected.length === 0) {
            message.warning('请先勾选要归档的候选');
            return;
        }
        setPhase('importing');
        setImportDone(0);

        const taken = new Set<string>();
        announcementInfos.forEach(i => {
            if (i.jsonFile) taken.add(i.jsonFile.replace(/\.json$/i, ''));
            if (i.pdfFile) taken.add(i.pdfFile.replace(/\.pdf$/i, ''));
        });
        const usedKeys = new Set(
            announcementInfos.filter(i => !i.orphan).map(i => `${normalizeAnnounceNo(i.announceNo)}|${i.batch ?? ''}`),
        );

        let archived = 0;
        const failures: { file: string; reason: string }[] = [];

        for (const item of selected) {
            const naming = edits[item.candidate.path];
            const label = item.candidate.fileName;
            try {
                const announceNo = (naming?.announceNo ?? '').trim();
                const batch = (naming?.batch ?? '').trim();
                const vehicleName = (naming?.vehicleName ?? '').trim();
                if (!announceNo) {
                    failures.push({ file: label, reason: '缺少公告号' });
                    continue;
                }
                const key = `${normalizeAnnounceNo(announceNo)}|${batch}`;
                if (usedKeys.has(key) && !item.replacesArchived) {
                    failures.push({ file: label, reason: '同公告号+批次的归档已存在（本批重复）' });
                    continue;
                }

                const existingSame = announcementInfos.find(
                    i => !i.orphan
                        && normalizeAnnounceNo(i.announceNo) === normalizeAnnounceNo(announceNo)
                        && (i.batch ?? '') === batch,
                );
                const oldRecord = existingSame?.jsonFile
                    ? await readAnnouncementRecord(assetLibraryPath, existingSame.jsonFile)
                    : null;

                let baseName: string;
                const stalePaths: string[] = [];
                if (existingSame?.jsonFile && item.replacesArchived) {
                    baseName = existingSame.jsonFile.replace(/\.json$/i, '');
                    stalePaths.push(await joinPath(assetLibraryPath, ANNOUNCEMENT_DIR_NAME, existingSame.jsonFile));
                    if (existingSame.pdfFile) {
                        stalePaths.push(await joinPath(assetLibraryPath, ANNOUNCEMENT_DIR_NAME, existingSame.pdfFile));
                    }
                } else {
                    baseName = uniquifyBaseName(
                        buildAnnouncementBaseName({ vehicleName, announceNo, batch }),
                        taken,
                    );
                }
                taken.add(baseName);
                usedKeys.add(key);

                const { jsonName, pdfName } = buildRecordFileNames(baseName);
                await importPdfToArchive(assetLibraryPath, item.candidate.path, pdfName);
                if (stalePaths.length > 0) await moveToTrash(stalePaths);
                if (cleanupSource) await moveToTrash([item.candidate.path]);

                await writeAnnouncementRecord(assetLibraryPath, jsonName, {
                    version: '1.0',
                    announceNo,
                    batch,
                    vehicleName,
                    sourceUrl: oldRecord?.sourceUrl || buildQueryUrl(announceNo),
                    importedAt: new Date().toISOString(),
                    pdfFile: pdfName,
                    parameters: oldRecord?.parameters ?? [],
                });
                archived++;
            } catch (e) {
                console.error('批量归档单份失败', label, e);
                failures.push({ file: label, reason: e instanceof Error ? e.message : String(e) });
            } finally {
                setImportDone(done => done + 1);
            }
        }

        await refreshAnnouncements();
        const skipped = selected.length - archived - failures.length;
        message.info(
            `批量归档完成：成功 ${archived} 份、跳过 ${Math.max(0, skipped)} 份、失败 ${failures.length} 份`,
        );
        if (failures.length > 0) {
            console.warn('批量归档失败明细', failures);
            Modal.warning({
                title: `有 ${failures.length} 份归档失败`,
                content: (
                    <ul className="m-0 pl-4 text-xs max-h-48 overflow-y-auto">
                        {failures.map(f => (
                            <li key={f.file}><Text className="font-medium">{f.file}</Text>：{f.reason}</li>
                        ))}
                    </ul>
                ),
                width: 520,
            });
        }
        onClose();
    };

    const columns: ColumnsType<AdjudicatedCandidate> = [
        {
            title: '状态',
            key: 'group',
            width: 90,
            render: (_, item) => {
                const tag = rowTag(item);
                return <Tag color={tag.color}>{tag.label}</Tag>;
            },
        },
        {
            title: '文件名',
            key: 'file',
            ellipsis: true,
            render: (_, item) => (
                <Tooltip title={item.candidate.path}>
                    <span>{item.candidate.fileName}</span>
                    {item.candidate.error && (
                        <Tooltip title={item.candidate.error}><Text type="warning" className="ml-1 text-xs">⚠</Text></Tooltip>
                    )}
                </Tooltip>
            ),
        },
        {
            title: '公告号',
            key: 'announceNo',
            width: 190,
            render: (_, item) => (
                <Input
                    size="small"
                    value={edits[item.candidate.path]?.announceNo ?? ''}
                    onChange={e => updateEdit(item.candidate.path, { announceNo: e.target.value })}
                    placeholder="人工填写"
                />
            ),
        },
        {
            title: '批次',
            key: 'batch',
            width: 90,
            render: (_, item) => (
                <Input
                    size="small"
                    value={edits[item.candidate.path]?.batch ?? ''}
                    onChange={e => updateEdit(item.candidate.path, { batch: e.target.value })}
                    placeholder="可空"
                />
            ),
        },
        {
            title: '车型名',
            key: 'vehicleName',
            width: 170,
            render: (_, item) => (
                <Input
                    size="small"
                    value={edits[item.candidate.path]?.vehicleName ?? ''}
                    onChange={e => updateEdit(item.candidate.path, { vehicleName: e.target.value })}
                    placeholder="人工填写"
                />
            ),
        },
        {
            title: '修改时间',
            key: 'mtime',
            width: 100,
            render: (_, item) => (
                <Text type="secondary" className="text-xs">
                    {new Date(item.candidate.modifiedMs).toLocaleDateString('zh-CN')}
                </Text>
            ),
        },
        {
            title: '查看',
            key: 'actions',
            width: 140,
            render: (_, item) => (
                <Space size={0}>
                    <Tooltip title={
                        item.group === 'notDownloaded'
                            ? '用默认应用打开（首次打开会先自动下载该文件）'
                            : '用默认应用打开，核查内容后回来填写'
                    }>
                        <Button type="link" size="small" icon={<FileSearchOutlined />} onClick={() => openInDefaultApp(item.candidate.path)}>
                            打开
                        </Button>
                    </Tooltip>
                    <Tooltip title="在文件夹中定位该文件">
                        <Button type="link" size="small" icon={<FolderOpenOutlined />} onClick={() => revealInFinder(item.candidate.path)}>
                            定位
                        </Button>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <Modal
            title="批量导入公告 PDF"
            open={open}
            onCancel={onClose}
            footer={phase === 'review' ? (
                <Space>
                    <Checkbox
                        checked={cleanupSource}
                        onChange={e => setCleanupSource(e.target.checked)}
                    >
                        归档后把原件移入废纸篓
                    </Checkbox>
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" disabled={checked.size === 0} onClick={startImport}>
                        归档选中的 {checked.size} 份
                    </Button>
                </Space>
            ) : undefined}
            width={960}
            destroyOnHidden
            maskClosable={false}
        >
            {phase === 'pick' && (
                <div className="space-y-3 py-2">
                    {scanCancelled && <Alert type="warning" showIcon message="扫描已取消" />}
                    <Space.Compact className="w-full">
                        <Input
                            placeholder="选择要扫描的目录（含子目录，深度 6 层）"
                            value={rootDir}
                            onChange={e => setRootDir(e.target.value)}
                        />
                        <Button icon={<FolderOpenOutlined />} onClick={pickDirectory}>选择目录</Button>
                    </Space.Compact>
                    <Space>
                        <Button size="small" icon={<DownloadOutlined />} onClick={() => jumpToQuickDir('downloads')}>下载</Button>
                        <Button size="small" icon={<DesktopOutlined />} onClick={() => jumpToQuickDir('desktop')}>桌面</Button>
                    </Space>
                    <div>
                        <Checkbox
                            checked={onlyDownloaded}
                            onChange={e => setOnlyDownloaded(e.target.checked)}
                        >
                            仅扫描已下载到本地的文件（跳过 iCloud 占位，不触发下载；它们会以「未下载」从文件名预填）
                        </Checkbox>
                    </div>
                    <div>
                        <Button type="primary" icon={<ScanOutlined />} disabled={!rootDir.trim()} onClick={startScan}>
                            开始扫描
                        </Button>
                    </div>
                    <Text type="secondary" className="text-xs block">
                        扫描自动跳过隐藏目录、Library、node_modules 与公告归档目录本身；候选超过 5000 份时截断。
                    </Text>
                </div>
            )}

            {phase === 'scanning' && (
                <div className="py-8 space-y-3">
                    <Progress
                        percent={progress.total > 0 ? Math.round((progress.scanned / progress.total) * 100) : 0}
                        status="active"
                    />
                    <div className="text-xs text-3 truncate">
                        {progress.total > 0
                            ? `${progress.scanned} / ${progress.total} ｜ ${progress.currentFile}`
                            : '正在遍历目录…'}
                    </div>
                    <Button size="small" onClick={handleCancelScan}>取消扫描</Button>
                </div>
            )}

            {phase === 'importing' && (
                <div className="py-8 space-y-3">
                    <Progress
                        percent={editableRows.filter(i => checked.has(i.candidate.path)).length > 0
                            ? Math.round((importDone / checked.size) * 100)
                            : 0}
                        status="active"
                    />
                    <div className="text-xs text-3">正在归档 {importDone} / {checked.size} 份…</div>
                </div>
            )}

            {phase === 'review' && (
                <div className="space-y-3">
                    {truncated && (
                        <Alert type="warning" showIcon message="候选数量达到上限，结果已截断——建议换更具体的子目录重新扫描" />
                    )}
                    <Alert
                        type="info"
                        showIcon
                        message={`识别出公告候选 ${editableRows.length} 份（默认勾选高置信 ${checked.size} 份）；公告号/批次/车型名已按「PDF 提取 → 反查资产库」预填，可直接行内修改。「打开」用默认应用查看内容，核查后回来填写。`}
                    />
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <Segmented
                            value={groupFilter}
                            onChange={v => setGroupFilter(v as GroupFilter)}
                            options={[
                                { label: `全部 ${groupCounts.all}`, value: 'all' },
                                { label: `新公告 ${groupCounts.fresh}`, value: 'fresh' },
                                { label: `疑似 ${groupCounts.suspectFresh}`, value: 'suspectFresh' },
                                { label: `未下载 ${groupCounts.notDownloaded}`, value: 'notDownloaded' },
                                { label: `旧版本 ${groupCounts.superseded}`, value: 'superseded' },
                                { label: `重复 ${groupCounts.duplicate}`, value: 'duplicate' },
                                { label: `已归档 ${groupCounts.archived}`, value: 'archived' },
                            ]}
                        />
                        <Text type="secondary" className="text-xs">当前分类显示 {displayRows.length} 行；勾选与归档范围跨分类保持</Text>
                    </div>
                    <Table<AdjudicatedCandidate>
                        size="small"
                        rowKey={i => i.candidate.path}
                        columns={columns}
                        dataSource={displayRows}
                        pagination={{ pageSize: 15, showSizeChanger: false }}
                        rowSelection={{
                            selectedRowKeys: [...checked],
                            onChange: keys => setChecked(new Set(keys as string[])),
                            // 分类切换会换 dataSource：不声明此项，antd 会把「不在当前数据源」的
                            // 选中键静默丢弃——默认勾上的新公告在疑似分类下打勾就会消失
                            preserveSelectedRowKeys: true,
                        }}
                    />
                    {otherRows.length > 0 && (
                        <Collapse
                            size="small"
                            items={[{
                                key: 'other',
                                label: `非公告 PDF（${otherRows.length} 份，已折叠）`,
                                children: (
                                    <ul className="m-0 pl-4 text-xs space-y-0.5 max-h-40 overflow-y-auto custom-scrollbar">
                                        {otherRows.map(i => (
                                            <li key={i.candidate.path} className="text-3">{i.candidate.fileName}</li>
                                        ))}
                                    </ul>
                                ),
                            }]}
                        />
                    )}
                </div>
            )}
        </Modal>
    );
};

const joinPath = async (...parts: string[]): Promise<string> => {
    const { join } = await import('@tauri-apps/api/path');
    return join(...parts);
};

export default AnnouncementBatchImportModal;
