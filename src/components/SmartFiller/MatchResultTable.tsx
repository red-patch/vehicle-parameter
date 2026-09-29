import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Tag, Select, Progress, Button, message, Input, Switch, Tooltip } from 'antd';
import { FilterBar, FilterItem } from '../common/FilterBar';
import DataTable from '../common/DataTable';
import { useVehicleStore } from '../../store/vehicleStore';
import { getProductData } from '../../store/vehicleSelectors';
import { useShallow } from 'zustand/react/shallow';
import Fuse from 'fuse.js';
import type { MatchItem } from '../../types';
import { CheckCircleOutlined, DownloadOutlined, EditOutlined, DatabaseOutlined, CloudUploadOutlined, WarningOutlined, CopyOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { preloadEnumData, getEnumValuesSync, isEnumDataLoaded } from '../../utils/attributeEnums';
import { buildRepairContext, getAssetBackedSourceFile } from '../ParameterWorkbench/quickRepair';
import RepairableValue from '../common/RepairableValue';
import { getVehicleProductName } from '../../utils/vehicleInstance';

interface MatchResultTableProps {
    productName?: string | null;
    onGoRepair?: () => void;
}

const MatchResultTable: React.FC<MatchResultTableProps> = ({ productName, onGoRepair }) => {
    const { matchResults, updateManualValue, uploadedFiles, assetFiles, setPurifyProduct, setRepairContext } = useVehicleStore(useShallow(state => ({
        matchResults: state.matchResults,
        updateManualValue: state.updateManualValue,
        uploadedFiles: state.uploadedFiles,
        assetFiles: state.assetFiles,
        setPurifyProduct: state.setPurifyProduct,
        setRepairContext: state.setRepairContext,
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

    const triggerRepair = useCallback((fieldName: string, reason: 'unmatched' | 'enum_mismatch') => {
        if (!productName || !assetSourceFile) return;
        setRepairContext(buildRepairContext('smart_fill', productName, assetSourceFile, reason, fieldName));
        setPurifyProduct(productName);
        onGoRepair?.();
    }, [productName, assetSourceFile, setRepairContext, setPurifyProduct, onGoRepair]);

    // 计算快捷修正推荐
    const quickFixes = useMemo(() => {
        if (library.length === 0 || matchResults.length === 0) return {};
        const fixes: Record<string, { title: string; value: string }[]> = {};
        
        const fuse = new Fuse(library, {
            keys: ['name'],
            includeScore: true,
            threshold: 0.6,
            ignoreLocation: true,
        });

        matchResults.forEach(m => {
            if (m.confidence < 1.0) {
                const results = fuse.search(m.requirementName, { limit: 4 });
                const filtered = results
                    .filter(r => r.item.name !== m.matchedParam?.name)
                    .slice(0, 3)
                    .map(r => ({
                        title: r.item.name,
                        value: String(r.item.value || '')
                    }));
                if (filtered.length > 0) {
                    fixes[m.id] = filtered;
                }
            }
        });
        return fixes;
    }, [library, matchResults]);

    // V3.0: 过滤后的数据
    const filteredResults = useMemo(() => {
        let results = matchResults;
        
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
    }, [matchResults, searchText, confidenceFilter, statusFilter, quickFilter]);

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

        const record = matchResults.find(m => m.id === id);
        // bugfix: 切到手动模式且尚无手动值时，固化为「显式空值」(manualValue='')，
        // 导出保持空值，不再回退到自动匹配值（如 N/A）
        if (turningOn && record && record.manualValue === undefined) {
            updateManualValue(id, '', { explicitEmpty: true });
        }
        // 切回枚举/自动模式：撤销显式空值，恢复自动匹配值
        if (!turningOn && record && record.manualValue === '') {
            updateManualValue(id, '');
        }
    }, [manualInputMode, matchResults, updateManualValue]);

    // columns memo：列定义引用稳定（依赖 handler 均 useCallback 化），
    // 避免 typing/勾选等无关更新触发全表重渲染
    const columns = useMemo(() => [
        {
            title: '需求参数名',
            dataIndex: 'requirementName',
            key: 'requirementName',
            width: 250,
            render: (text: string) => <b className="text-1">{text}</b>
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
            title: '匹配库参数',
            key: 'matchedParam',
            width: 250,
            render: (_: unknown, record: MatchItem) => {
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
                const fixes = quickFixes[record.id];
                
                return (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            {isManualMode ? (
                            // 手动输入模式
                            <Input
                                defaultValue={currentValue}
                                onBlur={(e) => updateManualValue(record.id, e.target.value, { explicitEmpty: true })}
                                onKeyDown={(e) => { if (e.key === 'Enter') { updateManualValue(record.id, (e.target as HTMLInputElement).value, { explicitEmpty: true }); (e.target as HTMLInputElement).blur(); } }}
                                placeholder="手动输入..."
                                style={{ flex: 1, minWidth: 0 }}
                                className={isModified ? 'border-blue-400' : ''}
                                suffix={isModified ? <Tag color="processing" className="mr-0">已修改</Tag> : null}
                            />
                        ) : hasEnums ? (
                            // 枚举选择模式
                            <>
                            <Select
                                showSearch
                                style={{ flex: 1, minWidth: 0 }}
                                placeholder="选择填报值"
                                optionFilterProp="label"
                                value={currentValue || undefined}
                                onChange={(value) => updateManualValue(record.id, String(value))}
                                options={enumValues.map(v => ({ value: v, label: v }))}
                                suffixIcon={<DatabaseOutlined style={{ color: 'var(--brand)' }} />}
                                status={currentValue && !enumValues.includes(currentValue) ? 'error' : (!currentValue ? 'warning' : undefined)}
                            />
                            {currentValue && !enumValues.includes(currentValue) && (
                                <Tooltip title={`“${currentValue}”不在枚举列表中，需更新字典`}>
                                    <WarningOutlined style={{ color: 'var(--warning)', fontSize: 16 }} />
                                </Tooltip>
                            )}
                            </>
                        ) : (
                            // 无枚举时默认输入框；有自动匹配值时清空=显式空值，避免导出回退 N/A
                            <Input
                                defaultValue={currentValue}
                                onBlur={(e) => updateManualValue(record.id, e.target.value, record.matchedParam ? { explicitEmpty: true } : undefined)}
                                onKeyDown={(e) => { if (e.key === 'Enter') updateManualValue(record.id, (e.target as HTMLInputElement).value, record.matchedParam ? { explicitEmpty: true } : undefined); }}
                                placeholder="输入填报值"
                                style={{ flex: 1, minWidth: 0 }}
                                className={`font-mono ${isModified ? 'border-blue-400' : ''}`}
                            />
                        )}
                        {/* 模式切换开关 */}
                        {hasEnums && (
                            <Tooltip title={isManualMode ? '切换为枚举选择' : '切换为手动输入'}>
                                <Switch
                                    size="small"
                                    checkedChildren={<EditOutlined />}
                                    unCheckedChildren={<DatabaseOutlined />}
                                    checked={isManualMode}
                                    onChange={() => toggleManualMode(record.id)}
                                />
                            </Tooltip>
                        )}
                        </div>
                        
                        {/* 快捷推荐修正 (Quick Fix) */}
                        {fixes && fixes.length > 0 && !isManualMode && (
                            <div className="flex items-center flex-wrap gap-1 mt-1">
                                <span className="text-xs text-3 mr-1">推荐:</span>
                                {fixes.map((f, i) => (
                                    <Tooltip key={i} title={`提取自字段: ${f.title}`}>
                                        <Tag
                                            className="hover:border-brand text-xs m-0"
                                            color="default"
                                            onClick={() => updateManualValue(record.id, f.value, { explicitEmpty: true })}
                                        >
                                            {f.value ? (f.value.length > 15 ? f.value.substring(0, 15) + '...' : f.value) : '(空)'}
                                        </Tag>
                                    </Tooltip>
                                ))}
                            </div>
                        )}
                        {assetSourceFile && hasEnums && currentValue && !enumValues.includes(currentValue) && (
                            <RepairableValue
                                value={<span className="text-warning font-medium">{currentValue}</span>}
                                repairable={true}
                                hint="点击修复源数据"
                                className="self-start"
                                onRepair={() => triggerRepair(record.requirementName, 'enum_mismatch')}
                            />
                        )}
                    </div>
                );
            }
        }
    ], [assetSourceFile, triggerRepair, manualInputMode, enumLoaded, updateManualValue, quickFixes, toggleManualMode]);

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

    if (!matchResults.length) return null;

    return (
        <div className="mt-8 surface-container p-4 rounded border border-default">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <CheckCircleOutlined className="text-success" />
                    匹配结果预览
                    <Tag>{filteredResults.length}/{matchResults.length}</Tag>
                </h3>
                <div className="flex gap-2 flex-wrap">
                    <Button onClick={handleCopy}>
                        复制填报结果 (CSV)
                    </Button>
                    <Button icon={<DownloadOutlined />} onClick={handleDownload}>
                        下载 CSV
                    </Button>
                    {enumMismatchItems.length > 0 && (
                        <Button
                            icon={<CopyOutlined />}
                            danger
                            onClick={() => {
                                const lines = enumMismatchItems.map(m => {
                                    const value = m.manualValue !== undefined
                                        ? m.manualValue
                                        : (m.matchedParam?.value?.toString() || '');
                                    return `${m.requirementName}\t${value}`;
                                });
                                navigator.clipboard.writeText('参数名\t当前值\n' + lines.join('\n'))
                                    .then(() => message.success(`已复制 ${enumMismatchItems.length} 个枚举异常字段`))
                                    .catch(() => message.error('复制失败'));
                            }}
                        >
                            复制枚举异常字段 ({enumMismatchItems.length})
                        </Button>
                    )}
                    <Button
                        type="primary"
                        icon={<CloudUploadOutlined />}
                        onClick={async () => {
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
                        车上云系统模板导出
                    </Button>
                </div>
            </div>

            {/* V3.0: 过滤器区域 */}
            <FilterBar>
                <FilterItem label="搜索:">
                    <Input.TextArea
                        placeholder="搜索参数名、匹配名或值... (支持换行搜索多个)"
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        allowClear
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        style={{ width: 320 }}
                    />
                </FilterItem>
                <FilterItem label="匹配度:">
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
                <FilterItem label="状态:">
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

                {/* V3.1: 快捷筛选按钮 */}
                <FilterItem label="快捷:">
                    <Button
                        type={quickFilter === 'enum_mismatch' ? 'primary' : 'default'}
                        size="small"
                        danger={quickFilter !== 'enum_mismatch' && enumMismatchItems.length > 0}
                        icon={<WarningOutlined />}
                        onClick={() => setQuickFilter(quickFilter === 'enum_mismatch' ? 'none' : 'enum_mismatch')}
                        loading={!enumLoaded}
                    >
                        枚举异常 ({enumMismatchItems.length})
                    </Button>
                </FilterItem>
            </FilterBar>

            <DataTable
                dataSource={filteredResults}
                columns={columns}
                rowKey="id"
                scrollY={600}
                scrollX={970}
                virtual
            />
        </div>
    );
};

export default MatchResultTable;
