import React, { useEffect, useMemo, useState } from 'react';
import { Drawer, Select, Space, Table, Tag, Typography, Alert, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../store/vehicleStore';
import { loadAssetFile } from '../../utils/assetManager';
import {
    batchSeq,
    readAnnouncementRecord,
    type AnnouncementInfo,
} from '../../utils/announcementRecord';
import { compareAssetWithAnnouncement } from '../../utils/announcementCompare';

const { Text } = Typography;

interface AnnouncementDiffDrawerProps {
    open: boolean;
    onClose: () => void;
    /** 发起比对的资产 */
    asset: { fileName: string; productName: string } | null;
    /** 该资产公告号命中的公告记录（多批次时默认最新，可切换） */
    candidates: AnnouncementInfo[];
}

/**
 * 「与公告对比」专用抽屉（设计文档 §4.5）：
 * 逐参数列 资产值 vs 公告值（基准列），不一致标红；公告为准。v1 只读。
 */
const AnnouncementDiffDrawer: React.FC<AnnouncementDiffDrawerProps> = ({ open, onClose, asset, candidates }) => {
    const { assetLibraryPath } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
    })));

    // 手动选择的批次；未选或所选不在候选中时跟随「最新批次」默认值（无 effect 参与）
    const [pickedJson, setPickedJson] = useState<string | null>(null);
    const sortedCandidates = useMemo(
        () => [...candidates].sort((a, b) => batchSeq(b.batch) - batchSeq(a.batch)),
        [candidates],
    );
    const selectedJson = pickedJson && sortedCandidates.some(c => c.jsonFile === pickedJson)
        ? pickedJson
        : sortedCandidates[0]?.jsonFile ?? null;

    // 两侧参数懒加载：一次加载一把（load + key 判定 loading，无需在 effect 里同步重置）
    const [load, setLoad] = useState<{
        key: string;
        status: 'ok' | 'error';
        assetParams: import('../../types').VehicleParameter[] | null;
        announceParams: import('../../types').VehicleParameter[] | null;
    } | null>(null);
    const loadKey = open && asset && selectedJson ? `${asset.fileName}|${selectedJson}` : null;

    useEffect(() => {
        if (!loadKey || !assetLibraryPath || !asset) return;
        let cancelled = false;
        Promise.all([
            loadAssetFile(assetLibraryPath, asset.fileName),
            readAnnouncementRecord(assetLibraryPath, selectedJson!),
        ]).then(([sheet, record]) => {
            if (cancelled) return;
            if (!sheet || !record) {
                setLoad({ key: loadKey, status: 'error', assetParams: null, announceParams: null });
                return;
            }
            setLoad({ key: loadKey, status: 'ok', assetParams: sheet.data, announceParams: record.parameters });
        }).catch(e => {
            console.error('加载对比数据失败', e);
            if (!cancelled) setLoad({ key: loadKey, status: 'error', assetParams: null, announceParams: null });
        });
        return () => { cancelled = true; };
    }, [loadKey, assetLibraryPath, asset, selectedJson]);

    const loading = !!loadKey && (!load || load.key !== loadKey);
    const loadError = !!load && load.key === loadKey && load.status === 'error';
    const assetParams = load && load.key === loadKey ? load.assetParams : null;
    const announceParams = load && load.key === loadKey ? load.announceParams : null;

    const result = useMemo(
        () => (assetParams && announceParams ? compareAssetWithAnnouncement(assetParams, announceParams) : null),
        [assetParams, announceParams],
    );

    const mismatchRows = result?.rows.filter(r => !r.match) ?? [];
    const matchRows = result?.rows.filter(r => r.match) ?? [];

    const columns: ColumnsType<(typeof mismatchRows)[number]> = [
        { title: '参数名', dataIndex: 'name', width: '32%', ellipsis: true },
        {
            title: '资产值',
            dataIndex: 'assetValue',
            width: '34%',
            ellipsis: true,
            render: (v: string) => <Text type="danger">{v || <Text type="secondary">（空）</Text>}</Text>,
        },
        { title: '公告值（基准）', dataIndex: 'announceValue', width: '34%', ellipsis: true },
    ];

    const sideList = (title: string, items: { name: string; value: string }[], tone: string) => (
        <div>
            <Text className={`text-xs font-medium ${tone}`}>{title}（{items.length}）</Text>
            <ul className="m-0 mt-1 pl-4 text-xs space-y-0.5 max-h-44 overflow-y-auto custom-scrollbar">
                {items.map(i => (
                    <li key={i.name}>
                        <Text>{i.name}</Text>
                        <Text type="secondary" className="ml-1.5">{i.value || '（空）'}</Text>
                    </li>
                ))}
            </ul>
        </div>
    );

    return (
        <Drawer
            title={
                <Space size={8} wrap>
                    <span>与公告对比</span>
                    <Text type="secondary" className="text-xs font-normal">{asset?.productName}</Text>
                </Space>
            }
            open={open}
            onClose={onClose}
            width={640}
            destroyOnHidden
        >
            <Space direction="vertical" className="w-full" size={12}>
                {candidates.length > 1 && (
                    <Space>
                        <Text type="secondary" className="text-xs">公告批次：</Text>
                        <Select
                            size="small"
                            value={selectedJson ?? undefined}
                            onChange={v => setPickedJson(v)}
                            style={{ minWidth: 220 }}
                            options={[...candidates]
                                .sort((a, b) => batchSeq(b.batch) - batchSeq(a.batch))
                                .map(c => ({
                                    value: c.jsonFile,
                                    label: `${c.batch || '无批次'}（${c.vehicleName || c.announceNo}）`,
                                }))}
                        />
                    </Space>
                )}

                {loading && (
                    <div className="py-10 flex justify-center"><Spin /></div>
                )}

                {loadError && (
                    <Alert type="error" showIcon message="加载对比数据失败（读取资产或公告记录失败）" />
                )}

                {!loading && !loadError && result && (
                    <>
                        <Alert
                            type={result.mismatchCount > 0 ? 'warning' : 'success'}
                            showIcon
                            icon={result.mismatchCount > 0 ? <CloseCircleFilled className="text-[color:var(--warning)]" /> : <CheckCircleFilled className="text-[color:var(--success)]" />}
                            message={
                                <span>
                                    共 {result.comparedCount} 项可比，{result.mismatchCount > 0
                                        ? <Text type="danger" className="font-medium">{result.mismatchCount} 项不一致</Text>
                                        : '全部一致'}
                                </span>
                            }
                        />

                        {mismatchRows.length > 0 && (
                            <div>
                                <Text className="text-xs font-medium text-[color:var(--warning)]">不一致项（公告为准）</Text>
                                <Table
                                    size="small"
                                    className="mt-1"
                                    rowKey="name"
                                    columns={columns}
                                    dataSource={mismatchRows}
                                    pagination={false}
                                    scroll={{ y: 280 }}
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            {sideList('仅公告有', result.onlyInAnnounce, 'text-brand')}
                            {sideList('仅资产有', result.onlyInAsset, 'text-2')}
                        </div>

                        {matchRows.length > 0 && (
                            <details>
                                <summary className="text-xs text-3 cursor-pointer select-none">
                                    一致项（{matchRows.length}）
                                </summary>
                                <div className="mt-1 text-xs space-y-0.5 max-h-40 overflow-y-auto custom-scrollbar">
                                    {matchRows.map(r => (
                                        <div key={r.name} className="flex justify-between gap-3">
                                            <span className="text-2">{r.name}</span>
                                            <span className="text-3">{r.assetValue || '（空）'}</span>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}

                        {result.comparedCount === 0 && result.onlyInAnnounce.length === 0 && result.onlyInAsset.length === 0 && (
                            <Tag>两侧均无参数可比</Tag>
                        )}
                    </>
                )}
            </Space>
        </Drawer>
    );
};

export default AnnouncementDiffDrawer;
