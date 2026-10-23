import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Tag, Select, Progress, Button, message, Input, Tooltip, Dropdown, Popconfirm } from 'antd';
import { FilterItem } from '../common/ListToolbar';
import ListToolbar from '../common/ListToolbar';
import SearchInput from '../common/SearchInput';
import FacetChips from '../common/FacetChips';
import DataTable from '../common/DataTable';
import { useVehicleStore } from '../../store/vehicleStore';
import { getProductData } from '../../store/vehicleSelectors';
import { useShallow } from 'zustand/react/shallow';
import type { MatchItem, VehicleParameter } from '../../types';
import { DownloadOutlined, EditOutlined, DatabaseOutlined, CloudUploadOutlined, WarningOutlined, CopyOutlined, DownOutlined, SyncOutlined, BugOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { preloadEnumData, getEnumValuesSync, isEnumDataLoaded } from '../../utils/attributeEnums';
import { buildRepairContext, getAssetBackedSourceFile } from '../ParameterWorkbench/quickRepair';
import RepairableValue from '../common/RepairableValue';
import { getVehicleProductName, buildVehicleDisplayLabels, buildVehicleOptionLabel } from '../../utils/vehicleInstance';
import { useAssetAliasResolver } from '../../hooks/useAssetAliasResolver';
import type { ExportFormat, FieldGroupConfigItem, FieldSourceRule } from '../../utils/fieldLists';
import { useFieldGroupExport } from './useFieldGroupExport';
import { withSource, computeSyncDiff, setRequiredFor } from '../../utils/fieldMapping';
import UploadFeedbackModal from './UploadFeedbackModal';
import { getFieldGroupsSync, saveFieldGroups, getExportFormatsSync } from '../../utils/fieldLists';

interface MatchResultTableProps {
    productName?: string | null;
    onGoRepair?: () => void;
    /** 选中的字段组：有值时表格 = 该组全量字段，来源按组里的规则解析 */
    fieldGroup?: FieldGroupConfigItem | null;
    /** 选中的导出格式（决定 sheet 名与文件名）；不选则用默认 */
    exportFormat?: ExportFormat | null;
    /** 其他已选车型（视同的数据来源） */
    candidateProducts?: string[];
    /** 读取某车型在字段组模式下的人工修正值 */
    readProductManualValues?: (product: string) => Record<string, string>;
    /** 读某车型的资产参数（用于「该车这个字段有没有值」的判断） */
    readProductLibrary?: (product: string) => { id: string; group: string; name: string; value: string | number }[];
}

const MatchResultTable: React.FC<MatchResultTableProps> = ({
    productName, onGoRepair, fieldGroup, exportFormat,
    candidateProducts = [], readProductManualValues, readProductLibrary,
}) => {
    const { matchResults, setMatchResults, updateManualValue, uploadedFiles, assetFiles, setPurifyProduct, setRepairContext, assetLibraryPath, bumpFieldGroupsVersion, manualByProduct, setProductManualValue } = useVehicleStore(useShallow(state => ({
        matchResults: state.matchResults,
        setMatchResults: state.setMatchResults,
        updateManualValue: state.updateManualValue,
        uploadedFiles: state.uploadedFiles,
        assetFiles: state.assetFiles,
        setPurifyProduct: state.setPurifyProduct,
        setRepairContext: state.setRepairContext,
        assetLibraryPath: state.assetLibraryPath,
        bumpFieldGroupsVersion: state.bumpFieldGroupsVersion,
        manualByProduct: state.smartFillManualByProduct,
        setProductManualValue: state.setProductManualValue,
    })));
    
    // V3.0: 过滤状态
    const [searchText, setSearchText] = useState('');
    const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'perfect' | 'imperfect'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'filled' | 'empty'>('all'); // 新增状态过滤
    // 记录哪些行处于手动输入模式
    const [manualInputMode, setManualInputMode] = useState<Record<string, boolean>>({});
    // V3.1: 枚举数据加载状态
    const [enumLoaded, setEnumLoaded] = useState(isEnumDataLoaded());
    const [quickFilter, setQuickFilter] = useState<'none' | 'enum_mismatch'>('none');
    /** 上传回执修正弹窗 */
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    /** 视同参考车型（把它的已矫正值复制到当前车型） */
    const [syncReference, setSyncReference] = useState<string | null>(null);
    /** 字段组模式下的视同差异筛选（只看需要视同的字段） */
    const [syncFilter, setSyncFilter] = useState(false);
    /** 字段组模式下的必填筛选 */
    const [requiredFilter, setRequiredFilter] = useState<'all' | 'required' | 'optional' | 'required_missing'>('all');

    // 预加载枚举数据
    useEffect(() => {
        if (!enumLoaded) {
            preloadEnumData().then(() => {
                setEnumLoaded(true);
            });
        }
    }, [enumLoaded]);

    // 计算当前车型的字典(用于 Quick Fix)
    const library = useMemo(() => {
        return productName ? getProductData(uploadedFiles, productName, assetFiles) : [];
    }, [uploadedFiles, productName, assetFiles]);

    const assetSourceFile = useMemo(
        () => productName ? getAssetBackedSourceFile(assetFiles, productName) : null,
        [assetFiles, productName]
    );

    // ── 字段组模式（设计：docs/plans/2026-10-19-车上云模板导出-design.md）──
    // 选了字段组：表格 = 组内全量字段，来源来自组里的 sources；不选：原有需求匹配不变。
    const { resolver: aliasResolver } = useAssetAliasResolver();
    const groupMode = !!fieldGroup;
    /**
     * 人工修正值：从 store 的 matchResults 派生（id 在字段组模式下就是输出字段名）。
     * 必须喂给解析器，否则表格里改了值、导出仍是资产原值。
     */
    const manualValues = useMemo<Record<string, string>>(
        () => (productName ? (manualByProduct[productName] ?? {}) : {}),
        [manualByProduct, productName],
    );

    const groupExport = useFieldGroupExport({
        group: fieldGroup ?? null,
        format: exportFormat ?? null,
        library,
        productName,
        manualValues,
    });
    /** 模板模式下表格数据来自字段组；行数 = 组内字段数 */
    const tableResults = groupMode ? groupExport.matchItems : matchResults;

    /**
     * 字段组模式下，store 里的 matchResults 必须换成「字段组行」：
     * 表格里的值编辑走 updateManualValue(id)，而它按 id 在 matchResults 里找行。
     * 不同步的话点值输入框会静默无效（id 是 req-0，表格行 id 是字段名）。
     */
    useEffect(() => {
        if (!groupMode) return;
        // 防回环：matchItems 每次渲染都是新数组，只有「行集合真的变了」才写回 store
        const same = matchResults.length === groupExport.matchItems.length
            && matchResults.every((m, i) => {
                const next = groupExport.matchItems[i];
                return next
                    && m.id === next.id
                    && m.requirementName === next.requirementName
                    && m.manualValue === next.manualValue
                    && m.matchedParam?.name === next.matchedParam?.name;
            });
        if (same) return;
        setMatchResults(groupExport.matchItems);
    }, [groupMode, groupExport.matchItems, matchResults, setMatchResults]);

    /**
     * 写填报值：既更新当前表格行，也按车型持久到 smartFillManualByProduct。
     * 后者是「切车型不丢修正」与「视同」的数据基础。
     */
    const commitValue = useCallback((record: MatchItem, value: string, explicitEmpty: boolean) => {
        updateManualValue(record.id, value, explicitEmpty ? { explicitEmpty: true } : undefined);
        if (groupMode && productName) {
            // 空字符串 = 用户明确清空，也要记住；undefined 才代表「没动过」
            setProductManualValue(productName, record.requirementName, value);
        }
    }, [updateManualValue, groupMode, productName, setProductManualValue]);

    // ── 视同（复用数据体检「参考车型视同更新」的语义）──
    // 差异判定：参考车型在该字段上的「最终值」（人工修正优先）非空，且与当前不同。
    const displayLabels = useMemo(
        () => buildVehicleDisplayLabels(candidateProducts, aliasResolver),
        [candidateProducts, aliasResolver],
    );

    const syncDiff = useMemo(() => {
        if (!groupMode || !syncReference || syncReference === productName) return null;
        if (!readProductManualValues || !readProductLibrary) return null;
        const items = computeSyncDiff(groupExport.fields, {
            manualValues: readProductManualValues(syncReference),
            library: readProductLibrary(syncReference) as VehicleParameter[],
        });
        return { items };
    }, [groupMode, syncReference, productName, readProductManualValues, readProductLibrary, groupExport.fields]);

    /** 行内视同：把该字段的参考值写成当前车型的修正值 */
    const applySync = useCallback((fields: string[]) => {
        if (!productName || !syncDiff) return;
        const target = new Set(fields);
        for (const item of syncDiff.items) {
            if (target.has(item.field)) setProductManualValue(productName, item.field, item.referenceValue);
        }
        message.success(`已视同 ${fields.length} 个字段`);
    }, [productName, syncDiff, setProductManualValue]);

    /**
     * 资产 key → 展示名。
     * 候选车型是 `asset::文件名::车型` 这样的 key，直接显示会露出内部格式，
     * 与数据体检页用同一套 shortLabel / fullLabel。
     */
    const labelOf = useCallback((instanceKey: string) => {
        const label = displayLabels.get(instanceKey);
        return {
            short: label?.shortLabel || getVehicleProductName(instanceKey),
            full: label?.fullLabel || buildVehicleOptionLabel(instanceKey),
        };
    }, [displayLabels]);

    /** 必填集合：列里打星号、筛选也用它 */
    const requiredSet = useMemo(
        () => new Set(fieldGroup?.required ?? []),
        [fieldGroup],
    );

    /** 来源下拉的候选 = 当前参考车型的资产字段 */
    const sourceFieldOptions = useMemo(
        () => Array.from(new Set(library.map(p => p.name))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
        [library],
    );
    /**
     * 选完来源写回字段组（sources 里只存一个候选；组合来源要去「字段与词表」配）。
     * 写回后立刻保存，避免用户在填报页改了却不生效。
     */
    /** 回执里把字段设为必填：写回字段组并立即落盘，之后处理其他车型时提前可见 */
    const handleMarkRequired = useCallback(async (field: string) => {
        if (!fieldGroup || !assetLibraryPath) return;
        const nextGroup = setRequiredFor(fieldGroup, [field], true);
        const groups = getFieldGroupsSync().map(g => (g.id === nextGroup.id ? nextGroup : g));
        try {
            await saveFieldGroups(assetLibraryPath, groups, getExportFormatsSync());
            bumpFieldGroupsVersion();
        } catch (err) {
            console.error(err);
            message.error('保存必填标记失败');
        }
    }, [fieldGroup, assetLibraryPath, bumpFieldGroupsVersion]);

    const handlePickSource = useCallback(async (field: string, source: string | undefined) => {
        if (!fieldGroup || !assetLibraryPath) return;
        const rule: FieldSourceRule | null = source ? { candidates: [source] } : null;
        const nextGroup = withSource(fieldGroup, field, rule);
        const groups = getFieldGroupsSync().map(g => (g.id === nextGroup.id ? nextGroup : g));
        try {
            await saveFieldGroups(assetLibraryPath, groups, getExportFormatsSync());
            bumpFieldGroupsVersion();
            message.success(`已把「${field}」的来源固定为「${source}」`);
        } catch (err) {
            console.error(err);
            message.error('保存来源失败');
        }
    }, [fieldGroup, assetLibraryPath, bumpFieldGroupsVersion]);

    const triggerRepair = useCallback((fieldName: string, reason: 'unmatched' | 'enum_mismatch') => {
        if (!productName || !assetSourceFile) return;
        setRepairContext(buildRepairContext('smart_fill', productName, assetSourceFile, reason, fieldName));
        setPurifyProduct(productName);
        onGoRepair?.();
    }, [productName, assetSourceFile, setRepairContext, setPurifyProduct, onGoRepair]);

    // 计算快捷修正推荐
    // V3.0: 过滤后的数据
    const filteredResults = useMemo(() => {
        let results = tableResults;
        
        // 字段搜索
        if (searchText.trim()) {
            const keywords = searchText
                .split('\n')
                .map(k => k.trim().toLowerCase())
                .filter(k => k.length > 0);
            
            if (keywords.length > 0) {
                results = results.filter(m => 
                    keywords.some(keyword => 
                        m.requirementName.toLowerCase().includes(keyword) ||
                        m.matchedParam?.name?.toLowerCase().includes(keyword) ||
                        String(m.matchedParam?.value || '').toLowerCase().includes(keyword)
                    )
                );
            }
        }
        
        // 匹配度过滤
        if (confidenceFilter === 'perfect') {
            results = results.filter(m => Math.round(m.confidence * 100) === 100);
        } else if (confidenceFilter === 'imperfect') {
            results = results.filter(m => Math.round(m.confidence * 100) < 100);
        }

        // 状态过滤 (V3.0 新增)
        if (statusFilter === 'filled') {
            results = results.filter(m => m.matchedParam || m.manualValue !== undefined);
        } else if (statusFilter === 'empty') {
            // "未填报" = 既没有自动匹配，也没有手动输入
            results = results.filter(m => !m.matchedParam && m.manualValue === undefined);
        }

        // 视同差异筛选：只留参考车型与本车值不同的字段
        if (groupMode && syncFilter && syncDiff) {
            const diffFields = new Set(syncDiff.items.map(item => item.field));
            results = results.filter(m => diffFields.has(m.requirementName));
        }

        // 必填筛选（只在字段组模式下有意义——必填标记存在字段组上）
        if (groupMode && requiredFilter !== 'all') {
            const requiredSet = new Set(fieldGroup?.required ?? []);
            const valueOf = (m: MatchItem) => m.manualValue !== undefined
                ? m.manualValue
                : (m.matchedParam?.value?.toString() || '');
            results = results.filter(m => {
                const isRequired = requiredSet.has(m.requirementName);
                if (requiredFilter === 'required') return isRequired;
                if (requiredFilter === 'optional') return !isRequired;
                // required_missing：必填但没值
                return isRequired && !valueOf(m).trim();
            });
        }

        // 快捷字段筛选
        if (quickFilter === 'enum_mismatch' && enumLoaded) {
            results = results.filter(m => {
                const value = m.manualValue !== undefined
                    ? m.manualValue
                    : (m.matchedParam?.value?.toString() || '');
                if (!value) return false;
                const enums = getEnumValuesSync(m.requirementName);
                return enums.length > 0 && !enums.includes(value);
            });
        }
        
        return results;
    }, [tableResults, searchText, confidenceFilter, statusFilter, quickFilter, enumLoaded, groupMode, requiredFilter, fieldGroup, syncFilter, syncDiff]);

    const handleCopy = () => {
        if (!filteredResults.length) {
            message.warning('暂无内容可复制');
            return;
        }

        // Prepare data for export
        const headers = ['需求参数名', '匹配库参数名', '填报值', '置信度', '状态'];
        const rows = filteredResults.map(m => {
            // 优先使用手动输入的值
            const displayValue = m.manualValue !== undefined 
                ? m.manualValue 
                : ((m.matchedParam?.value !== undefined && m.matchedParam?.value !== null) 
                    ? String(m.matchedParam.value) 
                    : '');

            return [
                m.requirementName,
                m.manualValue !== undefined ? '(手动输入)' : (m.matchedParam?.name || '(未匹配)'),
                displayValue,
                (m.confidence * 100).toFixed(0) + '%',
                m.manualValue !== undefined ? '手动' : (m.matchedParam ? '已匹配' : '未匹配')
            ];
        });

        const data = [headers, ...rows];

        // Create workbook and worksheet
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Convert to CSV string using SheetJS utility
        const csvOutput = XLSX.utils.sheet_to_csv(ws);

        // Copy to clipboard
        navigator.clipboard.writeText(csvOutput)
            .then(() => {
                message.success('填报结果 (CSV格式) 已复制到剪贴板');
            })
            .catch(err => {
                message.error('复制失败: ' + err);
            });
    };

    const handleDownload = async () => {
        if (!filteredResults.length) {
            message.warning('暂无内容可下载');
            return;
        }

        // Prepare data for export
        const headers = ['需求参数名', '匹配库参数名', '填报值', '置信度', '状态'];
        const rows = filteredResults.map(m => {
            const displayValue = m.manualValue !== undefined 
                ? m.manualValue 
                : ((m.matchedParam?.value !== undefined && m.matchedParam?.value !== null) 
                    ? String(m.matchedParam.value) 
                    : '');

            return [
                m.requirementName,
                m.manualValue !== undefined ? '(手动输入)' : (m.matchedParam?.name || '(未匹配)'),
                displayValue,
                (m.confidence * 100).toFixed(0) + '%',
                m.manualValue !== undefined ? '手动' : (m.matchedParam ? '已匹配' : '未匹配')
            ];
        });

        const data = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const csvOutput = XLSX.utils.sheet_to_csv(ws);

        const { downloadCsv } = await import('../../utils/downloadCsv');
        await downloadCsv(csvOutput, '智能填报结果.csv');
    };

    const toggleManualMode = useCallback((id: string) => {
        const turningOn = !manualInputMode[id];
        setManualInputMode(prev => ({
            ...prev,
            [id]: turningOn
        }));

        const record = tableResults.find(m => m.id === id);
        // bugfix: 切到手动模式且尚无手动值时，固化为「显式空值」(manualValue='')，
        // 导出保持空值，不再回退到自动匹配值（如 N/A）
        if (turningOn && record && record.manualValue === undefined) {
            updateManualValue(id, '', { explicitEmpty: true });
        }
        // 切回枚举/自动模式：撤销显式空值，恢复自动匹配值
        if (!turningOn && record && record.manualValue === '') {
            updateManualValue(id, '');
        }
    }, [manualInputMode, tableResults, updateManualValue]);

    // columns memo：列定义引用稳定（依赖 handler 均 useCallback 化），
    // 避免 typing/勾选等无关更新触发全表重渲染
    const columns = useMemo(() => [
        {
            title: '需求参数名',
            dataIndex: 'requirementName',
            key: 'requirementName',
            width: 250,
            render: (text: string) => (
                <span className="inline-flex items-center gap-1.5 min-w-0">
                    <b className="text-1 truncate" title={text}>{text}</b>
                    {groupMode && requiredSet.has(text) && (
                        <span className="text-danger flex-shrink-0" title="必填">*</span>
                    )}
                </span>
            )
        },
        {
            title: '匹配度',
            dataIndex: 'confidence',
            key: 'confidence',
            width: 150,
            render: (score: number, record: MatchItem) => {
                return (
                    <div className="flex items-center gap-2">
                        <Progress percent={Math.round(score * 100)} size="small" steps={5} strokeColor={score > 0.8 ? 'var(--success)' : score > 0.5 ? 'var(--warning)' : 'var(--danger)'} showInfo={false} />
                        <span className="text-xs text-2 tabular-nums">{Math.round(score * 100)}%</span>
                        {record.isManual && <Tag color="default" className="ml-1">人工</Tag>}
                    </div>
                );
            }
        },
        {
            title: groupMode ? '取值来源' : '匹配库参数',
            key: 'matchedParam',
            width: 250,
            render: (_: unknown, record: MatchItem) => {
                // 字段组模式：下拉直接选资产字段，选完写回字段组的 sources（同组复用）
                if (groupMode) {
                    const resolved = groupExport.fields.find(f => f.field === record.requirementName);
                    const configured = fieldGroup?.sources?.[record.requirementName];
                    return (
                        <span className="flex items-center gap-1.5">
                            <Select
                                showSearch
                                allowClear
                                style={{ flex: 1, minWidth: 0 }}
                                placeholder="选择资产字段"
                                optionFilterProp="label"
                                value={resolved?.sources[0]}
                                status={resolved && resolved.sources.length === 0 ? 'error' : undefined}
                                options={sourceFieldOptions.map(name => ({ value: name, label: name }))}
                                onChange={value => handlePickSource(record.requirementName, value)}
                            />
                            {configured && (
                                <Tooltip title="已写入字段组配置，同组其他车型复用">
                                    <span className="text-aux text-3 flex-shrink-0">已配置</span>
                                </Tooltip>
                            )}
                            {resolved && resolved.sources.length > 1 && (
                                <Tooltip title={`组合字段：${resolved.sources.join(' + ')}`}>
                                    <Tag className="flex-shrink-0">{resolved.sources.length} 源</Tag>
                                </Tooltip>
                            )}
                        </span>
                    );
                }
                // 只读展示自动匹配的参数信息
                if (!record.matchedParam) {
                    return assetSourceFile ? (
                        <RepairableValue
                            value={<span className="text-danger">未匹配</span>}
                            repairable={true}
                            hint="点击修复源数据"
                            onRepair={() => triggerRepair(record.requirementName, 'unmatched')}
                        />
                    ) : <span className="text-3">未匹配</span>;
                }
                return (
                    <Tooltip title={`${record.matchedParam.group} / ${record.matchedParam.name}`}>
                        <span className="text-1">
                            {record.matchedParam.name}
                            <span className="text-3 ml-1">({record.matchedParam.value})</span>
                        </span>
                    </Tooltip>
                );
            }
        },
        {
            title: '填报值 (可修正)',
            key: 'value',
            width: 320,
            render: (_: unknown, record: MatchItem) => {
                const isManualMode = manualInputMode[record.id];
                
                // 当前值：优先手动值，其次自动匹配值
                const currentValue = record.manualValue !== undefined 
                    ? record.manualValue 
                    : (record.matchedParam?.value?.toString() || '');
                const isModified = record.manualValue !== undefined;
                
                // 获取枚举值
                const enumValues = enumLoaded ? getEnumValuesSync(record.requirementName) : [];
                const hasEnums = enumValues.length > 0;
                
                const enumMismatch = !!(assetSourceFile && hasEnums && currentValue && !enumValues.includes(currentValue));

                // 单行格律（设计：docs/plans/2026-10-16-表格行规范-design.md §3.2）：
                // 一个单元格只放一个「主控件」，次要信息收进 popover/tooltip，
                // 行高恒定、不再随内容浮动。此前四层堆叠 + 重复显示同一个值，是
                // 「智能填报太丑 / 行距跟别的模块不一样」的直接原因。
                return (
                    <div className="flex items-center gap-1.5">
                        {isManualMode ? (
                            // 手动输入模式
                            <Input
                                defaultValue={currentValue}
                                onBlur={(e) => commitValue(record, e.target.value, true)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { commitValue(record, (e.target as HTMLInputElement).value, true); (e.target as HTMLInputElement).blur(); } }}
                                placeholder="手动输入..."
                                style={{ flex: 1, minWidth: 0 }}
                                className={isModified ? 'border-blue-400' : ''}
                            />
                        ) : hasEnums ? (
                            // 枚举选择模式
                            <Select
                                showSearch
                                style={{ flex: 1, minWidth: 0 }}
                                placeholder="选择填报值"
                                optionFilterProp="label"
                                value={currentValue || undefined}
                                onChange={(value) => commitValue(record, String(value), false)}
                                options={enumValues.map(v => ({ value: v, label: v }))}
                                suffixIcon={<DatabaseOutlined style={{ color: 'var(--brand)' }} />}
                                status={enumMismatch ? 'error' : (!currentValue ? 'warning' : undefined)}
                            />
                        ) : (
                            // 无枚举时默认输入框；有自动匹配值时清空=显式空值，避免导出回退 N/A
                            <Input
                                defaultValue={currentValue}
                                onBlur={(e) => commitValue(record, e.target.value, !!record.matchedParam)}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitValue(record, (e.target as HTMLInputElement).value, !!record.matchedParam); }}
                                placeholder="输入填报值"
                                style={{ flex: 1, minWidth: 0 }}
                                className={`font-mono ${isModified ? 'border-blue-400' : ''}`}
                            />
                        )}

                        {/* 枚举不匹配：一行图标按钮，点击修复源数据（原先整块 RepairableValue 会把值显示第二遍） */}
                        {enumMismatch && (
                            <Tooltip title={`“${currentValue}”不在枚举列表中，点击修复源数据`}>
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<WarningOutlined style={{ color: 'var(--warning)' }} />}
                                    aria-label="修复枚举不匹配"
                                    onClick={() => triggerRepair(record.requirementName, 'enum_mismatch')}
                                    className="flex-shrink-0"
                                />
                            </Tooltip>
                        )}

                        {/* 已修改标记：一行内的轻量提示，不再用输入框 suffix 撑高行 */}
                        {isModified && !isManualMode && (
                            <Tooltip title="已手动修改">
                                <span className="text-xs text-brand flex-shrink-0">已改</span>
                            </Tooltip>
                        )}

                        {/* 模式切换：图标按钮（与控件等高 24px），不再用 Switch 撑行 */}
                        {hasEnums && (
                            <Tooltip title={isManualMode ? '切换为枚举选择' : '切换为手动输入'}>
                                <Button
                                    size="small"
                                    type="text"
                                    icon={isManualMode ? <DatabaseOutlined /> : <EditOutlined />}
                                    aria-label={isManualMode ? '切换为枚举选择' : '切换为手动输入'}
                                    onClick={() => toggleManualMode(record.id)}
                                    className="flex-shrink-0"
                                />
                            </Tooltip>
                        )}
                    </div>
                );
            }
        },
        /** 视同参考：单独一列，直接显示参考车型该字段的值 + 一键采纳 */
        ...(groupMode ? [{
                title: '视同参考',
                key: 'sync',
                width: 220,
                render: (_: unknown, record: MatchItem) => {
                    if (!syncDiff) {
                        return <span className="text-aux text-3">选择参考车型后显示</span>;
                    }
                    const item = syncDiff.items.find(i => i.field === record.requirementName);
                    if (!item) {
                        return <span className="text-aux text-3">一致</span>;
                    }
                    return (
                        <span className="flex items-center gap-1.5 min-w-0">
                            <Tooltip title={`本车：${item.currentValue || '（空）'}`}>
                                <span className="text-1 truncate flex-1 min-w-0 font-mono">{item.referenceValue}</span>
                            </Tooltip>
                            <Button
                                size="small"
                                className="flex-shrink-0"
                                onClick={() => applySync([record.requirementName])}
                            >
                                采纳
                            </Button>
                        </span>
                    );
                },
            }] : [])
    ], [assetSourceFile, triggerRepair, manualInputMode, enumLoaded, toggleManualMode, groupMode, groupExport.fields, fieldGroup, handlePickSource, sourceFieldOptions, requiredSet, commitValue, syncDiff, applySync]);

    // 计算枚举不匹配的记录
    const enumMismatchItems = useMemo(() => {
        if (!enumLoaded) return [];
        return filteredResults.filter(m => {
            const value = m.manualValue !== undefined
                ? m.manualValue
                : (m.matchedParam?.value?.toString() || '');
            if (!value) return false;
            const enums = getEnumValuesSync(m.requirementName);
            return enums.length > 0 && !enums.includes(value);
        });
    }, [filteredResults, enumLoaded]);

    // 「清除筛选」：与数据体检同一套退出机制（列表区设计语言 §5.3）
    const filtersActive = quickFilter !== 'none'
        || Boolean(searchText.trim())
        || confidenceFilter !== 'all'
        || statusFilter !== 'all'
        || (groupMode && requiredFilter !== 'all')
        || (groupMode && syncFilter);
    const resetFilters = () => {
        setQuickFilter('none');
        setSearchText('');
        setConfidenceFilter('all');
        setStatusFilter('all');
        setRequiredFilter('all');
        setSyncFilter(false);
    };

    if (!tableResults.length) return null;

    return (
        <>
        {/* 列表页外壳统一走 ListToolbar（设计：2026-10-16-列表页设计语言 §4.1/§4.3）。
           此前是「手写 flex 标题行 + ListToolbar 只当筛选行」两套壳并存，
           正是 R7 抓到的半成品状态。 */}
        <ListToolbar
            className="mt-3"
            title="匹配结果"
            count={{ shown: filteredResults.length, total: tableResults.length }}
            actions={
                <>
                    {/* 上传回执：粘贴车上云报错，直接定位到字段修正 */}
                    {groupMode && (
                        <Button icon={<BugOutlined />} onClick={() => setFeedbackOpen(true)}>
                            上传回执修正
                        </Button>
                    )}
                    {/* 视同：把参考车型的已矫正值一次写入当前车型 */}
                    {groupMode && syncDiff && syncDiff.items.length > 0 && (
                        <Popconfirm
                            title={`将按「${syncReference ? labelOf(syncReference).short : ''}」写回 ${syncDiff.items.length} 个字段`}
                            description={
                                <div className="max-h-[240px] overflow-auto text-xs text-3 flex flex-col gap-0.5">
                                    {syncDiff.items.slice(0, 30).map(item => (
                                        <span key={item.field}>{item.field}：{item.referenceValue}</span>
                                    ))}
                                    {syncDiff.items.length > 30 && <span>…等 {syncDiff.items.length} 项</span>}
                                </div>
                            }
                            okText="全部视同"
                            cancelText="取消"
                            onConfirm={() => applySync(syncDiff.items.map(item => item.field))}
                        >
                            <Button icon={<SyncOutlined />}>
                                视同参考差异（{syncDiff.items.length}）
                            </Button>
                        </Popconfirm>
                    )}
                    {/* §5.1：≥3 个动作收进下拉，标题行只留 1 个 primary */}
                    <Dropdown
                        menu={{
                            items: [
                                { key: 'copy-csv', icon: <CopyOutlined />, label: '复制 CSV' },
                                { key: 'download-csv', icon: <DownloadOutlined />, label: '下载 CSV' },
                                ...(enumMismatchItems.length > 0
                                    ? [
                                          { type: 'divider' as const },
                                          {
                                              key: 'copy-enum',
                                              icon: <WarningOutlined />,
                                              danger: true,
                                              label: `复制枚举异常字段（${enumMismatchItems.length}）`,
                                          },
                                      ]
                                    : []),
                            ],
                            onClick: ({ key }) => {
                                if (key === 'copy-csv') { handleCopy(); return; }
                                if (key === 'download-csv') { handleDownload(); return; }
                                const lines = enumMismatchItems.map(m => {
                                    const value = m.manualValue !== undefined
                                        ? m.manualValue
                                        : (m.matchedParam?.value?.toString() || '');
                                    return `${m.requirementName}\t${value}`;
                                });
                                navigator.clipboard.writeText('参数名\t当前值\n' + lines.join('\n'))
                                    .then(() => message.success(`已复制 ${enumMismatchItems.length} 个枚举异常字段`))
                                    .catch(() => message.error('复制失败'));
                            },
                        }}
                        trigger={['click']}
                    >
                        <Button>
                            导出 <DownOutlined className="text-aux" />
                        </Button>
                    </Dropdown>
                    <Button
                        type="primary"
                        icon={<CloudUploadOutlined />}
                        onClick={async () => {
                            // 字段组模式：按字段组 + 导出格式出文件（顺序、名字、留空全部由组决定）
                            if (groupMode) {
                                if (!filteredResults.length) { message.warning('暂无内容可导出'); return; }
                                await groupExport.exportWorkbook();
                                return;
                            }
                            if (!filteredResults.length) { message.warning('暂无内容可导出'); return; }
                            const rows = filteredResults.map(m => {
                                const value = m.manualValue !== undefined
                                    ? m.manualValue
                                    : ((m.matchedParam?.value !== undefined && m.matchedParam?.value !== null)
                                        ? String(m.matchedParam.value) : '');
                                return [m.requirementName, value];
                            });
                            const data = [['参数项名称', '参数值'], ...rows];
                            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                            const name = productName ? getVehicleProductName(productName) : '未命名车型';
                            const fileName = `车上云系统导入_${name}_${date}.xlsx`;

                            // Phase 5：Tauri 下由 Rust rust_xlsxwriter 直接写盘（不再占用前端线程）
                            if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
                                try {
                                    const { save } = await import('@tauri-apps/plugin-dialog');
                                    const { invoke } = await import('@tauri-apps/api/core');
                                    const target = await save({
                                        defaultPath: fileName,
                                        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
                                    });
                                    if (!target) return; // 用户取消
                                    await invoke('export_xlsx', {
                                        path: target,
                                        sheetName: '产品准入导入模版',
                                        rows: data,
                                        colWidths: [30, 40],
                                    });
                                    message.success('导出成功');
                                } catch (err) {
                                    message.error(`导出失败: ${(err as Error).message}`);
                                }
                                return;
                            }

                            // 非 Tauri 环境回退浏览器下载
                            const ws = XLSX.utils.aoa_to_sheet(data);
                            // 设置列宽
                            ws['!cols'] = [{ wch: 30 }, { wch: 40 }];
                            const wb = XLSX.utils.book_new();
                            XLSX.utils.book_append_sheet(wb, ws, '产品准入导入模版');
                            XLSX.writeFile(wb, fileName);
                            message.success('导出成功');
                        }}
                    >
                        {groupMode ? `按格式导出${exportFormat ? ` · ${exportFormat.name}` : ''}` : '车上云系统模板导出'}
                    </Button>
                </>
            }
            filters={
                    <>
                        <FilterItem label="匹配度">
                            <Select
                                value={confidenceFilter}
                                onChange={setConfidenceFilter}
                                style={{ width: 140 }}
                                options={[
                                    { label: '全部', value: 'all' },
                                    { label: '100%匹配', value: 'perfect' },
                                    { label: '<100%匹配', value: 'imperfect' },
                                ]}
                            />
                        </FilterItem>
                        <FilterItem label="状态">
                            <Select
                                value={statusFilter}
                                onChange={setStatusFilter}
                                style={{ width: 140 }}
                                options={[
                                    { label: '全部', value: 'all' },
                                    { label: '已填报', value: 'filled' },
                                    { label: '未填报', value: 'empty' },
                                ]}
                            />
                        </FilterItem>

                        {/* 视同参考：把另一车型已矫正的值复制过来（同数据体检的语义） */}
                        {groupMode && candidateProducts.length > 0 && (
                            <FilterItem label="视同参考">
                                <Select
                                    allowClear
                                    showSearch
                                    optionFilterProp="label"
                                    style={{ width: 220 }}
                                    value={syncReference ?? undefined}
                                    placeholder="选择已矫正的车型"
                                    onChange={value => { setSyncReference(value ?? null); setSyncFilter(false); }}
                                    options={candidateProducts
                                        .filter(name => name !== productName)
                                        .map(name => ({
                                            value: name,
                                            // 选项值是资产 key，显示必须是车型名，否则用户看到 asset::xxx
                                            label: labelOf(name).short,
                                            title: labelOf(name).full,
                                        }))}
                                />
                            </FilterItem>
                        )}
                        {groupMode && syncDiff && (
                            <FilterItem label="视同">
                                <FacetChips
                                    clearable
                                    options={[{
                                        value: 'diff',
                                        label: '仅差异',
                                        count: syncDiff.items.length,
                                        tone: syncDiff.items.length > 0 ? 'warning' : undefined,
                                    }]}
                                    value={syncFilter ? 'diff' : ''}
                                    onChange={v => setSyncFilter(v === 'diff')}
                                />
                            </FilterItem>
                        )}

                        {/* 必填筛选：只在字段组模式出现——必填标记存在字段组上 */}
                        {groupMode && (
                            <FilterItem label="必填">
                                <Select
                                    value={requiredFilter}
                                    onChange={setRequiredFilter}
                                    style={{ width: 140 }}
                                    options={[
                                        { label: '全部', value: 'all' },
                                        { label: '仅必填', value: 'required' },
                                        { label: '仅选填', value: 'optional' },
                                        { label: '必填未填', value: 'required_missing' },
                                    ]}
                                />
                            </FilterItem>
                        )}

                        {/* V3.1: 快捷筛选 → 统一为 chip，不再用变色主按钮。
                            clearable：再点一次即取消——此前选中后没有回到全量的入口。 */}
                        <FilterItem label="快捷">
                            <FacetChips
                                clearable
                                options={[
                                    {
                                        value: 'enum_mismatch',
                                        label: '枚举异常',
                                        count: enumMismatchItems.length,
                                        tone: enumMismatchItems.length > 0 ? 'warning' : undefined,
                                    },
                                ]}
                                value={quickFilter === 'enum_mismatch' ? 'enum_mismatch' : ''}
                                onChange={v => setQuickFilter(v === 'enum_mismatch' ? 'enum_mismatch' : 'none')}
                            />
                        </FilterItem>
                        {filtersActive && (
                            <Button type="link" size="small" className="px-0" onClick={resetFilters}>
                                清除筛选
                            </Button>
                        )}
                        {/* 筛选行顺序（列表区设计语言 §5.3）：维度筛选在左，搜索靠右、不带标签 */}
                        <span className="ml-auto" />
                        <SearchInput
                            multiline
                            width="lg"
                            hint="支持换行搜索多个"
                            placeholder="搜索参数名、匹配名或值"
                            value={searchText}
                            onChange={setSearchText}
                        />
                    </>
                }
            padded={false}
        >
            {/* 不用 virtual：虚拟滚动按固定值估行高（small 档 ≈37px），而本表行内含
                可变高内容，估位与实际不符会让滚动条长度与定位失真。参照页（数据体检）
                同样渲染全量行，量级相当（323 vs 437 行）。见表格行规范 §2.1/§3.2。 */}
            <DataTable
                dataSource={filteredResults}
                columns={columns}
                rowKey="id"
                scrollY={600}
            />
        </ListToolbar>

        {groupMode && fieldGroup && feedbackOpen && (
            <UploadFeedbackModal
                open
                fields={groupExport.fields}
                getEnums={getEnumValuesSync}
                onFixValue={(field, value) => {
                    if (!productName) return;
                    // 行的 id 就是字段名；找不到时构造一条，commitValue 仍能写进按车型的修正值
                    const record = tableResults.find(m => m.requirementName === field)
                        ?? { id: field, requirementName: field, matchedParam: null, confidence: 1, isManual: true };
                    updateManualValue(record.id, value, { explicitEmpty: true });
                    setProductManualValue(productName, field, value);
                }}
                onLocate={(field) => {
                    // 用搜索框精确定位：字段名唯一，比滚动可靠
                    setSearchText(field);
                    message.info(`已筛选到「${field}」`);
                }}
                requiredFields={fieldGroup?.required ?? []}
                onMarkRequired={handleMarkRequired}
                onClose={() => setFeedbackOpen(false)}
            />
        )}
        </>
    );
};

export default MatchResultTable;
