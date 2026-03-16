import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Card, Button, Empty, Table, Tag, Alert, Space, Input, Segmented, message, Select } from 'antd';
import { DiffOutlined, InfoCircleOutlined, SearchOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { getProductData } from '../../store/vehicleSelectors';
import ProductSourceSelector from './ProductSourceSelector';
import { isFieldRequired } from '../../assets/requiredFields';
import { buildRepairContext, getAssetBackedSourceFile } from './quickRepair';
import RepairableValue from '../common/RepairableValue';
import { getFieldGroupsSync } from '../../utils/fieldLists';
import { buildVehicleOptionLabel, getVehicleProductName } from '../../utils/vehicleInstance';

interface CompareViewProps {
    onGoRepair?: () => void;
}

const CompareView: React.FC<CompareViewProps> = ({ onGoRepair }) => {
    const { uploadedFiles, assetFiles, selectedProductNames, localSelection, setLocalSelection, setPurifyProduct, setRepairContext, fieldGroupsVersion } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        assetFiles: state.assetFiles,
        selectedProductNames: state.selectedProductNames,
        localSelection: state.currentCompareProducts,
        setLocalSelection: state.setCompareProducts,
        setPurifyProduct: state.setPurifyProduct,
        setRepairContext: state.setRepairContext,
        fieldGroupsVersion: state.fieldGroupsVersion,
    })));
    const [showResult, setShowResult] = useState(false);
    // 过滤状态
    const [diffFilter, setDiffFilter] = useState<'all' | 'diff' | 'same' | 'required'>('all');
    const [searchText, setSearchText] = useState('');
    const [fieldGroupFilter, setFieldGroupFilter] = useState<string>('all');
    const reportRef = useRef<HTMLDivElement>(null);

    // 默认填充：当本模块尚未选择车型时，自动从大纲中填充
    useEffect(() => {
        if (localSelection.length === 0 && selectedProductNames.length > 0) {
            setLocalSelection(selectedProductNames.length <= 5 ? [...selectedProductNames] : [selectedProductNames[0]]);
        }
    }, [selectedProductNames]);

    // 自动显示对比结果的逻辑
    useEffect(() => {
        if (localSelection.length > 0 && !showResult) {
            setShowResult(true);
        } else if (localSelection.length === 0 && showResult) {
            setShowResult(false);
        }
    }, [localSelection.length]);

    // Build comparison matrix (supports 1+ products)
    const comparisonData = useMemo(() => {
        if (localSelection.length < 1 || !showResult) return [];

        const allParams = new Map<string, { groups: Set<string>; name: string; values: Map<string, string> }>();

        localSelection.forEach(instanceKey => {
            const data = getProductData(uploadedFiles, instanceKey, assetFiles);
            data.forEach(p => {
                const key = p.name;
                if (!allParams.has(key)) {
                    allParams.set(key, {
                        groups: new Set(),
                        name: p.name,
                        values: new Map()
                    });
                }
                const entry = allParams.get(key)!;
                if (p.group) entry.groups.add(p.group);
                entry.values.set(instanceKey, String(p.value ?? ''));
            });
        });

        return Array.from(allParams.entries()).map(([key, param]) => {
            const values = Array.from(param.values.values());
            const allSame = values.every(v => v === values[0]);
            
            return {
                key,
                group: Array.from(param.groups).join(', ') || '未分组',
                name: param.name,
                hasDiff: localSelection.length > 1 ? !allSame : false,
                ...Object.fromEntries(param.values)
            };
        });
    }, [localSelection, showResult, uploadedFiles]);

    // 过滤后的数据
    const filteredData = useMemo(() => {
        let data = comparisonData;
        const fieldGroup = getFieldGroupsSync().find((group) => group.id === fieldGroupFilter);

        if (fieldGroup) {
            const fieldSet = new Set(fieldGroup.fields);
            data = data.filter((row) => fieldSet.has(row.name));
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
    }, [comparisonData, diffFilter, searchText, localSelection, fieldGroupFilter, fieldGroupsVersion]);

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

    const triggerRepair = (instanceKey: string, fieldName: string) => {
        const sourceFileName = assetSourceByProduct.get(instanceKey);
        if (!sourceFileName) return;

        setRepairContext(buildRepairContext('compare', instanceKey, sourceFileName, 'diff', fieldName));
        setPurifyProduct(instanceKey);
        onGoRepair?.();
    };

    // Dynamic columns
    const columns = useMemo(() => {
        const dynamicCols: any[] = [
            {
                title: '分组',
                dataIndex: 'group',
                key: 'group',
                width: 100,
                fixed: 'left',
                render: (text: string) => <Tag color="blue">{text}</Tag>,
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
                    isFieldRequired(record.name) ? <Tag color="orange">是</Tag> : <span className="text-gray-400">-</span>,
            }
        ];

        localSelection.forEach(instanceKey => {
            dynamicCols.push({
                title: buildVehicleOptionLabel(instanceKey),
                dataIndex: instanceKey,
                key: instanceKey,
                width: 180,
                fixed: undefined,
                render: (text: string, record: { hasDiff: boolean }) => {
                    const isRepairable = assetSourceByProduct.has(instanceKey);
                    if (!text) return <span className="text-gray-300">-</span>;
                    if (record.hasDiff) {
                        return (
                            <RepairableValue
                                value={<span className="bg-yellow-100 px-1 rounded">{text}</span>}
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
    }, [localSelection]);

    const { diffCount, sameCount, requiredCount } = useMemo(() => {
        let diff = 0, same = 0, req = 0;
        comparisonData.forEach(r => {
            if (r.hasDiff) diff++; else same++;
            if (isFieldRequired(r.name)) req++;
        });
        return { diffCount: diff, sameCount: same, requiredCount: req };
    }, [comparisonData]);

    // 4. UX 提升: 版本对比自动切换“只看差异”
    useEffect(() => {
        if (localSelection.length > 1 && diffCount > 0) {
            setDiffFilter('diff');
        } else {
            setDiffFilter('all');
        }
    }, [localSelection.join(','), diffCount]);

    // PDF 导出（html2canvas 截图方案，支持中文）
    const handleExportPdf = async () => {
        if (comparisonData.length === 0) { message.warning('暂无对比数据'); return; }

        const hide = message.loading('正在生成 PDF...', 0);
        try {
            const { default: html2canvas } = await import('html2canvas');
            const { default: jsPDF } = await import('jspdf');

            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const diffItems = comparisonData.filter(r => r.hasDiff);
            const sameItems = comparisonData.filter(r => !r.hasDiff);

            const productHeaders = localSelection.map(n => `<th style="padding:8px 10px;border:1px solid #d9d9d9;background:#e6f4ff;font-size:12px;max-width:160px;word-break:break-all;">${buildVehicleOptionLabel(n)}</th>`).join('');

            const renderRows = (items: typeof comparisonData) => items.map(r => {
                const cells = localSelection.map(p => {
                    const val = (r as Record<string, unknown>)[p] || '-';
                    const bg = r.hasDiff ? '#fffbe6' : '#ffffff';
                    return `<td style="padding:6px 8px;border:1px solid #d9d9d9;font-size:11px;background:${bg}">${val}</td>`;
                }).join('');
                return `<tr><td style="padding:6px 8px;border:1px solid #d9d9d9;font-size:11px;background:#fafafa">${r.group}</td><td style="padding:6px 8px;border:1px solid #d9d9d9;font-size:11px;font-weight:500">${r.name}</td>${cells}</tr>`;
            }).join('');

            const reportHtml = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB',sans-serif;padding:30px;background:#fff;width:1000px;">
  <h2 style="text-align:center;margin:0 0 6px;font-size:20px;color:#1a1a1a;">车型参数对比分析报告</h2>
  <p style="text-align:center;color:#999;font-size:12px;margin:0 0 20px;">生成时间：${dateStr} &nbsp;|&nbsp; 对比车型：${localSelection.map(buildVehicleOptionLabel).join(' vs ')}</p>
  <div style="display:flex;gap:16px;margin-bottom:24px;">
    <div style="flex:1;padding:14px;background:#fff7e6;border-radius:8px;border:1px solid #ffd591;text-align:center;">
      <div style="font-size:28px;font-weight:bold;color:#fa8c16;">${diffItems.length}</div>
      <div style="font-size:12px;color:#ad6800;margin-top:4px;">差异项</div>
    </div>
    <div style="flex:1;padding:14px;background:#f6ffed;border-radius:8px;border:1px solid #b7eb8f;text-align:center;">
      <div style="font-size:28px;font-weight:bold;color:#52c41a;">${sameItems.length}</div>
      <div style="font-size:12px;color:#389e0d;margin-top:4px;">一致项</div>
    </div>
    <div style="flex:1;padding:14px;background:#e6f7ff;border-radius:8px;border:1px solid #91d5ff;text-align:center;">
      <div style="font-size:28px;font-weight:bold;color:#1890ff;">${comparisonData.length}</div>
      <div style="font-size:12px;color:#096dd9;margin-top:4px;">总参数</div>
    </div>
  </div>
  ${diffItems.length > 0 ? `
  <h3 style="font-size:14px;color:#fa8c16;border-bottom:2px solid #ffd591;padding-bottom:6px;margin:0 0 10px;">⚠ 差异项 (${diffItems.length})</h3>
  <table style="border-collapse:collapse;width:100%;margin-bottom:24px;">
    <thead><tr><th style="padding:8px 10px;border:1px solid #d9d9d9;background:#fafafa;font-size:12px;">分组</th><th style="padding:8px 10px;border:1px solid #d9d9d9;background:#fafafa;font-size:12px;">参数名</th>${productHeaders}</tr></thead>
    <tbody>${renderRows(diffItems)}</tbody>
  </table>` : ''}
  <h3 style="font-size:14px;color:#52c41a;border-bottom:2px solid #b7eb8f;padding-bottom:6px;margin:0 0 10px;">✓ 一致项 (${sameItems.length})</h3>
  <table style="border-collapse:collapse;width:100%;">
    <thead><tr><th style="padding:8px 10px;border:1px solid #d9d9d9;background:#fafafa;font-size:12px;">分组</th><th style="padding:8px 10px;border:1px solid #d9d9d9;background:#fafafa;font-size:12px;">参数名</th>${productHeaders}</tr></thead>
    <tbody>${renderRows(sameItems)}</tbody>
  </table>
</div>`;

            // 创建临时容器
            const container = document.createElement('div');
            container.innerHTML = reportHtml;
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.top = '0';
            document.body.appendChild(container);

            // html2canvas 截图（降低缩放以减小体积）
            const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
                scale: 1.5,
                useCORS: true,
                backgroundColor: '#ffffff',
            });

            document.body.removeChild(container);

            // 分页裁剪，每页只嵌入对应区域（避免整图重复嵌入）
            const imgWidth = 277; // A4 landscape mm - margins
            const pageHeightMm = 190;
            const ratio = canvas.width / imgWidth;
            const pageHeightPx = pageHeightMm * ratio;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const totalPages = Math.ceil(canvas.height / pageHeightPx);

            for (let page = 0; page < totalPages; page++) {
                if (page > 0) doc.addPage();
                // 裁剪当前页区域
                const cropY = page * pageHeightPx;
                const cropH = Math.min(pageHeightPx, canvas.height - cropY);
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = canvas.width;
                pageCanvas.height = cropH;
                const ctx = pageCanvas.getContext('2d')!;
                ctx.drawImage(canvas, 0, cropY, canvas.width, cropH, 0, 0, canvas.width, cropH);
                const pageImg = pageCanvas.toDataURL('image/jpeg', 0.75);
                const pageImgH = (cropH * imgWidth) / canvas.width;
                doc.addImage(pageImg, 'JPEG', 10, 10, imgWidth, pageImgH);
            }

            doc.save(`车型参数对比报告_${localSelection.map(getVehicleProductName).join('_vs_')}_${now.toISOString().slice(0, 10)}.pdf`);
            hide();
            message.success('PDF 导出成功');

        } catch (e) {
            hide();
            console.error('PDF export failed:', e);
            message.error('PDF 导出失败: ' + (e as Error).message);
        }
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            {selectedProductNames.length === 0 && (
                <Alert
                    message="请先在左侧数据池中选择车型"
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                />
            )}
            
            {/* Selection Area - Unified UI */}
            <Card className="shadow-sm border-slate-200" size="small">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <DiffOutlined className="text-blue-500 text-lg" />
                            <h2 className="text-[15px] font-bold text-slate-800 m-0">选择对比车型</h2>
                            <Tag color="blue" className="ml-2 m-0 rounded-sm">已选 {localSelection.length} 款</Tag>
                        </div>
                        <Button 
                            type="primary" 
                            size="small"
                            icon={<FilePdfOutlined />} 
                            onClick={handleExportPdf}
                            disabled={localSelection.length === 0}
                            className="text-[12px] h-8"
                        >
                            导出 PDF 报告
                        </Button>
                    </div>

                    <ProductSourceSelector 
                        value={localSelection}
                        onChange={setLocalSelection}
                        placeholder="从已选车型中选择进行对比..."
                    />
                </div>
            </Card>

            {/* Results Area */}
            <div className="flex-1 overflow-auto bg-white rounded-lg border border-gray-200">
                {showResult && comparisonData.length > 0 ? (
                    <div className="p-3" ref={reportRef}>
                        {/* 统计 + 工具栏 */}
                        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-3">
                                <span className="text-gray-500 text-sm">共 {comparisonData.length} 项</span>
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
                                <Input
                                    placeholder="搜索参数名或值..."
                                    prefix={<SearchOutlined className="text-gray-400" />}
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
                            </div>
                            <Space>
                                <Tag color={diffFilter === 'diff' ? 'orange' : undefined}>显示: {filteredData.length} 条</Tag>
                                <Button
                                    icon={<FilePdfOutlined />}
                                    onClick={handleExportPdf}
                                    size="small"
                                >
                                    导出 PDF 报告
                                </Button>
                            </Space>
                        </div>
                        <Table
                            dataSource={filteredData}
                            columns={columns}
                            rowKey="key"
                            size="small"
                            scroll={{ x: 'max-content' }}
                            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
                            rowClassName={(record) => record.hasDiff ? 'bg-yellow-50' : ''}
                        />
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full min-h-[220px]">
                    <Empty description={localSelection.length < 1 ? "请选择至少1个车型" : "点击\"查看数据\"查看结果"} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default CompareView;
