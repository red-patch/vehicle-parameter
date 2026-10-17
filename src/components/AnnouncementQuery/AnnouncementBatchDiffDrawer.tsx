import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Drawer, Empty, Select, Space, Spin, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../store/vehicleStore';
import { readAnnouncementRecord, type AnnouncementInfo } from '../../utils/announcementRecord';
import { compareBatchParams, type BatchCompareResult, type BatchCompareRow } from '../../utils/announcementCompare';
import { compactPagination } from '../common/tablePresets';

const { Text } = Typography;

interface AnnouncementBatchDiffDrawerProps {
    open: boolean;
    onClose: () => void;
    /** 公告号（标题展示） */
    announceNo: string;
    /** 该公告号全部批次记录（链头在前） */
    batches: AnnouncementInfo[];
}

const batchLabel = (info: AnnouncementInfo): string => info.batch || '（无批次）';

/**
 * 批次间参数对比抽屉（设计文档 §4.4，只读）：同公告号两批次逐参数核对，
 * 新批次为基准列，差异行高亮。参数经 readAnnouncementRecord 读时归一（含「其它」拆分）。
 * 对比对选择状态放内容组件——destroyOnHidden 关闭即卸载，重开自然回到默认相邻批次。
 */
const AnnouncementBatchDiffDrawer: React.FC<AnnouncementBatchDiffDrawerProps> = ({
    open,
    onClose,
    announceNo,
    batches,
}) => (
    <Drawer
        title={
            <Space size={8} wrap>
                <span>批次对比</span>
                <Text type="secondary" className="text-xs font-normal">{announceNo}</Text>
            </Space>
        }
        open={open}
        onClose={onClose}
        width={680}
        destroyOnHidden
    >
        {batches.length < 2 ? (
            <Empty description="该公告号只有一条批次，无可对比" />
        ) : (
            <BatchDiffBody batches={batches} />
        )}
    </Drawer>
);

const BatchDiffBody: React.FC<{ batches: AnnouncementInfo[] }> = ({ batches }) => {
    const { assetLibraryPath } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
    })));

    // 对比对：索引指向 batches（新→旧）。默认相邻两批次（0 vs 1）
    const [newIdx, setNewIdx] = useState(0);
    const [oldIdx, setOldIdx] = useState(() => (batches.length > 1 ? 1 : 0));

    const pairKey = batches[newIdx] && batches[oldIdx]
        ? `${batches[newIdx].jsonFile}|${batches[oldIdx].jsonFile}`
        : null;
    const [load, setLoad] = useState<{
        key: string;
        status: 'ok' | 'error';
        result: BatchCompareResult | null;
    } | null>(null);

    useEffect(() => {
        if (!pairKey || !assetLibraryPath) return;
        const newInfo = batches[newIdx];
        const oldInfo = batches[oldIdx];
        if (!newInfo?.jsonFile || !oldInfo?.jsonFile) return;
        let cancelled = false;
        Promise.all([
            readAnnouncementRecord(assetLibraryPath, newInfo.jsonFile),
            readAnnouncementRecord(assetLibraryPath, oldInfo.jsonFile),
        ]).then(([newRec, oldRec]) => {
            if (cancelled) return;
            if (!newRec || !oldRec) {
                setLoad({ key: pairKey, status: 'error', result: null });
                return;
            }
            setLoad({ key: pairKey, status: 'ok', result: compareBatchParams(oldRec.parameters, newRec.parameters) });
        }).catch(e => {
            console.error('加载批次参数失败', e);
            if (!cancelled) setLoad({ key: pairKey, status: 'error', result: null });
        });
        return () => { cancelled = true; };
    }, [pairKey, assetLibraryPath, batches, newIdx, oldIdx]);

    const loading = !!pairKey && (!load || load.key !== pairKey);
    const loadError = !!load && load.key === pairKey && load.status === 'error';
    const result = load && load.key === pairKey && load.status === 'ok' ? load.result : null;

    const changedRows = useMemo(() => result?.rows.filter(r => r.changed) ?? [], [result]);

    const columns: ColumnsType<BatchCompareRow> = [
        { title: '参数名', dataIndex: 'name', width: '32%', ellipsis: true },
        {
            title: `旧批次（${batches[oldIdx] ? batchLabel(batches[oldIdx]) : '—'}）`,
            dataIndex: 'oldValue',
            width: '32%',
            ellipsis: true,
            render: (v: string, row) => row.changed
                ? <Text type="danger">{v || <Text type="secondary">（缺失）</Text>}</Text>
                : <Text>{v}</Text>,
        },
        {
            title: `新批次（${batches[newIdx] ? batchLabel(batches[newIdx]) : '—'}·基准）`,
            dataIndex: 'newValue',
            width: '36%',
            ellipsis: true,
        },
    ];

    const batchOptions = batches.map((b, i) => ({ value: i, label: batchLabel(b) }));

    return (
        <>
            <Space size={8} wrap className="mb-3">
                <Text type="secondary" className="text-xs">对比：</Text>
                <Select
                    size="small"
                    value={newIdx}
                    options={batchOptions}
                    onChange={setNewIdx}
                    style={{ width: 200 }}
                />
                <Text type="secondary" className="text-xs">vs</Text>
                <Select
                    size="small"
                    value={oldIdx}
                    options={batchOptions}
                    onChange={setOldIdx}
                    style={{ width: 200 }}
                />
            </Space>
            {result && (
                <Alert
                    className="mb-3"
                    type={changedRows.length === 0 ? 'success' : 'warning'}
                    showIcon
                    message={`共 ${result.rows.length} 项参数 · 一致 ${result.sameCount} · 差异 ${result.changedCount}`}
                />
            )}
            {loading ? (
                <div className="py-10 text-center"><Spin /></div>
            ) : loadError ? (
                <Alert type="error" showIcon message="读取批次记录失败" />
            ) : result ? (
                <Table<BatchCompareRow>
                    size="small"
                    rowKey={r => r.name}
                    columns={columns}
                    dataSource={result.rows}
                    pagination={compactPagination()}
                    rowClassName={r => (r.changed ? 'diff-row' : '')}
                    locale={{ emptyText: <Empty description="两批次均无参数" /> }}
                />
            ) : null}
        </>
    );
};

export default AnnouncementBatchDiffDrawer;
