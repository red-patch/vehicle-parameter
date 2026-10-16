import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Tag, Select, Progress, Button, message, Input, Tooltip, Popover, Dropdown } from 'antd';
import { FilterItem } from '../common/FilterBar';
import ListToolbar from '../common/ListToolbar';
import SearchInput from '../common/SearchInput';
import FacetChips from '../common/FacetChips';
import DataTable from '../common/DataTable';
import { useVehicleStore } from '../../store/vehicleStore';
import { getProductData } from '../../store/vehicleSelectors';
import { useShallow } from 'zustand/react/shallow';
import Fuse from 'fuse.js';
import type { MatchItem } from '../../types';
import { CheckCircleOutlined, DownloadOutlined, EditOutlined, DatabaseOutlined, CloudUploadOutlined, WarningOutlined, CopyOutlined, BulbOutlined, DownOutlined } from '@ant-design/icons';
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
                                onBlur={(e) => updateManualValue(record.id, e.target.value, { explicitEmpty: true })}
                                onKeyDown={(e) => { if (e.key === 'Enter') { updateManualValue(record.id, (e.target as HTMLInputElement).value, { explicitEmpty: true }); (e.target as HTMLInputElement).blur(); } }}
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
                                onChange={(value) => updateManualValue(record.id, String(value))}
                                options={enumValues.map(v => ({ value: v, label: v }))}
                                suffixIcon={<DatabaseOutlined style={{ color: 'var(--brand)' }} />}
                                status={enumMismatch ? 'error' : (!currentValue ? 'warning' : undefined)}
                            />
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

                        {/* 快捷推荐：收进 popover，避免第二行把行高撑开 */}
                        {fixes && fixes.length > 0 && !isManualMode && (
                            <Popover
                                trigger="click"
                                placement="bottomRight"
                                title="推荐值"
                                content={
                                    <div className="flex flex-col gap-1 max-w-[240px]">
                                        {fixes.map((f, i) => (
                                            <span
                                                key={i}
                                                className="cell-edit-text text-2"
                                                title={`提取自字段：${f.title}`}
                                                onClick={() => updateManualValue(record.id, f.value, { explicitEmpty: true })}
                                            >
                                                {f.value || '(空)'}
                                            </span>
                                        ))}
                                    </div>
                                }
                            >
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<BulbOutlined />}
                                    aria-label={`推荐值（${fixes.length}）`}
                                    className="flex-shrink-0"
                                />
                            </Popover>
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
        /* 列表页外壳统一走 ListToolbar（设计：2026-10-16-列表页设计语言 §4.1/§4.3）。
           此前是「手写 flex 标题行 + ListToolbar 只当筛选行」两套壳并存，
           正是 R7 抓到的半成品状态。 */
        <ListToolbar
            className="mt-8"
            title={
                <>
                    <CheckCircleOutlined className="text-success" />
                    <span className="font-semibold text-1">匹配结果预览</span>
                    <Tag className="m-0">{filteredResults.length}/{matchResults.length}</Tag>
                </>
            }
            actions={
                <>
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
                            导出 <DownOutlined style={{ fontSize: 10 }} />
                        </Button>
                    </Dropdown>
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
                </>
            }
            filters={
                    <>
                        <FilterItem label="搜索">
                            <SearchInput
                                multiline
                                width="lg"
                                hint="支持换行搜索多个"
                                placeholder="搜索参数名、匹配名或值"
                                value={searchText}
                                onChange={setSearchText}
                            />
                        </FilterItem>
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

                        {/* V3.1: 快捷筛选 → 统一为 chip，不再用变色主按钮 */}
                        <FilterItem label="快捷">
                            <FacetChips
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
    );
};

export default MatchResultTable;
