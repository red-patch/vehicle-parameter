import React, { useMemo, useState } from 'react';
import { Table, Tabs, Tag, Badge, Typography, Select, Segmented, message } from 'antd';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import ParametersTable from './ParametersTable';
import type { CompareMode } from '../../types';
import { isFieldRequired } from '../../assets/requiredFields';
import ReportExportDropdown from '../common/ReportExportDropdown';
import ListToolbar from '../common/ListToolbar';
import SearchInput from '../common/SearchInput';
import { FilterItem } from '../common/ListToolbar';
import { countUniqueModified, countUniqueParameters, exportDiffReport } from '../../utils/diffReport';
import type { ReportFormat } from '../../utils/reportExport';
import { pagePagination } from '../common/tablePresets';

const { Text } = Typography;

const DiffResultView: React.FC = () => {
    const { diffResult, baseFile, targetFile, compareMode, setCompareMode } = useVehicleStore(useShallow(state => ({
        diffResult: state.diffResult,
        baseFile: state.baseFile,
        targetFile: state.targetFile,
        compareMode: state.compareMode,
        setCompareMode: state.setCompareMode,
    })));
    const [selectedSheet, setSelectedSheet] = useState<string>('all');
    const [modifiedSearchText, setModifiedSearchText] = useState<string>('');
    const [miitSearchText, setMiitSearchText] = useState<string>('');

    // 检测是否可以使用 MIIT 模式（targetFile 来自工信部）
    const isMiitModeAvailable = useMemo(() => {
        return targetFile?.data.some(p => p.originSheet === '工信部官网') ?? false;
    }, [targetFile]);

    // Extract all unique sheet names
    const allSheets = useMemo(() => {
        if (!baseFile && !targetFile) return [];
        const sheets = new Set<string>();
        baseFile?.data.forEach(p => p.originSheet && sheets.add(p.originSheet));
        targetFile?.data.forEach(p => p.originSheet && sheets.add(p.originSheet));
        return Array.from(sheets).sort();
    }, [baseFile, targetFile]);

    // Filter diff result based on selection
    const filteredDiff = useMemo(() => {
        if (!diffResult) return null;
        if (selectedSheet === 'all') return diffResult;

        return {
            added: diffResult.added.filter(p => p.originSheet === selectedSheet),
            removed: diffResult.removed.filter(p => p.originSheet === selectedSheet),
            modified: diffResult.modified.filter(m => m.oldParam.originSheet === selectedSheet), // Assuming old/new have same sheet
            unchanged: diffResult.unchanged.filter(p => p.originSheet === selectedSheet)
        };
    }, [diffResult, selectedSheet]);

    const stats = useMemo(() => {
        if (!filteredDiff) return [];
        const { added, removed, modified, unchanged } = filteredDiff;
        return [
            { label: '新增参数', value: countUniqueParameters(added), color: 'green' },
            { label: '移除参数', value: countUniqueParameters(removed), color: 'red' },
            { label: '变更参数', value: countUniqueModified(modified), color: 'orange' },
            { label: '未变参数', value: countUniqueParameters(unchanged), color: 'default' },
        ];
    }, [filteredDiff]);

    // 过滤变更数据（搜索功能）- 必须在条件返回之前定义
    const filteredModified = useMemo(() => {
        if (!filteredDiff) return [];
        const { modified } = filteredDiff;
        if (!modifiedSearchText) return modified;
        const lower = modifiedSearchText.toLowerCase();
        return modified.filter(m => 
            m.oldParam.name.toLowerCase().includes(lower) ||
            m.newParam.name.toLowerCase().includes(lower) ||
            m.oldParam.value.toString().toLowerCase().includes(lower) ||
            m.newParam.value.toString().toLowerCase().includes(lower) ||
            m.oldParam.group.toLowerCase().includes(lower)
        );
    }, [filteredDiff, modifiedSearchText]);

    // 为 MIIT 模式构建统一的对比视图数据 - 必须在条件返回之前
    const miitComparisonData = useMemo(() => {
        if (compareMode !== 'miit' || !filteredDiff || !targetFile) return [];
        
        const { added, modified, unchanged } = filteredDiff;
        
        // 构建统一数据结构
        const rows: Array<{
            key: string;
            status: 'matched' | 'modified' | 'missing';
            targetName: string;
            targetValue: string;
            baseName: string;
            baseValue: string;
        }> = [];

        // 添加匹配且值相同的记录
        unchanged.forEach((p, i) => {
            rows.push({
                key: `unchanged-${i}`,
                status: 'matched',
                targetName: p.name,
                targetValue: p.value.toString(),
                baseName: p.name,
                baseValue: p.value.toString(),
            });
        });

        // 添加变更记录（匹配但值不同）
        modified.forEach((m, i) => {
            rows.push({
                key: `modified-${i}`,
                status: 'modified',
                targetName: m.newParam.name,
                targetValue: m.newParam.value.toString(),
                baseName: m.oldParam.name,
                baseValue: m.oldParam.value.toString(),
            });
        });

        // 添加缺失记录（目标有，基准无）
        added.forEach((p, i) => {
            rows.push({
                key: `missing-${i}`,
                status: 'missing',
                targetName: p.name,
                targetValue: p.value.toString(),
                baseName: '-',
                baseValue: '-',
            });
        });

        return rows;
    }, [compareMode, filteredDiff, targetFile]);

    // Filter MIIT Data based on search
    const filteredMiitData = useMemo(() => {
        if (!miitSearchText) return miitComparisonData;
        const lower = miitSearchText.toLowerCase();
        return miitComparisonData.filter(item => 
            item.targetName.toLowerCase().includes(lower) ||
            item.targetValue.toLowerCase().includes(lower) ||
            item.baseName.toLowerCase().includes(lower) ||
            item.baseValue.toLowerCase().includes(lower)
        );
    }, [miitComparisonData, miitSearchText]);

    // 报告导出：自包含 HTML / Markdown
    const handleExportReport = async (format: ReportFormat) => {
        if (!diffResult || !baseFile || !targetFile) {
            message.warning('暂无对比结果可导出');
            return;
        }

        const hide = message.loading('正在生成报告...', 0);
        try {
            const fileName = await exportDiffReport(format, {
                result: diffResult,
                baseFileName: baseFile.fileName,
                targetFileName: targetFile.fileName,
                modeLabel: compareMode === 'miit' ? '仅公告号数据对比' : undefined,
            });
            hide();
            message.success(`报告已导出：${fileName}`);
        } catch (e) {
            hide();
            console.error('Report export failed:', e);
            message.error('报告导出失败：' + (e as Error).message);
        }
    };


    if (!diffResult || !filteredDiff) return null;

    const { added, removed, modified } = filteredDiff;

    // Columns for Modified (Custom view needed to show Old vs New)
    const modifiedColumns = [
        {
            title: '产品 / 适用车型',
            dataIndex: ['oldParam', 'productName'],
            key: 'productName',
            width: 150,
            render: (text: string) => <Tag color="default">{text || '通用'}</Tag>
        },
        {
            title: '分组',
            dataIndex: ['oldParam', 'group'],
            key: 'group',
            width: 120,
            render: (text: string) => <Tag>{text}</Tag>
        },
        {
            title: '字段名 (基准文件)',
            dataIndex: ['oldParam', 'name'],
            key: 'oldName',
            width: 180,
            render: (text: string) => <Text>{text}</Text>
        },
        {
            title: '字段名 (新版本)',
            dataIndex: ['newParam', 'name'],
            key: 'newName',
            width: 180,
            render: (text: string, record: { oldParam: { name: string }, newParam: { name: string } }) => {
                const isDifferent = record.oldParam.name !== record.newParam.name;
                return isDifferent ? <Text type="warning">{text}</Text> : <Text type="secondary">{text}</Text>;
            }
        },
        {
            title: '是否必填',
            key: 'isRequired',
            width: 80,
            render: (_: unknown, record: { oldParam: { name: string }, newParam: { name: string } }) => {
                const required = isFieldRequired(record.oldParam.name) || isFieldRequired(record.newParam.name);
                return required ? <Tag color="warning">必填</Tag> : <Tag color="default">选填</Tag>;
            },
            filters: [
                { text: '必填', value: true },
                { text: '选填', value: false },
            ],
            onFilter: (value: unknown, record: { oldParam: { name: string }, newParam: { name: string } }) => {
                const required = isFieldRequired(record.oldParam.name) || isFieldRequired(record.newParam.name);
                return required === value;
            },
        },
        {
            title: '基准值',
            dataIndex: ['oldParam', 'value'],
            key: 'oldValue',
            render: (text: string) => <Text delete type="secondary">{text}</Text>
        },
        {
            title: '新版本值',
            dataIndex: ['newParam', 'value'],
            key: 'newValue',
            render: (text: string) => <Text strong type="success">{text}</Text>
        },
    ];

    // MIIT 模式专用列定义
    const miitColumns = [
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 80,
            render: (status: string) => {
                const config = {
                    matched: { color: 'green', text: '一致' },
                    modified: { color: 'orange', text: '差异' },
                    missing: { color: 'red', text: '缺失' },
                };
                const c = config[status as keyof typeof config];
                return <Tag color={c?.color}>{c?.text}</Tag>;
            },
            filters: [
                { text: '一致', value: 'matched' },
                { text: '差异', value: 'modified' },
                { text: '缺失', value: 'missing' },
            ],
            onFilter: (value: unknown, record: { status: string }) => record.status === value,
        },
        {
            title: '公告字段名',
            dataIndex: 'targetName',
            key: 'targetName',
            width: 180,
        },
        {
            title: '公告值',
            dataIndex: 'targetValue',
            key: 'targetValue',
            ellipsis: true,
        },
        {
            title: '基准文件字段名',
            dataIndex: 'baseName',
            key: 'baseName',
            width: 180,
            render: (text: string, record: { status: string; baseName: string; targetName: string }) => {
                if (record.status === 'missing') return <Text type="secondary">-</Text>;
                const isDifferent = record.baseName !== record.targetName;
                return isDifferent ? <Text type="warning">{text}</Text> : <Text>{text}</Text>;
            }
        },
        {
            title: '基准文件值',
            dataIndex: 'baseValue',
            key: 'baseValue',
            ellipsis: true,
            render: (text: string, record: { status: string }) => {
                if (record.status === 'missing') return <Text type="secondary">-</Text>;
                if (record.status === 'modified') return <Text delete type="danger">{text}</Text>;
                return <Text>{text}</Text>;
            }
        },
        {
            title: '是否必填',
            key: 'isRequired',
            width: 80,
            render: (_: unknown, record: { targetName: string; baseName: string }) => {
                const required = isFieldRequired(record.targetName) || isFieldRequired(record.baseName);
                return required ? <Tag color="warning">必填</Tag> : <Tag color="default">选填</Tag>;
            },
            filters: [
                { text: '必填', value: true },
                { text: '选填', value: false },
            ],
            onFilter: (value: unknown, record: { targetName: string; baseName: string }) => {
                const required = isFieldRequired(record.targetName) || isFieldRequired(record.baseName);
                return required === value;
            },
        },
    ];

    const items = [
        {
            key: 'all',
            label: '全部差异概览',
            children: (
                <div className="space-y-8">
                    {/* Modified List */}
                    {modified.length > 0 && (
                        <div>
                            <h4 className="text-warning mb-2 font-bold flex items-center gap-2">
                                <Badge status="warning" /> 变更 ({modified.length})
                            </h4>
                            <div className="mb-4">
                                <SearchInput
                                    width="lg"
                                    placeholder="搜索字段名、值或分组"
                                    value={modifiedSearchText}
                                    onChange={setModifiedSearchText}
                                />
                            </div>
                            <Table
                                dataSource={filteredModified}
                                columns={modifiedColumns}
                                rowKey="id"
                                pagination={pagePagination()}
                                size="small"
                            />
                        </div>
                    )}

                    {/* Added Table (Pivot View) */}
                    {added.length > 0 && (
                        <div>
                            <h4 className="text-success mb-2 font-bold flex items-center gap-2">
                                <Badge status="success" /> {compareMode === 'miit' ? '缺失' : '新增'} ({added.length})
                            </h4>
                            <ParametersTable data={added} />
                        </div>
                    )}

                    {/* Removed Table (Pivot View) */}
                    {removed.length > 0 && (
                        <div>
                            <h4 className="text-danger mb-2 font-bold flex items-center gap-2">
                                <Badge status="error" /> 移除 ({removed.length})
                            </h4>
                            <ParametersTable data={removed} />
                        </div>
                    )}
                </div>
            )
        },
        {
            key: 'modified',
            label: `变更 (${modified.length})`,
            children: (
                <div>
                    <div className="mb-4">
                        <SearchInput
                            width="lg"
                            placeholder="搜索字段名、值或分组"
                            value={modifiedSearchText}
                            onChange={setModifiedSearchText}
                        />
                    </div>
                    <Table
                        dataSource={filteredModified}
                        columns={modifiedColumns}
                        rowKey="id"
                        pagination={pagePagination()}
                        size="small"
                        rowClassName={(record) => {
                             const isRequired = isFieldRequired(record.oldParam.name) || isFieldRequired(record.newParam.name);
                             return isRequired ? 'required-row' : '';
                        }}
                    />
                </div>
            )
        },
        {
            key: 'added',
            label: compareMode === 'miit' ? `缺失 (${added.length})` : `新增 (${added.length})`,
            children: <ParametersTable data={added} />
        },
        {
            key: 'removed',
            label: `移除 (${removed.length})`,
            children: <ParametersTable data={removed} />
        }
    ];

    // MIIT 模式专用视图
    const miitView = (
        <div>
           <div className="mb-4">
                <SearchInput
                    width="lg"
                    placeholder="搜索公告字段名、值"
                    value={miitSearchText}
                    onChange={setMiitSearchText}
                />
            </div>
            <div className="mb-4 flex items-center gap-4">
                <Tag color="success">一致: {miitComparisonData.filter(r => r.status === 'matched').length}</Tag>
                <Tag color="warning">差异: {miitComparisonData.filter(r => r.status === 'modified').length}</Tag>
                <Tag color="error">缺失: {miitComparisonData.filter(r => r.status === 'missing').length}</Tag>
            </div>
            <Table
                dataSource={filteredMiitData}
                columns={miitColumns}
                rowKey="key"
                pagination={pagePagination()}
                size="small"
                rowClassName={(record) => {
                    const isRequired = isFieldRequired(record.targetName) || isFieldRequired(record.baseName);
                    
                    let className = '';
                    if (record.status === 'matched') className += 'bg-success-weak ';
                    if (record.status === 'modified') className += 'bg-warning-weak ';
                    if (record.status === 'missing') className += 'bg-danger-weak ';
                    
                    if (isRequired) {
                        className += 'required-row ';
                    }
                    
                    return className;
                }}
            />
        </div>
    );

    return (
        <ListToolbar
            title={<span className="font-semibold text-1">比对统计</span>}
            actions={
                /* §5.1：导出是本页的产出动作，primary 位置留它；
                   报表入口唯一一个（此前统计卡里还有一个，已合并到此） */
                <ReportExportDropdown onExport={handleExportReport} />
            }
            filters={
                <>
                    {/* 视图切换统一用 Segmented（规范禁 Radio.Group optionType=button）；
                        单项禁用由 Segmented 的 options[].disabled 支持 */}
                    <FilterItem label="对比模式">
                        <Segmented
                            value={compareMode}
                            onChange={v => setCompareMode(v as CompareMode)}
                            size="small"
                            options={[
                                { label: '按内容对比', value: 'content' },
                                {
                                    label: '仅公告号数据对比',
                                    value: 'miit',
                                    disabled: !isMiitModeAvailable,
                                    tooltip: !isMiitModeAvailable ? '仅当目标文件来自公告号查询时可用' : undefined,
                                },
                            ]}
                        />
                    </FilterItem>

                    {allSheets.length > 0 && (
                        <FilterItem label="按工作表筛选">
                            <Select
                                value={selectedSheet}
                                onChange={setSelectedSheet}
                                style={{ width: 220 }}
                                size="small"
                                options={[
                                    { label: '全部工作表 (All Sheets)', value: 'all' },
                                    ...allSheets.map(s => ({ label: s, value: s })),
                                ]}
                            />
                        </FilterItem>
                    )}
                </>
            }
            padded={false}
        >
            {/* 统计数字条：四态计数 + 对比文件（原先塞在统计卡里，现独立成带 */}
            <div className="px-3 py-2 bg-brand-weak flex flex-wrap items-center gap-x-4 gap-y-2">
                {stats.map(s => (
                    <span key={s.label} className="text-2" style={{ fontSize: 'var(--fs-aux)' }}>
                        {s.label}
                        <Tag color={s.color} className="ml-1.5 mr-0 px-2 rounded tabular-nums">{s.value}</Tag>
                    </span>
                ))}
                <span className="ml-auto text-3 font-mono" style={{ fontSize: 'var(--fs-aux)' }}>
                    {baseFile?.fileName} vs {targetFile?.fileName}
                </span>
            </div>

            <div className="p-3">
                {compareMode === 'miit' ? miitView : <Tabs defaultActiveKey="all" items={items} />}
            </div>
        </ListToolbar>
    );
};

export default DiffResultView;
