import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Card, Checkbox, Empty, Tag, Alert, Space, Input, Segmented, message, Select, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DiffOutlined, InfoCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import ProductSourceSelector from './ProductSourceSelector';
import { isFieldRequired } from '../../assets/requiredFields';
import { buildRepairContext, getAssetBackedSourceFile } from './quickRepair';
import RepairableValue from '../common/RepairableValue';
import DiffLegend from '../common/DiffLegend';
import DataTable from '../common/DataTable';
import ReportExportDropdown from '../common/ReportExportDropdown';
import { exportCompareReport } from '../../utils/compareReport';
import type { ReportFormat } from '../../utils/reportExport';
import { getFieldGroupsSync } from '../../utils/fieldLists';
import { buildVehicleDisplayLabels, getVehicleProductName } from '../../utils/vehicleInstance';
import { getVehicleSelectionStates } from '../../utils/vehicleSelectionState';

interface CompareViewProps {
    onGoRepair?: () => void;
}

/** 对比表一行：固定列 + 每个选中车型一列（列名是实例键，值是参数文本） */
type CompareRow = {
    key: string;
    group: string;
    name: string;
    hasDiff: boolean;
    hasAnyValue: boolean;
} & Record<string, string | boolean>;

const CompareView: React.FC<CompareViewProps> = ({ onGoRepair }) => {
    const { uploadedFiles, assetFiles, activeAssets, selectedProductNames, localSelection, setLocalSelection, setPurifyProduct, setRepairContext, fieldGroupsVersion } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        assetFiles: state.assetFiles,
        activeAssets: state.activeAssets,
        selectedProductNames: state.selectedProductNames,
        localSelection: state.currentCompareProducts,
        setLocalSelection: state.setCompareProducts,
        setPurifyProduct: state.setPurifyProduct,
        setRepairContext: state.setRepairContext,
        fieldGroupsVersion: state.fieldGroupsVersion,
    })));
    // 过滤状态
    const [diffFilter, setDiffFilter] = useState<'all' | 'diff' | 'same' | 'required'>('all');
    const [searchText, setSearchText] = useState('');
    const [fieldGroupFilter, setFieldGroupFilter] = useState<string>('all');
    const [hideEmpty, setHideEmpty] = useState(true);

    // 自动清理：已在待分析区中被移除的车型，同步踢出对比选择
    useEffect(() => {
        const valid = localSelection.filter(name => selectedProductNames.includes(name));
        if (valid.length !== localSelection.length) {
            setLocalSelection(valid);
        }
    }, [selectedProductNames, localSelection, setLocalSelection]);

    // 首次填充：本模块尚未选择车型时，自动从大纲中填充（仅一次，清空后不复填）
    const didInitialFill = useRef(false);
    useEffect(() => {
        if (!didInitialFill.current && localSelection.length === 0 && selectedProductNames.length > 0) {
            didInitialFill.current = true;
            setLocalSelection(selectedProductNames.length <= 5 ? [...selectedProductNames] : [selectedProductNames[0]]);
        }
    }, [selectedProductNames, localSelection, setLocalSelection]);

    const selectionStates = useMemo(
        () => getVehicleSelectionStates(uploadedFiles, localSelection, assetFiles, activeAssets),
        [uploadedFiles, localSelection, assetFiles, activeAssets]
    );

    // Build comparison matrix (supports 1+ products)
    // 合并 key 为「分组+参数名」：同名参数在不同总成下（如各传感器的"型号"）
    // 不能互相覆盖，否则每车只留最后一行的值，跨车对比会拿错总成的值来比
    const comparisonData = useMemo<CompareRow[]>(() => {
        if (localSelection.length < 1) return [];

        const allParams = new Map<string, { group: string; name: string; values: Map<string, string> }>();

        localSelection.forEach(instanceKey => {
            const data = selectionStates.get(instanceKey)?.data || [];
            data.forEach(p => {
                const group = p.group || '未分组';
                const key = `${group}::${p.name}`;
                if (!allParams.has(key)) {
                    allParams.set(key, { group, name: p.name, values: new Map() });
                }
                const entry = allParams.get(key)!;
                // 同分组同名的重复行：空值不覆盖已填值，避免对比表里被"-"吞掉
                const value = String(p.value ?? '');
                if (value !== '' || !entry.values.has(instanceKey) || entry.values.get(instanceKey) === '') {
                    entry.values.set(instanceKey, value);
                }
            });
        });

        return Array.from(allParams.entries()).map(([key, param]) => {
            const values = Array.from(param.values.values());
            const allSame = values.every(v => v === values[0]);

            return {
                key,
                group: param.group,
                name: param.name,
                hasDiff: localSelection.length > 1 ? !allSame : false,
                // 任一选中车型有值即算有值；某车型缺该行时按空值计
                hasAnyValue: values.some(v => v.trim() !== ''),
                ...Object.fromEntries(param.values)
            };
        });
    }, [localSelection, selectionStates]);

    const pendingSelectionCount = useMemo(() => {
        return Array.from(selectionStates.values()).filter((state) => state.status === 'pending').length;
    }, [selectionStates]);

    // 过滤后的数据
    const filteredData = useMemo(() => {
        let data = comparisonData;
        const fieldGroup = getFieldGroupsSync().find((group) => group.id === fieldGroupFilter);

        if (fieldGroup) {
            const fieldSet = new Set(fieldGroup.fields);
            data = data.filter((row) => fieldSet.has(row.name));
        }
        
        // 默认隐藏全空行；必填行豁免——待填报项不能被藏掉
        if (hideEmpty) {
            data = data.filter(r => r.hasAnyValue || isFieldRequired(r.name));
        }

        // 差异/一致/必填过滤
        if (diffFilter === 'diff') {
            data = data.filter(r => r.hasDiff);
        } else if (diffFilter === 'same') {
            data = data.filter(r => !r.hasDiff);
        } else if (diffFilter === 'required') {
            data = data.filter(r => isFieldRequired(r.name));
        }

        // 搜索过滤
        if (searchText.trim()) {
            const kw = searchText.trim().toLowerCase();
            data = data.filter(r =>
                r.name.toLowerCase().includes(kw) ||
                r.group.toLowerCase().includes(kw) ||
                localSelection.some(p => String((r as Record<string, unknown>)[p] || '').toLowerCase().includes(kw))
            );
        }

        return data;
    }, [comparisonData, diffFilter, hideEmpty, searchText, localSelection, fieldGroupFilter, fieldGroupsVersion]);

    const fieldGroupOptions = useMemo(
        () => [{ value: 'all', label: '全部字段' }, ...getFieldGroupsSync().map((group) => ({ value: group.id, label: group.name }))],
        [fieldGroupsVersion]
    );

    const assetSourceByProduct = useMemo(() => {
        const map = new Map<string, string>();
        localSelection.forEach(instanceKey => {
            const sourceFile = getAssetBackedSourceFile(assetFiles, instanceKey);
            if (sourceFile) map.set(instanceKey, sourceFile);
        });
        return map;
    }, [assetFiles, localSelection]);
    const selectionDisplayLabels = useMemo(
        () => buildVehicleDisplayLabels(localSelection),
        [localSelection]
    );

    const triggerRepair = (instanceKey: string, fieldName: string) => {
        const sourceFileName = assetSourceByProduct.get(instanceKey);
        if (!sourceFileName) return;

        setRepairContext(buildRepairContext('compare', instanceKey, sourceFileName, 'diff', fieldName));
        setPurifyProduct(instanceKey);
        onGoRepair?.();
    };

    // Dynamic columns
    const columns = useMemo(() => {
        const dynamicCols: ColumnsType<CompareRow> = [
            {
                title: '分组',
                dataIndex: 'group',
                key: 'group',
                width: 100,
                fixed: 'left',
                render: (text: string) => <Tag color="default">{text}</Tag>,
            },
            {
                title: '参数名',
                dataIndex: 'name',
                key: 'name',
                width: 160,
                fixed: 'left',
            },
            {
                title: '必填',
                key: 'required',
                width: 60,
                fixed: 'left',
                render: (_: unknown, record: { name: string }) =>
                    isFieldRequired(record.name) ? <Tag color="warning">是</Tag> : <span className="text-3">-</span>,
            }
        ];

        localSelection.forEach(instanceKey => {
            dynamicCols.push({
                title: selectionDisplayLabels.get(instanceKey)?.shortLabel || getVehicleProductName(instanceKey),
                dataIndex: instanceKey,
                key: instanceKey,
                width: 180,
                fixed: undefined,
                render: (text: string, record: { hasDiff: boolean }) => {
                    const isRepairable = assetSourceByProduct.has(instanceKey);
                    if (!text) return <span className="text-3">-</span>;
                    if (record.hasDiff) {
                        return (
                            <RepairableValue
                                value={<span className="bg-warning-weak px-1 rounded">{text}</span>}
                                repairable={isRepairable}
                                hint="点击修复源数据"
                                onRepair={() => triggerRepair(instanceKey, (record as unknown as { name: string }).name)}
                            />
                        );
                    }
                    return text;
                }
            });
        });

        return dynamicCols;
    }, [localSelection, selectionDisplayLabels]);

    const { diffCount, sameCount, requiredCount } = useMemo(() => {
        let diff = 0, same = 0, req = 0;
        comparisonData.forEach(r => {
            if (r.hasDiff) diff++; else same++;
            if (isFieldRequired(r.name)) req++;
        });
        return { diffCount: diff, sameCount: same, requiredCount: req };
    }, [comparisonData]);

    // 勾选「隐藏无值字段」后实际被藏掉的行数：全空且非必填
    const emptyHideableCount = useMemo(
        () => comparisonData.filter(r => !r.hasAnyValue && !isFieldRequired(r.name)).length,
        [comparisonData]
    );

    // 表体高度实测：卡片自身永不滚动（overflow-hidden），表体是唯一纵向滚动容器，
    // 表头/冻结列因此始终可见。可用高度必须从视口反推（视口底 − 表顶 − Footer/边距），
    // 不能用「包裹层高度 − 表体高度」——表体高度决定卡片高度、卡片高度又决定包裹层高度，
    // 环形测量会形成负反馈一路缩到下限。
    const tableWrapRef = useRef<HTMLDivElement>(null);
    const [tableBodyHeight, setTableBodyHeight] = useState(360);
    const hasCompareRows = comparisonData.length > 0;

    useEffect(() => {
        const el = tableWrapRef.current;
        if (!el || !hasCompareRows) return;
        const update = () => {
            const footer = document.querySelector<HTMLElement>('.ant-layout-footer');
            const below = (footer?.offsetHeight ?? 0) + 18; // Content 下内边距 + 卡片边框余量
            const available = Math.floor(window.innerHeight - el.getBoundingClientRect().top - below);
            const head = el.querySelector<HTMLElement>('.ant-table-header, .ant-table-thead');
            const pag = el.querySelector<HTMLElement>('.ant-pagination');
            const reserved = (head?.offsetHeight ?? 0) + (pag ? pag.offsetHeight + 40 : 0);
            setTableBodyHeight(Math.max(160, available - reserved));
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        window.addEventListener('resize', update);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [hasCompareRows]);

    // 4. UX 提升: 版本对比自动切换“只看差异”
    useEffect(() => {
        if (localSelection.length > 1 && diffCount > 0) {
            setDiffFilter('diff');
        } else {
            setDiffFilter('all');
        }
    }, [localSelection.join(','), diffCount]);

    // 报告导出：自包含 HTML / Markdown
    const handleExportReport = async (format: ReportFormat) => {
        if (comparisonData.length === 0) { message.warning('暂无对比数据'); return; }

        const hide = message.loading('正在生成报告...', 0);
        try {
            const fileName = await exportCompareReport(format, {
                rows: comparisonData,
                columns: localSelection.map((n) => ({
                    key: n,
                    label: selectionDisplayLabels.get(n)?.shortLabel || getVehicleProductName(n),
                })),
            });
            hide();
            message.success(`报告已导出：${fileName}`);
        } catch (e) {
            hide();
            console.error('Report export failed:', e);
            message.error('报告导出失败：' + (e as Error).message);
        }
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            {selectedProductNames.length === 0 && (
                <Alert
                    message="请先在资产管理中选择车型"
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                />
            )}
            
            {/* Selection Area - Unified UI */}
            <Card className="surface-container border-default" size="small">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <DiffOutlined className="text-brand text-lg" />
                            <h2 className="text-[15px] font-bold text-1 m-0">选择对比车型</h2>
                            <Tag color="processing" className="ml-2 m-0 rounded-sm">已选 {localSelection.length} 款</Tag>
                        </div>
                        <ReportExportDropdown
                            onExport={handleExportReport}
                            disabled={localSelection.length === 0}
                        />
                    </div>

                    <ProductSourceSelector 
                        value={localSelection}
                        onChange={names => setLocalSelection(Array.isArray(names) ? names : names ? [names] : [])}
                        placeholder="从已选车型中选择进行对比..."
                    />
                </div>
            </Card>

            {/* Results Area
               maxHeight + isolation：结果表在自己的卡片内滚动，不让整页滚动。
               WebKit（Tauri 的 WKWebView）下，页面级滚动 + 表格冻结列(sticky) 会留下
               合成层残影，把左三列画到顶部标题栏之上，看起来像一个浮窗。
               锁定卡片高度后页面不再滚动；isolation 兜底：即便残影出现，
               表格层也永远被限制在卡片堆叠上下文内，盖不到 sticky 顶栏（z-50）。 */}
            <div
                className="flex-1 flex flex-col overflow-hidden surface-container rounded-lg border border-default"
                style={{ isolation: 'isolate' }}
            >
                {comparisonData.length > 0 ? (
                    <div className="p-3 flex flex-col min-h-0 flex-1">
                        {/* 统计 + 工具栏 */}
                        <div className="mb-3 flex items-center justify-between flex-wrap gap-2 shrink-0">
                            <div className="flex items-center gap-3">
                                <span className="text-2 text-sm">共 {comparisonData.length} 项</span>
                                <Segmented
                                    value={diffFilter}
                                    onChange={v => setDiffFilter(v as typeof diffFilter)}
                                    options={[
                                        { label: `全部 (${comparisonData.length})`, value: 'all' },
                                        { label: `差异 (${diffCount})`, value: 'diff' },
                                        { label: `一致 (${sameCount})`, value: 'same' },
                                        { label: `必填 (${requiredCount})`, value: 'required' },
                                    ]}
                                    size="small"
                                />
                                <DiffLegend />
                                <Input
                                    placeholder="搜索参数名或值..."
                                    prefix={<SearchOutlined className="text-3" />}
                                    value={searchText}
                                    onChange={e => setSearchText(e.target.value)}
                                    allowClear
                                    style={{ width: 220 }}
                                    size="small"
                                />
                                <Select
                                    value={fieldGroupFilter}
                                    onChange={setFieldGroupFilter}
                                    options={fieldGroupOptions}
                                    style={{ width: 180 }}
                                    size="small"
                                />
                                <Checkbox
                                    checked={hideEmpty}
                                    onChange={e => setHideEmpty(e.target.checked)}
                                >
                                    隐藏无值字段{emptyHideableCount > 0 ? ` (${emptyHideableCount})` : ''}
                                </Checkbox>
                            </div>
                            <Space>
                                {pendingSelectionCount > 0 && (
                                    <Tag color="processing">同步中: {pendingSelectionCount} 款</Tag>
                                )}
                                <Tag>显示: {filteredData.length} 条</Tag>
                                <ReportExportDropdown onExport={handleExportReport} />
                            </Space>
                        </div>
                        <div ref={tableWrapRef} className="flex-1 min-h-0">
                            <DataTable
                                dataSource={filteredData}
                                columns={columns}
                                rowKey="key"
                                rowClassName={(record: CompareRow) => record.hasDiff ? 'diff-row' : ''}
                                scrollY={tableBodyHeight}
                            />
                        </div>
                    </div>
                ) : pendingSelectionCount > 0 ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[220px] gap-3 text-center">
                        <Spin size="large" />
                        <div className="text-sm text-2">正在同步 {pendingSelectionCount} 款车型数据...</div>
                        <div className="text-xs text-3">资产数据加载完成后会自动显示对比结果</div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full min-h-[220px]">
                    <Empty description={localSelection.length < 1 ? "请选择至少1个车型" : "暂无可对比数据"} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default CompareView;
