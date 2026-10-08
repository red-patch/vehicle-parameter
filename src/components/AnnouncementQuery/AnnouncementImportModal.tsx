import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Input, Form, Radio, Checkbox, Button, Space, Typography, message } from 'antd';
import { FilePdfOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../store/vehicleStore';
import { useAnnouncementStore } from '../../store/announcementStore';
import {
    ANNOUNCEMENT_DIR_NAME,
    buildAnnouncementBaseName,
    buildRecordFileNames,
    buildQueryUrl,
    importPdfToArchive,
    moveToTrash,
    normalizeAnnounceNo,
    readAnnouncementRecord,
    uniquifyBaseName,
    writeAnnouncementRecord,
} from '../../utils/announcementRecord';
import type { VehicleParameter } from '../../types';

const { Text } = Typography;

export interface AnnouncementImportPrefill {
    vehicleName?: string;
    announceNo?: string;
    batch?: string;
}

interface AnnouncementImportModalProps {
    open: boolean;
    onClose: () => void;
    /** 打开时预填（粘贴流程上下文 / 孤儿认领反解） */
    prefill?: AnnouncementImportPrefill | null;
    /** 粘贴流程带入的解析参数（写入记录 JSON）；独立归档 PDF 时为空 */
    params?: VehicleParameter[] | null;
    /** 孤儿认领：已归档 PDF 的绝对路径（源已在归档目录内） */
    orphanPdfPath?: string | null;
    /** 外部指定源文件（回应用时检查的「立即归档」入口），跳过文件选择 */
    initialPdfPath?: string | null;
}

const baseNameOf = (fileName: string | null | undefined, ext: string): string | null => {
    if (!fileName) return null;
    return fileName.toLowerCase().endsWith(ext) ? fileName.slice(0, -ext.length) : null;
};

const pathBaseName = (p: string): string => p.split(/[\\/]/).pop() || p;

const joinPath = async (...parts: string[]): Promise<string> => {
    const { join } = await import('@tauri-apps/api/path');
    return join(...parts);
};

/**
 * 公告 PDF 导入弹窗（设计文档 §4.2）：
 * 复制到 {资产库}/公告PDF/；同公告号同批次默认替换（可并存加序号）；
 * 可选「归档后把原文件移到废纸篓」。
 */
const AnnouncementImportModal: React.FC<AnnouncementImportModalProps> = ({
    open,
    onClose,
    prefill,
    params,
    orphanPdfPath,
    initialPdfPath,
}) => {
    const { assetLibraryPath } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
    })));
    const { infos, refresh } = useAnnouncementStore(useShallow(state => ({
        infos: state.infos,
        refresh: state.refresh,
    })));

    const [pdfPath, setPdfPath] = useState<string | null>(null);
    const [vehicleName, setVehicleName] = useState('');
    const [announceNo, setAnnounceNo] = useState('');
    const [batch, setBatch] = useState('');
    const [conflictMode, setConflictMode] = useState<'replace' | 'keep'>('replace');
    const [cleanupSource, setCleanupSource] = useState(false);
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        if (!open) return;
        setPdfPath(orphanPdfPath ?? initialPdfPath ?? null);
        setVehicleName(prefill?.vehicleName ?? '');
        setAnnounceNo(prefill?.announceNo ?? '');
        setBatch(prefill?.batch ?? '');
        setConflictMode('replace');
        setCleanupSource(false);
        setImporting(false);
    }, [open, prefill, params, orphanPdfPath, initialPdfPath]);

    /** 同公告号 + 同批次的已有记录（Q12：再导入默认替换） */
    const existingSame = useMemo(() => {
        const no = normalizeAnnounceNo(announceNo);
        if (!no) return null;
        return infos.find(
            i => !i.orphan
                && normalizeAnnounceNo(i.announceNo) === no
                && (i.batch || '') === batch.trim(),
        ) ?? null;
    }, [infos, announceNo, batch]);

    const baseName = useMemo(
        () => buildAnnouncementBaseName({ vehicleName, announceNo, batch }),
        [vehicleName, announceNo, batch],
    );

    const handlePickPdf = async () => {
        try {
            const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
            const picked = await openDialog({
                multiple: false,
                title: '选择公告 PDF 文件',
                filters: [{ name: 'PDF', extensions: ['pdf'] }],
            });
            if (typeof picked === 'string' && picked) {
                setPdfPath(picked);
            }
        } catch {
            message.error('选择文件失败（该功能仅桌面端可用）');
        }
    };

    const handleImport = async () => {
        if (!assetLibraryPath) {
            message.warning('请先在数据源面板设置资产库目录');
            return;
        }
        if (!announceNo.trim()) {
            message.warning('请填写公告号');
            return;
        }
        if (!pdfPath) {
            message.warning('请选择要归档的 PDF 文件');
            return;
        }
        setImporting(true);
        try {
            // 读取将被替换的旧记录（保留其参数与来源），再移除旧文件对
            const oldRecord = existingSame
                ? await readAnnouncementRecord(assetLibraryPath, existingSame.jsonFile)
                : null;

            const taken = new Set<string>();
            infos.forEach(i => {
                const j = baseNameOf(i.jsonFile, '.json');
                if (j) taken.add(j);
                const p = baseNameOf(i.pdfFile, '.pdf');
                if (p) taken.add(p);
            });

            const wantedBase = buildAnnouncementBaseName({ vehicleName, announceNo, batch });
            let baseName: string;
            const stalePaths: string[] = [];
            if (existingSame && conflictMode === 'replace') {
                // 替换：移除旧记录对（含旧文件名编码的旧车型名），按新字段写新对
                baseName = baseNameOf(existingSame.jsonFile, '.json') || wantedBase;
                stalePaths.push(await joinPath(assetLibraryPath, ANNOUNCEMENT_DIR_NAME, existingSame.jsonFile));
                if (existingSame.pdfFile) {
                    stalePaths.push(await joinPath(assetLibraryPath, ANNOUNCEMENT_DIR_NAME, existingSame.pdfFile));
                }
            } else {
                // 无冲突 / 保留两份：撞名自动加 (2) 序号
                baseName = uniquifyBaseName(wantedBase, taken);
            }

            const { jsonName, pdfName } = buildRecordFileNames(baseName);
            const { skipped } = await importPdfToArchive(assetLibraryPath, pdfPath, pdfName);

            if (stalePaths.length > 0) {
                await moveToTrash(stalePaths);
            }
            // 孤儿认领改名：旧 PDF 已复制到新名，源文件清理掉避免残留孤儿
            if (orphanPdfPath && !skipped) {
                await moveToTrash([orphanPdfPath]);
            }
            if (cleanupSource && !skipped && !orphanPdfPath) {
                await moveToTrash([pdfPath]);
            }

            const record = {
                version: '1.0',
                announceNo: announceNo.trim(),
                batch: batch.trim(),
                vehicleName: vehicleName.trim(),
                sourceUrl: oldRecord?.sourceUrl || buildQueryUrl(announceNo.trim()),
                importedAt: new Date().toISOString(),
                pdfFile: pdfName,
                parameters: params ?? oldRecord?.parameters ?? [],
            };
            await writeAnnouncementRecord(assetLibraryPath, jsonName, record);
            await refresh();
            message.success(`已归档：${pdfName}`);
            onClose();
        } catch (e) {
            console.error('公告 PDF 归档失败', e);
            message.error(`归档失败：${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setImporting(false);
        }
    };

    return (
        <Modal
            title="归档公告 PDF"
            open={open}
            onCancel={onClose}
            onOk={handleImport}
            okText="归档"
            confirmLoading={importing}
            okButtonProps={{ disabled: !announceNo.trim() || !pdfPath || !baseName }}
            destroyOnHidden
        >
            <Form layout="vertical" className="mt-2">
                <Form.Item label="公告 PDF" required>
                    <Space>
                        <Button icon={<FolderOpenOutlined />} onClick={handlePickPdf}>
                            选择 PDF 文件
                        </Button>
                        {pdfPath && (
                            <Text className="text-xs" copyable={{ text: pdfPath }}>
                                <FilePdfOutlined className="text-danger" /> {pathBaseName(pdfPath)}
                            </Text>
                        )}
                    </Space>
                </Form.Item>
                <Form.Item label="车型名" required={false}>
                    <Input
                        placeholder="如：远程V8E（默认取解析参数的产品名称）"
                        value={vehicleName}
                        onChange={e => setVehicleName(e.target.value)}
                    />
                </Form.Item>
                <Form.Item label="公告号" required>
                    <Input
                        placeholder="如：DNC5037XXYBEVP1"
                        value={announceNo}
                        onChange={e => setAnnounceNo(e.target.value)}
                    />
                </Form.Item>
                <Form.Item label="公告批次（可空）">
                    <Input
                        placeholder="如：第389批（默认取解析参数的批次字段）"
                        value={batch}
                        onChange={e => setBatch(e.target.value)}
                    />
                </Form.Item>
                {baseName && (
                    <Form.Item label="归档文件名">
                        <Text code className="text-xs">{baseName}.pdf / {baseName}.json</Text>
                    </Form.Item>
                )}
                {existingSame && (
                    <Form.Item label="已存在同公告号同批次的归档">
                        <Radio.Group
                            value={conflictMode}
                            onChange={e => setConflictMode(e.target.value)}
                        >
                            <Radio value="replace">替换原文件（移入废纸篓后写入新档）</Radio>
                            <Radio value="keep">保留两份（新档自动加序号）</Radio>
                        </Radio.Group>
                    </Form.Item>
                )}
                <Checkbox
                    checked={cleanupSource}
                    onChange={e => setCleanupSource(e.target.checked)}
                    disabled={!!orphanPdfPath}
                >
                    归档后把原文件移到废纸篓
                </Checkbox>
            </Form>
        </Modal>
    );
};

export default AnnouncementImportModal;
