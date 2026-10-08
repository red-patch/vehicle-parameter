import { useState, type ReactNode } from 'react';
import { Modal, message } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../store/vehicleStore';
import {
    archiveAssetFile,
    loadAssetFile,
    loadAssetMeta,
    loadAssetTags,
    renameAssetIdentity,
    saveAssetMeta,
    setAssetFileTags,
    type AssetFileInfo,
    type AssetMetaMap,
} from '../../utils/assetManager';
import { buildDeprecateMeta, KEY_VEHICLE_TAG } from '../../utils/assetGovernance';
import { ensureTagsInDefaultGroup } from '../../utils/assetTagGroups';
import { getAssetDisplayName } from '../../utils/assetNaming';
import { downloadCsv } from '../../utils/downloadCsv';
import { useAnnouncementStore } from '../../store/announcementStore';
import {
    ANNOUNCEMENT_DIR_NAME,
    batchSeq,
    buildQueryUrl,
    matchAnnouncementsByNos,
    type AnnouncementInfo,
} from '../../utils/announcementRecord';
import AssetUpgradeModal from '../AssetLibrary/AssetUpgradeModal';
import AnnouncementDiffDrawer from './AnnouncementDiffDrawer';

/**
 * 资产对象级操作（设计文档 2026-10-01-asset-panel-layout-redesign §3.3）。
 *
 * 原先散在 DataSourcePanel 的 15 项动作收敛到此，供左栏（右键/快捷钮）、
 * 右栏摘要卡、资产检查器三处共用。约定：
 * - 动作自包含：读写走磁盘现读现改（loadAssetTags/loadAssetMeta 小 JSON），不依赖宿主缓存；
 * - 每个落盘动作最后 bumpAssetVersion()，各面板的重扫 effect 自动刷新（单一协同信号）；
 * - 弹层（重命名/升级导入/公告 PDF 选择/公告对比）状态在此，宿主渲染 `modals` 节点即可。
 */
export interface AssetActions {
    toggleActive: (info: AssetFileInfo, currentlyActive: boolean) => void;
    startRename: (info: AssetFileInfo) => void;
    /** 直接改名（快捷修复命名用）；displayName 不含扩展名 */
    renameTo: (info: AssetFileInfo, displayName: string, successMessage?: string | ((result: { fileName: string; productName: string }) => string)) => Promise<void>;
    toggleKeyVehicle: (info: AssetFileInfo) => Promise<void>;
    setStatus: (info: AssetFileInfo, status: 'superseded' | 'deprecated') => Promise<void>;
    saveTags: (fileName: string, tags: string[]) => Promise<void>;
    copyAnnounceNo: (info: AssetFileInfo) => void;
    viewAnnouncementPdf: (info: AssetFileInfo) => void;
    compareWithAnnouncement: (info: AssetFileInfo) => void;
    exportCsv: (info: AssetFileInfo) => void;
    openUpgrade: (info: AssetFileInfo) => void;
    revealInFinder: (info: AssetFileInfo) => void;
    openInEditor: (info: AssetFileInfo) => void;
    deleteAsset: (info: AssetFileInfo) => void;
    hardDelete: (info: AssetFileInfo) => void;
    modals: ReactNode;
}

interface UseAssetActionsOptions {
    focusedFile: string | null;
    onFocusFile: (fileName: string | null) => void;
}

export function useAssetActions({ focusedFile, onFocusFile }: UseAssetActionsOptions): AssetActions {
    const {
        assetLibraryPath, activeAssets, assetFiles,
        addActiveAsset, removeActiveAsset, renameActiveAsset,
        setAssetFiles, bumpAssetVersion, bumpAssetTagGroupsVersion,
    } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        activeAssets: state.activeAssets,
        assetFiles: state.assetFiles,
        addActiveAsset: state.addActiveAsset,
        removeActiveAsset: state.removeActiveAsset,
        renameActiveAsset: state.renameActiveAsset,
        setAssetFiles: state.setAssetFiles,
        bumpAssetVersion: state.bumpAssetVersion,
        bumpAssetTagGroupsVersion: state.bumpAssetTagGroupsVersion,
    })));

    // ===== 弹层状态 =====
    const [renameTarget, setRenameTarget] = useState<{ info: AssetFileInfo } | null>(null);
    const [editName, setEditName] = useState('');
    const [upgradeTarget, setUpgradeTarget] = useState<{ info: AssetFileInfo; tags: string[] } | null>(null);
    const [announcePdfPick, setAnnouncePdfPick] = useState<{
        open: boolean;
        productName: string;
        hits: AnnouncementInfo[];
        selected: string | null;
    }>({ open: false, productName: '', hits: [], selected: null });
    const [announceDiff, setAnnounceDiff] = useState<{
        open: boolean;
        asset: { fileName: string; productName: string } | null;
        candidates: AnnouncementInfo[];
    }>({ open: false, asset: null, candidates: [] });

    // ===== 工作集 =====
    const toggleActive = (info: AssetFileInfo, currentlyActive: boolean) => {
        if (!currentlyActive) {
            addActiveAsset(info.fileName, info.productName);
            onFocusFile(info.fileName);
            message.success(`已激活资产：${info.productName}`);
        } else {
            removeActiveAsset(info.fileName, info.productName);
            message.info(`已停用资产：${info.productName}`);
        }
    };

    // ===== 重命名（弹层 + 快捷修复共用一条落盘路径）=====
    const renameTo = async (
        info: AssetFileInfo,
        displayName: string,
        successMessage?: string | ((result: { fileName: string; productName: string }) => string),
    ) => {
        if (!assetLibraryPath || !displayName.trim()) return;
        const oldFileName = info.fileName;
        try {
            const result = await renameAssetIdentity(assetLibraryPath, oldFileName, displayName.trim());
            if (!result.success) {
                message.error('重命名失败');
                return;
            }
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
            message.success(
                typeof successMessage === 'function' ? successMessage(result) : (successMessage ?? '资产名称更新成功'),
            );
            if (focusedFile === oldFileName) onFocusFile(result.fileName);
            bumpAssetVersion();
        } catch {
            message.error('操作异常');
        }
    };

    const startRename = (info: AssetFileInfo) => {
        setEditName(getAssetDisplayName(info.fileName, info.productName));
        setRenameTarget({ info });
    };

    // ===== 标注（标签 / 关键车型 / 历史 / 废弃）=====
    const saveTags = async (fileName: string, tags: string[]) => {
        if (!assetLibraryPath) return;
        await setAssetFileTags(assetLibraryPath, fileName, tags);
        const groupsUpdated = await ensureTagsInDefaultGroup(assetLibraryPath, tags);
        if (groupsUpdated) bumpAssetTagGroupsVersion();
        bumpAssetVersion();
    };

    const toggleKeyVehicle = async (info: AssetFileInfo) => {
        if (!assetLibraryPath) return;
        const current = (await loadAssetTags(assetLibraryPath))[info.fileName] || [];
        const has = current.includes(KEY_VEHICLE_TAG);
        const nextTags = has ? current.filter(t => t !== KEY_VEHICLE_TAG) : [...current, KEY_VEHICLE_TAG];
        try {
            await setAssetFileTags(assetLibraryPath, info.fileName, nextTags);
            message.success(has ? '已取消关键车型标记' : '已标记为关键车型');
            bumpAssetVersion();
        } catch {
            message.error('标记失败');
        }
    };

    const setStatus = async (info: AssetFileInfo, status: 'superseded' | 'deprecated') => {
        if (!assetLibraryPath) return;
        const meta = await loadAssetMeta(assetLibraryPath);
        const current = meta[info.fileName] || {};
        const nextMeta = { ...current };
        if (current.status === status) delete nextMeta.status;
        else nextMeta.status = status;
        const next: AssetMetaMap = { ...meta };
        if (Object.keys(nextMeta).length === 0) delete next[info.fileName];
        else next[info.fileName] = nextMeta;
        await saveAssetMeta(assetLibraryPath, next);
        const labels = { superseded: '历史版本', deprecated: '废弃' } as const;
        message.success(nextMeta.status === status ? `已标记为${labels[status]}` : `已清除${labels[status]}标记`);
        bumpAssetVersion();
    };

    // ===== 公告关联 =====
    const findAnnouncementHits = (info: AssetFileInfo): AnnouncementInfo[] =>
        matchAnnouncementsByNos(useAnnouncementStore.getState().infos, info.announceNos || []);

    const openAnnouncementPdf = async (hit: AnnouncementInfo) => {
        if (!assetLibraryPath || !hit.pdfFile) {
            message.info('该公告记录还没有归档 PDF');
            return;
        }
        try {
            const { openPath } = await import('@tauri-apps/plugin-opener');
            const { join } = await import('@tauri-apps/api/path');
            await openPath(await join(assetLibraryPath, ANNOUNCEMENT_DIR_NAME, hit.pdfFile));
        } catch (e) {
            console.error('打开公告 PDF 失败', e);
            message.error('打开 PDF 失败');
        }
    };

    const handleAnnouncementMissing = (info: AssetFileInfo) => {
        const no = (info.announceNos || [])[0];
        Modal.confirm({
            title: '公告尚未归档',
            content: no
                ? `资产「${info.productName}」的公告 ${no} 还没有归档到公告中心。可先到工信部查询页下载参数与 PDF，再到公告中心归档。`
                : `资产「${info.productName}」没有可用的公告号，无法关联公告。`,
            okText: no ? '打开工信部查询页' : '知道了',
            cancelButtonProps: no ? undefined : { style: { display: 'none' } },
            onOk: no
                ? async () => {
                    const { openUrl } = await import('@tauri-apps/plugin-opener');
                    await openUrl(buildQueryUrl(no));
                }
                : undefined,
        });
    };

    const viewAnnouncementPdf = (info: AssetFileInfo) => {
        const hits = findAnnouncementHits(info);
        if (hits.length === 0) return handleAnnouncementMissing(info);
        const sorted = [...hits].sort((a, b) => batchSeq(b.batch) - batchSeq(a.batch));
        if (sorted.length === 1) {
            void openAnnouncementPdf(sorted[0]);
            return;
        }
        setAnnouncePdfPick({
            open: true,
            productName: info.productName,
            hits: sorted,
            selected: sorted[0].jsonFile || sorted[0].pdfFile || null,
        });
    };

    const compareWithAnnouncement = (info: AssetFileInfo) => {
        const hits = findAnnouncementHits(info);
        if (hits.length === 0) return handleAnnouncementMissing(info);
        setAnnounceDiff({ open: true, asset: { fileName: info.fileName, productName: info.productName }, candidates: hits });
    };

    const copyAnnounceNo = (info: AssetFileInfo) => {
        const announceNo = (info.announceNos || [])[0];
        if (!announceNo) {
            message.info('未找到公告号');
            return;
        }
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(announceNo).then(() => {
                message.success(`已复制公告号：${announceNo}`);
            }).catch(() => {
                message.error('复制失败，请手动复制');
            });
        } else {
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
    };

    // ===== 文件操作 =====
    const exportCsv = async (info: AssetFileInfo) => {
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
        } catch {
            message.error('导出失败');
        }
    };

    const openUpgrade = async (info: AssetFileInfo) => {
        const tags = assetLibraryPath ? ((await loadAssetTags(assetLibraryPath))[info.fileName] || []) : [];
        setUpgradeTarget({ info, tags });
    };

    const revealInFinder = async (info: AssetFileInfo) => {
        if (!assetLibraryPath) return;
        try {
            const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
            await revealItemInDir(`${assetLibraryPath}/${info.fileName}`);
        } catch (e) {
            message.error(`无法在 Finder 中打开: ${e}`);
        }
    };

    const openInEditor = async (info: AssetFileInfo) => {
        if (!assetLibraryPath) return;
        try {
            const { openPath } = await import('@tauri-apps/plugin-opener');
            await openPath(`${assetLibraryPath}/${info.fileName}`);
        } catch (e) {
            message.error(`无法打开文件: ${e}`);
        }
    };

    // ===== 删除（软删除 / 归档清理）=====
    const deleteAsset = (info: AssetFileInfo) => {
        Modal.confirm({
            title: '确认删除该资产？',
            icon: <ExclamationCircleOutlined className="text-danger" />,
            content: `「${info.fileName}」将标记为废弃并从列表隐藏（文件保留、可恢复）。如需彻底删除，请在「显示废弃」后使用「彻底删除（归档）」。`,
            okText: '确认删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                if (!assetLibraryPath) return;
                try {
                    const meta = await loadAssetMeta(assetLibraryPath);
                    await saveAssetMeta(assetLibraryPath, buildDeprecateMeta(meta, [info.fileName]));
                    removeActiveAsset(info.fileName, info.productName);
                    message.success('资产已标记为废弃（可在「显示废弃」中恢复）');
                    if (focusedFile === info.fileName) onFocusFile(null);
                    bumpAssetVersion();
                } catch {
                    message.error('删除失败');
                }
            }
        });
    };

    const hardDelete = (info: AssetFileInfo) => {
        Modal.confirm({
            title: '彻底删除该资产？',
            icon: <ExclamationCircleOutlined className="text-danger" />,
            content: `「${info.fileName}」将移入归档目录 _archive/（文件保留但退出资产管理），标签与治理标注一并清除。此操作不可在界面内撤销。`,
            okText: '彻底删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                if (!assetLibraryPath) return;
                try {
                    const success = await archiveAssetFile(assetLibraryPath, info.fileName);
                    if (success) {
                        removeActiveAsset(info.fileName, info.productName);
                        message.success('资产已归档清理');
                        if (focusedFile === info.fileName) onFocusFile(null);
                        bumpAssetVersion();
                    } else {
                        message.error('归档失败，文件可能不存在');
                    }
                } catch {
                    message.error('归档失败');
                }
            }
        });
    };

    // ===== 弹层（宿主渲染）=====
    const modals: ReactNode = (
        <>
            <Modal
                title="重命名资产"
                open={Boolean(renameTarget)}
                onOk={() => {
                    if (!renameTarget) return;
                    const nextName = editName.trim();
                    if (!nextName || nextName === getAssetDisplayName(renameTarget.info.fileName, renameTarget.info.productName)) {
                        setRenameTarget(null);
                        setEditName('');
                        return;
                    }
                    const info = renameTarget.info;
                    setRenameTarget(null);
                    setEditName('');
                    void renameTo(info, nextName);
                }}
                onCancel={() => { setRenameTarget(null); setEditName(''); }}
                okText="确认重命名"
                cancelText="取消"
                destroyOnClose
            >
                <div className="py-3">
                    <div className="text-[13px] text-2 mb-2">输入新的资产名称</div>
                    <input
                        className="ant-input"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && renameTarget) {
                                const nextName = editName.trim();
                                if (!nextName || nextName === getAssetDisplayName(renameTarget.info.fileName, renameTarget.info.productName)) {
                                    setRenameTarget(null);
                                    setEditName('');
                                    return;
                                }
                                const info = renameTarget.info;
                                setRenameTarget(null);
                                setEditName('');
                                void renameTo(info, nextName);
                            }
                        }}
                        placeholder="输入资产名称"
                        autoFocus
                    />
                </div>
            </Modal>
            <AssetUpgradeModal
                open={Boolean(upgradeTarget)}
                assetInfo={upgradeTarget?.info ?? null}
                assetTags={upgradeTarget?.tags ?? []}
                onClose={() => setUpgradeTarget(null)}
                onSaved={bumpAssetVersion}
            />
            <Modal
                title={`选择公告批次 — ${announcePdfPick.productName}`}
                open={announcePdfPick.open}
                onCancel={() => setAnnouncePdfPick(prev => ({ ...prev, open: false }))}
                onOk={() => {
                    const hit = announcePdfPick.hits.find(h => (h.jsonFile || h.pdfFile) === announcePdfPick.selected);
                    setAnnouncePdfPick(prev => ({ ...prev, open: false }));
                    if (hit) void openAnnouncementPdf(hit);
                }}
                okText="打开 PDF"
                okButtonProps={{ disabled: !announcePdfPick.selected }}
            >
                <select
                    className="w-full mt-2 ant-select"
                    value={announcePdfPick.selected ?? ''}
                    onChange={e => setAnnouncePdfPick(prev => ({ ...prev, selected: e.target.value || null }))}
                >
                    <option value="" disabled>选择批次</option>
                    {announcePdfPick.hits.map(h => (
                        <option key={h.jsonFile || h.pdfFile} value={h.jsonFile || h.pdfFile || ''}>
                            {`${h.batch || '无批次'}（${h.vehicleName || h.announceNo}${h.hasPdf ? '' : '，无 PDF'}）`}
                        </option>
                    ))}
                </select>
            </Modal>
            <AnnouncementDiffDrawer
                open={announceDiff.open}
                asset={announceDiff.asset}
                candidates={announceDiff.candidates}
                onClose={() => setAnnounceDiff(prev => ({ ...prev, open: false }))}
            />
        </>
    );

    return {
        toggleActive,
        startRename,
        renameTo,
        toggleKeyVehicle,
        setStatus,
        saveTags,
        copyAnnounceNo,
        viewAnnouncementPdf,
        compareWithAnnouncement,
        exportCsv,
        openUpgrade,
        revealInFinder,
        openInEditor,
        deleteAsset,
        hardDelete,
        modals,
    };
}
