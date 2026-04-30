import React, { useState, useMemo, useEffect } from 'react';
import { Card, Input, Button, Table, message, Empty, Space, Upload, Spin, Select, Alert } from 'antd';
import { DownloadOutlined, ClearOutlined, UploadOutlined } from '@ant-design/icons';
import { getFieldGroupsSync } from '../../utils/fieldLists';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { findBestMatch } from '../../utils/matchingEngine';
import type { MatchResult } from '../../utils/matchingEngine';
import ProductSourceSelector from './ProductSourceSelector';
import * as XLSX from 'xlsx';
import { downloadCsv } from '../../utils/downloadCsv';
import { buildRepairContext, getAssetBackedSourceFile } from './quickRepair';
import RepairableValue from '../common/RepairableValue';
import { getVehicleSelectionStates } from '../../utils/vehicleSelectionState';


const { TextArea } = Input;


interface OrganizedRow {
    key: string;
    targetField: string;
    /** 每个车型的匹配结果（包含 matchType 和 alternatives） */
    _matches: Map<string, MatchResult>;
    [productName: string]: string | number | undefined | Map<string, MatchResult>;
}

interface MultiVehicleViewProps {
    onGoRepair?: () => void;
}

const MultiVehicleView: React.FC<MultiVehicleViewProps> = ({ onGoRepair }) => {
    const { 
        uploadedFiles, 
        assetFiles,
        multiVehicleFields: targetFields,
        setMultiVehicleFields: setTargetFields,
        activeAssets,
        localSelection,
        setLocalSelection,
        setPurifyProduct,
        setRepairContext,
        fieldGroupsVersion,
    } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        assetFiles: state.assetFiles,
        multiVehicleFields: state.multiVehicleFields,
        setMultiVehicleFields: state.setMultiVehicleFields,
        activeAssets: state.activeAssets,
        localSelection: state.currentMultiVehicleProducts,
        setLocalSelection: state.setMultiVehicleProducts,
        setPurifyProduct: state.setPurifyProduct,
        setRepairContext: state.setRepairContext,
        fieldGroupsVersion: state.fieldGroupsVersion,
    })));
    const [organizedData, setOrganizedData] = useState<OrganizedRow[]>([]);
    const [isCalculating, setIsCalculating] = useState(false);
    const [selectedFieldGroupId, setSelectedFieldGroupId] = useState<string | undefined>(undefined);
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
        localSelection.forEach(productName => {
            const sourceFile = getAssetBackedSourceFile(assetFiles, productName);
            if (sourceFile) map.set(productName, sourceFile);
        });
        return map;
    }, [assetFiles, localSelection]);

    // Prepare Vehicle Data Cache
    const selectedVehicles = useMemo(() => {
        const vehicles: {
            name: string;
            params: Map<string, string | number>;
            candidates: { id: string; group: string; name: string; value: string | number }[];
        }[] = [];
        
        localSelection.forEach(productName => {
            const selectionState = selectionStates.get(productName);
            const data = selectionState?.data || [];
            if (selectionState?.status === 'ready' && data.length > 0) {
                const productParams = new Map<string, string | number>();
                data.forEach(p => productParams.set(p.name, p.value));
                const candidates = Array.from(productParams.entries()).map(([k, v]) => ({
                    id: k,
                    group: 'default',
                    name: k,
                    value: v
                }));
                vehicles.push({ name: productName, params: productParams, candidates });
            }
        });
        
        return vehicles;
    }, [localSelection, selectionStates]);

    // UX: Debounce triggering automatically
    useEffect(() => {
        if (selectedVehicles.length === 0 || !targetFields.trim()) {
            if (organizedData.length > 0) setOrganizedData([]);
            return;
        }

        const fields = targetFields
            .split(/\n+/)
            .flatMap(line => {
                const trimmed = line.trim();
                if (!trimmed) return [];
                // 如果行内有括号包裹的逗号（如 "交流充电时间（常温,SOC:20%-100%）"），
                // 则整行作为一个字段，不按逗号拆分
                if (/[（(][^)）]*[,，][^)）]*[）)]/.test(trimmed)) {
                    return [trimmed];
                }
                // 否则按逗号拆分（兼容旧版逗号分隔输入）
                return trimmed.split(/[,，]+/).map(s => s.trim()).filter(Boolean);
            })
            .filter(Boolean);
        
        if (fields.length === 0) {
            if (organizedData.length > 0) setOrganizedData([]);
            setIsCalculating(false);
            return;
        }

        setIsCalculating(true);
        const timer = setTimeout(() => {
            try {
                const results: OrganizedRow[] = fields.map((targetField, idx) => {
                    const row: OrganizedRow = {
                        key: `${idx}`,
                        targetField,
                        _matches: new Map(),
                    };

                    for (const vehicle of selectedVehicles) {
                         const matchResult = findBestMatch(targetField, vehicle.candidates, 0.3);
                         row._matches.set(vehicle.name, matchResult);

                         // 精确/别名匹配：自动填入值
                         // 模糊匹配：不自动填入，由用户在下拉框中手动选择
                         if (matchResult.matchType === 'exact' ||
                             matchResult.matchType === 'normalized' ||
                             matchResult.matchType === 'alias') {
                             row[vehicle.name] = matchResult.matchedParam?.value;
                         } else {
                             row[vehicle.name] = undefined;
                         }
                    }
                    return row;
                });

                setOrganizedData(results);
            } catch (err) {
                console.error('Organization error:', err);
            } finally {
                setIsCalculating(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [targetFields, selectedVehicles]);

    const handleDownload = async () => {
        if (organizedData.length === 0) return;

        // Headers: 字段名, Car1, Car2...
        const headers = ['字段名', ...selectedVehicles.map(v => v.name)];
        const rows = organizedData.map(row => {
            return [
                row.targetField,
                ...selectedVehicles.map(v => {
                    const val = row[v.name];
                    // 如果是用户手动选择的（string/number），直接返回
                    if (val !== undefined && val !== null) return val;
                    // 否则尝试从精确匹配结果中获取
                    const mr = row._matches?.get(v.name);
                    if (mr && mr.matchType !== 'fuzzy' && mr.matchType !== 'none' && mr.matchedParam) {
                        return mr.matchedParam.value;
                    }
                    return '';
                })
            ];
        });

        const data = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const csvOutput = XLSX.utils.sheet_to_csv(ws);
        
        await downloadCsv(csvOutput, '多车型参数整理.csv');
    };

    const fieldGroupOptions = useMemo(
        () => getFieldGroupsSync().map((group) => ({ value: group.id, label: group.name })),
        [fieldGroupsVersion]
    );

    const handleApplyFieldGroup = (groupId: string) => {
        const group = getFieldGroupsSync().find((item) => item.id === groupId);
        if (!group) return;
        setSelectedFieldGroupId(groupId);
        setTargetFields(group.fields.join('\n'));
        message.success(`已导入字段组：${group.name}（${group.fields.length} 项）`);
    };

    // Table Columns
    const columns = [
        {
            title: '目标字段',
            dataIndex: 'targetField',
            key: 'targetField',
            fixed: 'left' as const,
            width: 150,
            render: (text: string) => <b>{text}</b>
        },
        ...selectedVehicles.map(v => ({
            title: v.name,
            dataIndex: v.name,
            key: v.name,
            width: 200,
            render: (text: string | number | undefined, record: OrganizedRow) => {
                const matchResult = record._matches?.get(v.name);
                const sourceFileName = assetSourceByProduct.get(v.name);

                // 模糊匹配 → 下拉选择框，不自动填入
                if (matchResult?.matchType === 'fuzzy') {
                    const fuzzyOptions: { value: string; label: string }[] = [];
                    // 最优匹配也加入选项
                    if (matchResult.matchedParam) {
                        fuzzyOptions.push({
                            value: String(matchResult.matchedParam.value),
                            label: `⭐ ${matchResult.matchedParam.name} = ${matchResult.matchedParam.value}`,
                        });
                    }
                    (matchResult.alternatives || []).forEach(alt => {
                        fuzzyOptions.push({
                            value: String(alt.value),
                            label: `${alt.name} = ${alt.value}`,
                        });
                    });
                    return (
                        <Select
                            size="small"
                            style={{ width: '100%' }}
                            placeholder="请选择匹配字段…"
                            allowClear
                            value={text !== undefined ? String(text) : undefined}
                            onChange={val => {
                                setOrganizedData(prev =>
                                    prev.map(row =>
                                        row.key === record.key
                                            ? { ...row, [v.name]: val || undefined }
                                            : row
                                    )
                                );
                            }}
                            options={fuzzyOptions.length > 0 ? fuzzyOptions : undefined}
                            notFoundContent="无相似字段"
                        />
                    );
                }

                // 精确/别名匹配 → 值 + 绿色标签
                if (matchResult && matchResult.matchType !== 'none' && text !== undefined) {
                    return (
                        <span>
                            <Tag color="green" style={{ marginRight: 4, fontSize: 10, lineHeight: '16px' }}>精确</Tag>
                            {text}
                        </span>
                    );
                }

                // 无匹配
                if (!text) {
                    return sourceFileName ? (
                        <RepairableValue
                            value={<span className="text-gray-300">-</span>}
                            repairable={true}
                            hint="点击修复源数据"
                            onRepair={() => {
                                setRepairContext(buildRepairContext('multi_vehicle', v.name, sourceFileName, 'empty', record.targetField));
                                setPurifyProduct(v.name);
                                onGoRepair?.();
                            }}
                        />
                    ) : <span className="text-gray-300">-</span>;
                }
                return text;
            }
        }))
    ];

    return (
        <div className="flex flex-col gap-3 h-full">
            {pendingSelectionCount > 0 && (
                <Alert
                    type="info"
                    showIcon
                    message={`正在同步 ${pendingSelectionCount} 款待整理车型数据，完成后会自动参与整理`}
                />
            )}
            <Card className="shadow-sm flex-shrink-0" size="small">
                <Space direction="vertical" className="w-full">
                    <div className="flex items-start gap-4">
                        <div className="flex-[2]">
                            <div className="mb-2 font-medium flex items-center gap-3">
                                1. 目标字段列表 (支持逗号、换行分隔)
                                <a 
                                    className="text-xs font-normal text-blue-500" 
                                    onClick={() => setTargetFields("整备质量, 最高车速, 轴距, 外形尺寸长, 发动机型号")}
                                >
                                    填入示例
                                </a>
                                <Select
                                    size="small"
                                    value={selectedFieldGroupId}
                                    onChange={handleApplyFieldGroup}
                                    options={fieldGroupOptions}
                                    placeholder="字段配置组"
                                    allowClear
                                    className="min-w-[180px]"
                                />
                                <Upload
                                    accept=".xlsx,.xls,.csv"
                                    showUploadList={false}
                                    beforeUpload={async (file) => {
                                        try {
                                            const buffer = await file.arrayBuffer();
                                            const workbook = XLSX.read(buffer, { type: 'array' });
                                            const sheet = workbook.Sheets[workbook.SheetNames[0]];
                                            const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                                            if (rows.length < 2) { message.error('文件为空'); return false; }
                                            const headers = rows[0];
                                            let nameIdx = headers.findIndex(h => h && typeof h === 'string' && 
                                                (h.includes('名称') || h.includes('参数') || h.includes('字段') || h.includes('项目')));
                                            if (nameIdx === -1) nameIdx = 0;
                                            const fields = rows.slice(1).map(r => r[nameIdx] ? String(r[nameIdx]).trim() : '').filter(Boolean);
                                            if (fields.length === 0) { message.error('未提取到字段名'); return false; }
                                            setTargetFields(fields.join('\n'));
                                            message.success(`已导入 ${fields.length} 个目标字段`);
                                        } catch (err) { message.error(`导入失败: ${(err as Error).message}`); }
                                        return false;
                                    }}
                                >
                                    <a className="text-xs font-normal text-blue-500"><UploadOutlined /> 从文件导入</a>
                                </Upload>
                            </div>
                            <TextArea 
                                rows={3} 
                                value={targetFields}
                                onChange={e => setTargetFields(e.target.value)}
                                placeholder="例如：整备质量, 最高车速, 轴距..." 
                            />
                        </div>
                        <div className="flex-1">
                            <div className="mb-2 font-medium">2. 已选待整理车型 ({localSelection.length})</div>
                            <ProductSourceSelector 
                                value={localSelection}
                                onChange={setLocalSelection}
                                placeholder="选择要整理的车型"
                            />
                        </div>
                        <div className="flex flex-col gap-2 mt-8">
                            <Button icon={<ClearOutlined />} onClick={() => { setOrganizedData([]); setTargetFields(''); }}>
                                清空内容
                            </Button>
                        </div>
                    </div>
                </Space>
            </Card>

            <div className="flex-1 overflow-hidden border border-gray-200 rounded relative bg-white dark:bg-gray-900" style={{ minHeight: 400 }}>
                <Spin spinning={isCalculating} tip="正在智能解析字段...">
                    <div className="h-full flex flex-col p-3">
                        {organizedData.length > 0 || isCalculating ? (
                            <>
                                <div className="mb-3 flex justify-between items-center">
                                    <h3 className="font-bold">整理结果</h3>
                                    <Button icon={<DownloadOutlined />} onClick={handleDownload} disabled={isCalculating}>导出 CSV</Button>
                                </div>
                                <Table 
                                    columns={columns}
                                    dataSource={organizedData}
                                    rowKey="key"
                                    className="custom-organized-table"
                                    pagination={{
                                        pageSize: 20,
                                        showSizeChanger: true,
                                        size: 'small'
                                    }}
                                    scroll={{ 
                                        y: 'calc(100vh - 460px)',
                                        x: 'max-content'
                                    }}
                                    size="small"
                                    bordered
                                    locale={{
                                        emptyText: isCalculating ? <div style={{ height: 100 }} /> : <Empty description="暂无整理结果" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                    }}
                                />
                            </>
                        ) : (
                            <Empty description="暂无整理结果" className="mt-10" />
                        )}
                    </div>
                </Spin>
            </div>
        </div>
    );
};

export default MultiVehicleView;
