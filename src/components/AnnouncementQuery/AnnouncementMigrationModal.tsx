import React, { useEffect, useState } from 'react';
import { Modal, Table, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useShallow } from 'zustand/react/shallow';
import { useAnnouncementStore } from '../../store/announcementStore';
import {
    collectAnnouncementMigrationCandidates,
    runAnnouncementMigration,
    type MigrationCandidate,
} from '../../utils/announcementMigration';
import { MODAL_TABLE_SCROLL_Y } from '../common/tablePresets';

const { Text, Paragraph } = Typography;

interface AnnouncementMigrationModalProps {
    open: boolean;
    onClose: () => void;
}

/**
 * 一次性迁移工具（设计文档 §6，Q15 裁定）：资产库「公告数据」资产 → 公告中心记录
 * （有参数、无 PDF），原资产文件移入废纸篓。迁移完成后资产库回归纯车型资产。
 */
const AnnouncementMigrationModal: React.FC<AnnouncementMigrationModalProps> = ({ open, onClose }) => {
    const refreshAnnouncements = useAnnouncementStore(useShallow(state => state.refresh));

    const [candidates, setCandidates] = useState<MigrationCandidate[]>([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [collecting, setCollecting] = useState(false);
    const [running, setRunning] = useState(false);

    useEffect(() => {
        if (!open) return;
        setCollecting(true);
        setCandidates([]);
        setSelectedRowKeys([]);
        import('../../store/vehicleStore').then(({ useVehicleStore }) => {
            const path = useVehicleStore.getState().assetLibraryPath;
            if (!path) {
                setCollecting(false);
                return;
            }
            collectAnnouncementMigrationCandidates(path)
                .then(list => {
                    setCandidates(list);
                    setSelectedRowKeys(list.map((_, i) => i));
                })
                .catch(e => console.error('收集迁移候选失败', e))
                .finally(() => setCollecting(false));
        });
    }, [open]);

    const columns: ColumnsType<MigrationCandidate> = [
        { title: '资产文件', dataIndex: 'fileName', ellipsis: true },
        { title: '公告号', dataIndex: 'announceNo', width: 180, ellipsis: true },
        { title: '批次', dataIndex: 'batch', width: 90, render: v => v || '—' },
        { title: '车型名', dataIndex: 'vehicleName', width: 140, ellipsis: true, render: v => v || '—' },
        { title: '参数数', dataIndex: 'paramCount', width: 70, align: 'right' },
    ];

    const handleRun = async () => {
        const { useVehicleStore } = await import('../../store/vehicleStore');
        const path = useVehicleStore.getState().assetLibraryPath;
        if (!path) return;
        const chosen = candidates.filter((_, i) => selectedRowKeys.includes(i));
        if (chosen.length === 0) return;
        setRunning(true);
        try {
            const result = await runAnnouncementMigration(path, chosen);
            await refreshAnnouncements();
            if (result.errors.length > 0) {
                message.warning(`迁移完成 ${result.migrated.length} 条，失败 ${result.errors.length} 条（详见控制台）`);
                console.error('迁移失败明细', result.errors);
            } else {
                message.success(`已迁移 ${result.migrated.length} 条公告数据，原资产文件已移入废纸篓`);
            }
            onClose();
        } catch (e) {
            console.error('迁移执行失败', e);
            message.error(`迁移失败：${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setRunning(false);
        }
    };

    return (
        <Modal
            title="从资产库迁移公告数据"
            open={open}
            onCancel={onClose}
            onOk={handleRun}
            okText={`迁移 ${selectedRowKeys.length} 条`}
            okButtonProps={{ danger: true, disabled: selectedRowKeys.length === 0 }}
            confirmLoading={running}
            width={860}
            destroyOnHidden
        >
            <Paragraph type="secondary" className="text-xs">
                每条「公告数据」资产将转为一条公告中心记录（参数带入、无 PDF），原资产文件移入废纸篓（可恢复）。
                迁移后资产库不再混入公告数据，公告号关联与「与公告对比」改由公告中心提供。
            </Paragraph>
            <Table<MigrationCandidate>
                size="small"
                rowKey={(_, i) => i ?? 0}
                columns={columns}
                dataSource={candidates}
                loading={collecting}
                pagination={false}
                scroll={{ y: MODAL_TABLE_SCROLL_Y }}
                rowSelection={{
                    selectedRowKeys,
                    onChange: keys => setSelectedRowKeys(keys),
                }}
                locale={{ emptyText: <Text type="secondary">资产库中没有待迁移的公告数据资产</Text> }}
            />
        </Modal>
    );
};

export default AnnouncementMigrationModal;
