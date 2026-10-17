// 智能填报 · 多车取数模式（投标字段关联）
// 按已保存的字段关联方案，批量拉取多个车型的参数值：
// 行 = 投标目标字段（规则），列 = 车型；支持多来源组合（如 外扩尺寸 = 长×宽×高）、
// 逐来源候选手选、单元格手工修正，最终导出 CSV / Excel
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Dropdown, Empty, Input, Popover, Select, Space, Spin, Tag } from 'antd';
import { ClearOutlined, DownloadOutlined, DownOutlined, EditOutlined, ExportOutlined, FileExcelOutlined, SettingOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import * as XLSX from 'xlsx';
import { useVehicleStore } from '../../store/vehicleStore';
import { getBidSchemesSync } from '../../utils/bidFieldMapping';
import { composeRuleValue, resolveRuleSources } from '../../utils/bidFieldMapping';
import type { BidFieldRule, BidMappingScheme, SourcePick, SourceResolution } from '../../utils/bidFieldMapping';
import { downloadCsv } from '../../utils/downloadCsv';
import { getVehicleSelectionStates } from '../../utils/vehicleSelectionState';
import { getVehicleProductName } from '../../utils/vehicleInstance';
import ProductSourceSelector from './ProductSourceSelector';
import BidMappingDrawer from './BidMappingDrawer';
import DataTable from '../common/DataTable';
import ListToolbar from '../common/ListToolbar';
import GuideEmpty from '../common/GuideEmpty';
import RepairableValue from '../common/RepairableValue';
import { buildRepairContext, getAssetBackedSourceFile } from './quickRepair';

interface BidPullViewProps {
    onGoRepair?: () => void;
}

interface PullRow {
    key: string;
    rule: BidFieldRule;
    /** vehicleKey(instanceKey) → 逐来源解析结果 */
    cells: Map<string, SourceResolution[]>;
}

interface VehicleData {
    name: string;
    params: Map<string, string | number>;
    candidates: { id: string; group: string; name: string; value: string | number }[];
}

/** 单元格手工修正编辑器（Popover 内输入终稿值） */
const CellEditor: React.FC<{
    value: string;
    overridden: boolean;
    onSave: (value: string) => void;
    onReset: () => void;
}> = ({ value, overridden, onSave, onReset }) => {
    const [draft, setDraft] = useState(value);
    return (
        <Popover
            trigger="click"
            placement="left"
            onOpenChange={(open) => open && setDraft(value)}
            content={
                <div className="w-64">
                    <Input.TextArea
                        rows={2}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="输入终稿值（留空视为未修正）"
                    />
                    <div className="mt-2 flex justify-between">
                        <Button
                            size="small"
                            disabled={!overridden}
                            onClick={() => {
                                onReset();
                            }}
                        >
                            恢复自动
                        </Button>
                        <Button
                            size="small"
                            type="primary"
                            onClick={() => {
                                onSave(draft.trim());
                            }}
                        >
                            保存修正
                        </Button>
                    </div>
                </div>
            }
        >
            <Button size="small" type="text" icon={<EditOutlined className="text-3" />} />
        </Popover>
    );
};

const BidPullView: React.FC<BidPullViewProps> = ({ onGoRepair }) => {
    const {
        uploadedFiles,
        assetFiles,
        activeAssets,
        localSelection,
        setLocalSelection,
        setPurifyProduct,
        setRepairContext,
        bidPullSchemeId,
        setBidPullSchemeId,
        bidMappingsVersion,
    } = useVehicleStore(
        useShallow((state) => ({
            uploadedFiles: state.uploadedFiles,
            assetFiles: state.assetFiles,
            activeAssets: state.activeAssets,
            localSelection: state.currentBidPullProducts,
            setLocalSelection: state.setBidPullProducts,
            setPurifyProduct: state.setPurifyProduct,
            setRepairContext: state.setRepairContext,
            bidPullSchemeId: state.bidPullSchemeId,
            setBidPullSchemeId: state.setBidPullSchemeId,
            bidMappingsVersion: state.bidMappingsVersion,
        }))
    );
    const { selectedProductNames: globalSelection } = useVehicleStore(
        useShallow((state) => ({ selectedProductNames: state.selectedProductNames }))
    );
    // 自动清理：已在主工作区中移除的车型，同步踢出本模块选择
    useEffect(() => {
        const valid = localSelection.filter((name: string) => globalSelection.includes(name));
        if (valid.length !== localSelection.length) {
            setLocalSelection(valid);
        }
    }, [globalSelection, localSelection, setLocalSelection]);

    const [drawerOpen, setDrawerOpen] = useState(false);
    /** 会话级：fuzzy/缺失来源的手选结果 ruleId → vehicleKey → sourceIndex → pick */
    const [picks, setPicks] = useState<Record<string, Record<string, Record<number, SourcePick>>>>({});
    /** 会话级：单元格手工修正 ruleId::vehicleKey → 终稿值 */
    const [overrides, setOverrides] = useState<Record<string, string>>({});

    const schemes = useMemo(() => getBidSchemesSync(), [bidMappingsVersion]);
    const activeScheme: BidMappingScheme | null = useMemo(
        () => schemes.find((s) => s.id === bidPullSchemeId) ?? schemes[0] ?? null,
        [schemes, bidPullSchemeId]
    );
    // 记住的方案被删时，回写首个方案 id，保证持久化与展示一致
    useEffect(() => {
        if (activeScheme && activeScheme.id !== bidPullSchemeId) {
            setBidPullSchemeId(activeScheme.id);
        }
    }, [activeScheme, bidPullSchemeId, setBidPullSchemeId]);

    const selectionStates = useMemo(
        () => getVehicleSelectionStates(uploadedFiles, localSelection, assetFiles, activeAssets),
        [uploadedFiles, localSelection, assetFiles, activeAssets]
    );
    const pendingSelectionCount = useMemo(
        () => Array.from(selectionStates.values()).filter((state) => state.status === 'pending').length,
        [selectionStates]
    );
    const assetSourceByProduct = useMemo(() => {
        const map = new Map<string, string>();
        localSelection.forEach((vehicleKey) => {
            const sourceFile = getAssetBackedSourceFile(assetFiles, vehicleKey);
            if (sourceFile) map.set(vehicleKey, sourceFile);
        });
        return map;
    }, [assetFiles, localSelection]);

    const vehicles = useMemo(() => {
        const list: VehicleData[] = [];
        localSelection.forEach((vehicleKey) => {
            const state = selectionStates.get(vehicleKey);
            const data = state?.data || [];
            if (state?.status === 'ready' && data.length > 0) {
                const params = new Map<string, string | number>();
                data.forEach((p) => params.set(p.name, p.value));
                const candidates = Array.from(params.entries()).map(([name, value]) => ({
                    id: name,
                    group: 'default',
                    name,
                    value,
                }));
                list.push({ name: vehicleKey, params, candidates });
            }
        });
        return list;
    }, [localSelection, selectionStates]);

    // 逐规则 × 逐车型解析（picks 影响结果，一起参与 memo）
    const evaluation = useMemo(() => {
        const rows: PullRow[] = [];
        const byRule = new Map<string, Map<string, SourceResolution[]>>();
        if (!activeScheme) return { rows, byRule };

        activeScheme.rules.forEach((rule) => {
            const cells = new Map<string, SourceResolution[]>();
            vehicles.forEach((vehicle) => {
                cells.set(vehicle.name, resolveRuleSources(rule, vehicle.candidates, picks[rule.id]?.[vehicle.name]));
            });
            rows.push({ key: rule.id, rule, cells });
            byRule.set(rule.id, cells);
        });
        return { rows, byRule };
    }, [activeScheme, vehicles, picks]);

    // 车型数据在后台同步中时给个轻量 loading 态
    const isCalculating = pendingSelectionCount > 0;

    const setSourcePick = (ruleId: string, vehicleKey: string, sourceIndex: number, pick?: SourcePick) =>
        setPicks((prev) => {
            const vehiclePicks = { ...(prev[ruleId]?.[vehicleKey] ?? {}) };
            if (pick) vehiclePicks[sourceIndex] = pick;
            else delete vehiclePicks[sourceIndex];
            return { ...prev, [ruleId]: { ...(prev[ruleId] ?? {}), [vehicleKey]: vehiclePicks } };
        });

    const setOverride = (ruleId: string, vehicleKey: string, value: string) =>
        setOverrides((prev) => {
            const next = { ...prev };
            if (value) next[`${ruleId}::${vehicleKey}`] = value;
            else delete next[`${ruleId}::${vehicleKey}`];
            return next;
        });

    // ---- 导出 --------------------------------------------------------------
    const buildExportMatrix = (): (string | number)[][] | null => {
        if (!activeScheme || vehicles.length === 0) return null;
        const headers = ['字段名', ...vehicles.map((v) => getVehicleProductName(v.name))];
        const rows = activeScheme.rules.map((rule) => [
            rule.target,
            ...vehicles.map((v) => {
                const override = overrides[`${rule.id}::${v.name}`];
                if (override !== undefined && override !== '') return override;
                const resolutions = evaluation.byRule.get(rule.id)?.get(v.name) ?? [];
                return composeRuleValue(rule, resolutions).text;
            }),
        ]);
        return [headers, ...rows];
    };

    const handleExportCsv = async () => {
        const matrix = buildExportMatrix();
        if (!matrix) return;
        const ws = XLSX.utils.aoa_to_sheet(matrix);
        await downloadCsv(XLSX.utils.sheet_to_csv(ws), `投标取数_${activeScheme!.name}.csv`);
    };

    const handleExportExcel = () => {
        const matrix = buildExportMatrix();
        if (!matrix) return;
        const ws = XLSX.utils.aoa_to_sheet(matrix);
        ws['!cols'] = [{ wch: 28 }, ...vehicles.map(() => ({ wch: 20 }))];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '投标取数');
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        XLSX.writeFile(wb, `投标取数_${activeScheme!.name}_${date}.xlsx`);
    };

    // ---- 渲染 --------------------------------------------------------------
    const cellInfo = (rule: BidFieldRule, vehicleKey: string) => {
        const override = overrides[`${rule.id}::${vehicleKey}`];
        const resolutions = evaluation.byRule.get(rule.id)?.get(vehicleKey) ?? [];
        const composed = composeRuleValue(rule, resolutions);
        return { override, resolutions, composed };
    };

    const columns = [
        {
            title: '投标字段',
            dataIndex: ['rule', 'target'],
            key: 'target',
            fixed: 'left' as const,
            width: 160,
            render: (text: string) => <b>{text}</b>,
        },
        ...vehicles.map((v) => ({
            title: getVehicleProductName(v.name),
            dataIndex: v.name,
            key: v.name,
            width: 220,
            render: (_: unknown, record: PullRow) => {
                const { override, composed } = cellInfo(record.rule, v.name);
                const editButton = (
                    <CellEditor
                        value={override ?? composed.text}
                        overridden={override !== undefined}
                        onSave={(value) => setOverride(record.rule.id, v.name, value)}
                        onReset={() => setOverride(record.rule.id, v.name, '')}
                    />
                );

                if (override !== undefined) {
                    return (
                        <span className="flex items-center gap-1">
                            <Tag color="blue" className="m-0">已修正</Tag>
                            <span className="flex-1 truncate">{override}</span>
                            {editButton}
                        </span>
                    );
                }

                if (record.rule.sources.length === 0) {
                    return <span className="text-3">未绑定来源，请先在方案管理中配置</span>;
                }

                if (composed.ready) {
                    const isCombined = record.rule.sources.length > 1;
                    return (
                        <span className="flex items-center gap-1">
                            <Tag color="success" className="m-0">
                                {isCombined ? '组合' : '自动'}
                            </Tag>
                            <span className="flex-1 truncate">{composed.text}</span>
                            {editButton}
                        </span>
                    );
                }

                return (
                    <span className="flex items-center gap-1">
                        <Tag color="warning" className="m-0">
                            缺{composed.missingCount}项
                        </Tag>
                        <span className="flex-1 truncate text-warning-text">{composed.text || '-'}</span>
                        {editButton}
                    </span>
                );
            },
        })),
    ];

    /** 展开行：逐来源 × 逐车型的命中明细，fuzzy/缺失可在此修正 */
    const renderExpanded = (row: PullRow) => {
        if (row.rule.sources.length === 0) {
            return <Empty description="该字段未绑定来源字段" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
        }
        const detailColumns = [
            { title: '来源字段', dataIndex: 'source', key: 'source', width: 180, fixed: 'left' as const,
              render: (_: unknown, record: { source: string; index: number }) => (
                  <span className="font-mono text-aux">{`{${record.index}} `}{record.source}</span>
              ) },
            ...vehicles.map((v) => ({
                title: getVehicleProductName(v.name),
                dataIndex: v.name,
                key: v.name,
                width: 240,
                render: (_: unknown, record: { source: string; index: number }) => {
                    const resolution = row.cells.get(v.name)?.[record.index];
                    if (!resolution) return <span className="text-3">—</span>;

                    if (resolution.status === 'auto' || resolution.status === 'picked') {
                        return (
                            <span className="flex items-center gap-1">
                                <Tag color={resolution.status === 'picked' ? 'blue' : 'success'}
                                     className="m-0">
                                    {resolution.status === 'picked' ? '手选' : resolution.matchType === 'alias' ? '别名' : '命中'}
                                </Tag>
                                <span className="text-aux text-3 mr-1">{resolution.resolvedName}</span>
                                <b>{String(resolution.value ?? '')}</b>
                            </span>
                        );
                    }

                    if (resolution.status === 'fuzzy') {
                        const currentPick = picks[row.rule.id]?.[v.name]?.[record.index];
                        const options: { value: string; label: string }[] = [];
                        if (currentPick) {
                            options.push({ value: currentPick.name, label: `✓ ${currentPick.name} = ${currentPick.value}` });
                        }
                        (resolution.alternatives ?? []).forEach((alt) => {
                            if (!options.some((opt) => opt.value === alt.name)) {
                                options.push({ value: alt.name, label: `${alt.name} = ${alt.value}` });
                            }
                        });
                        return (
                            <Select
                                size="small"
                                style={{ width: '100%' }}
                                placeholder={`「${record.source}」无精确命中，请选择实际字段…`}
                                allowClear
                                value={currentPick?.name}
                                options={options.length > 0 ? options : undefined}
                                notFoundContent="无相似字段"
                                onChange={(name) => {
                                    if (!name) {
                                        setSourcePick(row.rule.id, v.name, record.index, undefined);
                                        return;
                                    }
                                    const value = v.params.get(name);
                                    setSourcePick(row.rule.id, v.name, record.index, {
                                        name,
                                        value: value ?? '',
                                    });
                                }}
                            />
                        );
                    }

                    // missing：提供跳转修复入口
                    const sourceFile = assetSourceByProduct.get(v.name);
                    return sourceFile ? (
                        <RepairableValue
                            value={<span className="text-3">未找到「{record.source}」</span>}
                            repairable
                            hint="点击修复源数据"
                            onRepair={() => {
                                setRepairContext(
                                    buildRepairContext('smart_fill', v.name, sourceFile, 'empty', `${row.rule.target}·${record.source}`)
                                );
                                setPurifyProduct(v.name);
                                onGoRepair?.();
                            }}
                        />
                    ) : (
                        <span className="text-3">未找到「{record.source}」</span>
                    );
                },
            })),
        ];
        const detailRows = row.rule.sources.map((source, index) => ({
            key: `${row.key}-s-${index}`,
            source,
            index,
        }));
        return (
            <DataTable
                columns={detailColumns}
                dataSource={detailRows}
                rowKey="key"
                pagination={false}
            />
        );
    };

    const hasOverrides = Object.keys(overrides).length > 0;
    const hasResult = evaluation.rows.length > 0 && vehicles.length > 0;

    return (
        <div className="flex flex-col gap-3 h-full">
            {pendingSelectionCount > 0 && (
                <Alert
                    type="info"
                    showIcon
                    message={`正在同步 ${pendingSelectionCount} 款车型数据，完成后会自动参与取数`}
                />
            )}

            <Card className="flex-shrink-0" size="small">
                <Space direction="vertical" className="w-full">
                    <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-[220px]">
                            <div className="mb-2 font-medium flex items-center gap-2">
                                1. 字段关联方案
                                <Button size="small" icon={<SettingOutlined />} onClick={() => setDrawerOpen(true)}>
                                    管理方案
                                </Button>
                            </div>
                            <Select
                                className="w-full"
                                value={activeScheme?.id}
                                onChange={(id) => setBidPullSchemeId(id)}
                                options={schemes.map((scheme) => ({
                                    value: scheme.id,
                                    label: `${scheme.name}（${scheme.rules.length} 项）`,
                                }))}
                                placeholder="选择方案"
                            />
                        </div>
                        <div className="flex-[1.4] min-w-[220px]">
                            <div className="mb-2 font-medium">
                                2. 已选车型 <span className="text-3 text-aux font-normal tabular-nums">{localSelection.length}</span>
                            </div>
                            <ProductSourceSelector
                                value={localSelection}
                                onChange={names => setLocalSelection(Array.isArray(names) ? names : names ? [names] : [])}
                                placeholder="选择要取数的车型"
                            />
                        </div>
                    </div>
                </Space>
            </Card>

            {/* 结果区走列表外壳（列表区设计语言 §4）：导出从输入卡移到结果标题行——
                动作跟着它作用的对象走；导出是本页的产出动作，故为唯一 primary（§5.1）。 */}
            <ListToolbar
                className="flex-1 min-h-0"
                fill
                padded={false}
                title="取数结果"
                count={hasResult ? evaluation.rows.length : undefined}
                actions={
                    <>
                        {hasOverrides && (
                            <Button icon={<ClearOutlined />} onClick={() => setOverrides({})}>
                                清除修正
                            </Button>
                        )}
                        <Dropdown
                            trigger={['click']}
                            disabled={!hasResult}
                            menu={{
                                items: [
                                    { key: 'csv', icon: <DownloadOutlined />, label: 'CSV' },
                                    { key: 'xlsx', icon: <FileExcelOutlined />, label: 'Excel' },
                                ],
                                onClick: ({ key }) => (key === 'csv' ? handleExportCsv() : handleExportExcel()),
                            }}
                        >
                            <Button type="primary" icon={<ExportOutlined />} disabled={!hasResult}>
                                导出 <DownOutlined />
                            </Button>
                        </Dropdown>
                    </>
                }
            >
                <Spin spinning={isCalculating} tip="正在按关联方案取数…">
                    {hasResult ? (
                        <DataTable
                            columns={columns}
                            dataSource={evaluation.rows}
                            rowKey="key"
                            className="custom-organized-table"
                            scrollY="calc(100vh - 460px)"
                            expandable={{
                                expandedRowRender: renderExpanded,
                                rowExpandable: (record) => record.rule.sources.length > 0,
                            }}
                            locale={{
                                emptyText: <Empty description="暂无取数结果" />,
                            }}
                        />
                    ) : (
                        <GuideEmpty
                            title={
                                !activeScheme || activeScheme.rules.length === 0
                                    ? '当前方案暂无字段规则'
                                    : '选择方案与车型后自动生成取数矩阵'
                            }
                            description={
                                !activeScheme || activeScheme.rules.length === 0
                                    ? '点击「管理方案」配置投标字段与来源映射'
                                    : undefined
                            }
                        />
                    )}
                </Spin>
            </ListToolbar>

            <BidMappingDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onSaved={(focusedSchemeId) => {
                    if (focusedSchemeId) setBidPullSchemeId(focusedSchemeId);
                }}
            />
        </div>
    );
};

export default BidPullView;
