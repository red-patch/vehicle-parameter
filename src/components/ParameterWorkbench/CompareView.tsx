import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button, Checkbox, Empty, Segmented, message, Select, Spin, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import SelectVehiclesHint from '../common/SelectVehiclesHint';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import ProductSourceSelector from './ProductSourceSelector';
import { isFieldRequired } from '../../assets/requiredFields';
import { buildRepairContext, getAssetBackedSourceFile } from './quickRepair';
import RepairableValue from '../common/RepairableValue';
import DiffLegend from '../common/DiffLegend';
import DataTable from '../common/DataTable';
import ReportExportDropdown from '../common/ReportExportDropdown';
import ListToolbar from '../common/ListToolbar';
import SearchInput from '../common/SearchInput';
import { FilterItem } from '../common/ListToolbar';
import StatusDot from '../common/StatusDot';
import CountLabel from '../common/CountLabel';
import ColumnTitle from '../common/ColumnTitle';
import { exportCompareReport } from '../../utils/compareReport';
import type { ReportFormat } from '../../utils/reportExport';
import { getFieldGroupsSync } from '../../utils/fieldLists';
import { buildVehicleDisplayLabels, getVehicleProductName } from '../../utils/vehicleInstance';
import { useAssetAliasResolver } from '../../hooks/useAssetAliasResolver';
import { getVehicleSelectionStates } from '../../utils/vehicleSelectionState';
import { buildCompareRows } from '../../utils/compareMatrix';
import type { CompareRow } from '../../utils/compareMatrix';

interface CompareViewProps {
    onGoRepair?: () => void;
    /** 跳到「车型资产」选车（前置提示里的直达按钮） */
    onGoPool?: () => void;
}

const CompareView: React.FC<CompareViewProps> = ({ onGoRepair, onGoPool }) => {
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
    // 资产别名解析（只影响显示文案：表头/导出；不参与实例键与身份）
    const { resolver: aliasResolver } = useAssetAliasResolver();
    const [searchText, setSearchText] = useState('');
    const [fieldGroupFilter, setFieldGroupFilter] = useState<string>('all');
    const [hideEmpty, setHideEmpty] = useState(true);
    // 按字段名合并（忽略分组）：解决同字段因导入归属总成不同被拆成两行、显出假差异
    const [mergeByFieldName, setMergeByFieldName] = useState(false);

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
    // 默认合并 key 为「分组+参数名」：同名参数在不同总成下（如各传感器的"型号"）
    // 不能互相覆盖，否则每车只留最后一行的值，跨车对比会拿错总成的值来比。
    // 开启「按字段名合并」后改为只按 name 配对（冲突字段自动退回分组键，见 compareMatrix）。
    const comparisonData = useMemo<CompareRow[]>(() => {
        if (localSelection.length < 1) return [];

        return buildCompareRows(
            localSelection.map(instanceKey => ({
                instanceKey,
                params: selectionStates.get(instanceKey)?.data || [],
            })),
            { mergeByFieldName }
        );
    }, [localSelection, selectionStates, mergeByFieldName]);

    const pendingSelectionCount = useMemo(() => {
        return Array.from(selectionStates.values()).filter((state) => state.status === 'pending').length;
    }, [selectionStates]);

    /** 「清除筛选」只看筛选行（差异视图/字段组/搜索）；③ 段两个显示开关不算 */
    const filtersActive = diffFilter !== 'all' || fieldGroupFilter !== 'all' || searchText.trim() !== '';

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
        () => buildVehicleDisplayLabels(localSelection, aliasResolver),
        [localSelection, aliasResolver]
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
                // 分组是归属信息，不是状态：次级文字而非彩色 Tag（与数据体检同列同形）
                render: (text: string, record: CompareRow) =>
                    record.groups && record.groups.length > 1 ? (
                        <Tooltip title={`合并自：${record.groups.join('、')}`}>
                            <span className="cell-plain text-2 underline decoration-dotted underline-offset-2">{text}</span>
                        </Tooltip>
                    ) : (
                        <span className="cell-plain text-2">{text}</span>
                    ),
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
                    isFieldRequired(record.name) ? <StatusDot tone="warning">是</StatusDot> : <span className="text-3">—</span>,
            }
        ];

        localSelection.forEach(instanceKey => {
            dynamicCols.push({
                title: (
                    <ColumnTitle>
                        {selectionDisplayLabels.get(instanceKey)?.shortLabel || getVehicleProductName(instanceKey)}
                    </ColumnTitle>
                ),
                dataIndex: instanceKey,
                key: instanceKey,
                width: 200,
                ellipsis: true,
                fixed: undefined,
                render: (text: string, record: { hasDiff: boolean }) => {
                    const isRepairable = assetSourceByProduct.has(instanceKey);
                    if (!text) return <span className="text-3">—</span>;
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
                <SelectVehiclesHint onGoPool={onGoPool} />
            )}
            
            {/* Selection Area - Unified UI */}
            {/* 选择区与结果区同一种面板外壳（列表区设计语言 §4）：标题 14/600 无图标、
                计数是标题后的三级文字——此前这里是 15px 粗体 + 图标 + 蓝色「已选 N 款」Tag。
                导出入口唯一保留在结果工具条（§5.1 同动作一屏一次）。 */}
            <ListToolbar title="对比车型" count={localSelection.length}>
                <ProductSourceSelector
                    value={localSelection}
                    onChange={names => setLocalSelection(Array.isArray(names) ? names : names ? [names] : [])}
                    placeholder="从已选车型中选择进行对比…"
                />
            </ListToolbar>

            {/* Results Area
               maxHeight + isolation：结果表在自己的卡片内滚动，不让整页滚动。
               WebKit（Tauri 的 WKWebView）下，页面级滚动 + 表格冻结列(sticky) 会留下
               合成层残影，把左三列画到顶部标题栏之上，看起来像一个浮窗。
               锁定卡片高度后页面不再滚动；isolation 兜底：即便残影出现，
               表格层也永远被限制在卡片堆叠上下文内，盖不到 sticky 顶栏（z-50）。 */}
            <ListToolbar
                className="flex-1 min-h-0"
                fill
                padded={false}
                /* isolation：WebKit（Tauri 的 WKWebView）下页面级滚动 + 表格冻结列(sticky)
                   会留下合成层残影，把左三列画到顶部标题栏之上。隔离层兜底：
                   即便残影出现，表格层也永远被限制在卡片堆叠上下文内，盖不到 z-50 顶栏。 */
                style={{ isolation: 'isolate' }}
                title="对比结果"
                count={{ shown: filteredData.length, total: comparisonData.length }}
                actions={
                    <>
                        {pendingSelectionCount > 0 && (
                            <StatusDot tone="info">同步中 {pendingSelectionCount} 款</StatusDot>
                        )}
                        {/* §5.1：同一动作一屏内只出现一次——此前这里与上方选择卡各有一个
                            「导出报告」，已删掉上方那个，只保留本处（唯一入口） */}
                        <ReportExportDropdown onExport={handleExportReport} disabled={comparisonData.length === 0} />
                    </>
                }
                filters={
                    <>
                        <Segmented
                            value={diffFilter}
                            onChange={v => setDiffFilter(v as typeof diffFilter)}
                            options={[
                                { label: <CountLabel label="全部" count={comparisonData.length} />, value: 'all' },
                                { label: <CountLabel label="差异" count={diffCount} />, value: 'diff' },
                                { label: <CountLabel label="一致" count={sameCount} />, value: 'same' },
                                { label: <CountLabel label="必填" count={requiredCount} />, value: 'required' },
                            ]}
                        />
                        <DiffLegend />
                        <FilterItem label="字段组">
                            <Select
                                value={fieldGroupFilter}
                                onChange={setFieldGroupFilter}
                                options={fieldGroupOptions}
                                style={{ width: 180 }}
                            />
                        </FilterItem>
                        {filtersActive && (
                            <Button
                                type="link"
                                size="small"
                                className="px-0"
                                onClick={() => { setDiffFilter('all'); setFieldGroupFilter('all'); setSearchText(''); }}
                            >
                                清除筛选
                            </Button>
                        )}
                        <span className="ml-auto" />
                        <SearchInput
                            width="sm"
                            placeholder="搜索参数名或值"
                            value={searchText}
                            onChange={setSearchText}
                        />
                    </>
                }
                display={
                    /* ③ 显示选项：只改呈现不改数据集合，故与筛选分开成段（§4.1）。
                       此前这两个 Checkbox 混在筛选行里，是「版本对比看起来最乱」的根因。 */
                    <>
                        <Checkbox
                            checked={hideEmpty}
                            onChange={e => setHideEmpty(e.target.checked)}
                        >
                            <CountLabel label="隐藏无值字段" count={emptyHideableCount > 0 ? emptyHideableCount : undefined} />
                        </Checkbox>
                        <Tooltip title="忽略分组，只按参数名配对；同名字段在任一车型内取值冲突时不合并">
                            <Checkbox
                                checked={mergeByFieldName}
                                onChange={e => setMergeByFieldName(e.target.checked)}
                            >
                                按字段名合并
                            </Checkbox>
                        </Tooltip>
                    </>
                }
            >
                {comparisonData.length > 0 ? (
                    <div ref={tableWrapRef} className="flex-1 min-h-0">
                        <DataTable
                            dataSource={filteredData}
                            columns={columns}
                            rowKey="key"
                            rowClassName={(record: CompareRow) => record.hasDiff ? 'diff-row' : ''}
                            scrollY={tableBodyHeight}
                        />
                    </div>
                ) : pendingSelectionCount > 0 ? (
                    <div className="flex flex-col items-center justify-center h-full min-h-[220px] gap-3 text-center">
                        <Spin />
                        <div className="text-body text-2">正在同步 {pendingSelectionCount} 款车型数据…</div>
                        <div className="text-aux text-3">资产数据加载完成后会自动显示对比结果</div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full min-h-[220px]">
                        <Empty description={localSelection.length < 1 ? "请选择至少1个车型" : "暂无可对比数据"} />
                    </div>
                )}
            </ListToolbar>
        </div>
    );
};

export default CompareView;
