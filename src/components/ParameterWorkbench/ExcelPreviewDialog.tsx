import React, { useState, useMemo, useCallback } from 'react';
import { Modal, Tabs, InputNumber, Select, Button, Tag, Tooltip, message } from 'antd';
import { CheckOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { SheetPreview, SheetParseConfig, ColumnRole } from '../../types';

interface Props {
    open: boolean;
    previews: SheetPreview[];
    fileName: string;
    onConfirm: (configs: SheetParseConfig[]) => void;
    onCancel: () => void;
}

interface ColumnConfig {
    role: ColumnRole;
    customName?: string;
}

const ROLE_OPTIONS: { value: ColumnRole; label: string; color: string }[] = [
    { value: 'skip', label: '跳过', color: 'default' },
    { value: 'name', label: '参数名', color: 'blue' },
    { value: 'group', label: '分组', color: 'green' },
    { value: 'product', label: '产品值', color: 'orange' },
];

const roleColor = (role: ColumnRole) => ROLE_OPTIONS.find(r => r.value === role)?.color || 'default';
const roleLabel = (role: ColumnRole) => ROLE_OPTIONS.find(r => r.value === role)?.label || '跳过';

const ExcelPreviewDialog: React.FC<Props> = ({ open, previews, fileName, onConfirm, onCancel }) => {
    const [activeSheet, setActiveSheet] = useState(0);
    const [sheetConfigs, setSheetConfigs] = useState<Map<string, {
        headerStart: number;
        headerEnd: number;
        dataStart: number;
        columns: Map<number, ColumnConfig>;
    }>>(new Map());

    const currentPreview = previews[activeSheet];
    
    // 获取/初始化当前 sheet 的配置
    const getConfig = useCallback((preview: SheetPreview) => {
        const existing = sheetConfigs.get(preview.sheetName);
        if (existing) return existing;
        // 默认值：第 0 行为表头，第 1 行开始是数据
        return { headerStart: 0, headerEnd: 0, dataStart: 1, columns: new Map<number, ColumnConfig>() };
    }, [sheetConfigs]);

    const config = currentPreview ? getConfig(currentPreview) : null;

    const updateConfig = useCallback((sheetName: string, updater: (prev: ReturnType<typeof getConfig>) => ReturnType<typeof getConfig>) => {
        setSheetConfigs(prev => {
            const next = new Map(prev);
            const current = next.get(sheetName) || { headerStart: 0, headerEnd: 0, dataStart: 1, columns: new Map<number, ColumnConfig>() };
            next.set(sheetName, updater(current));
            return next;
        });
    }, []);

    // 自动检测表头行和列角色
    const autoDetect = useCallback((preview: SheetPreview) => {
        const nameKeywords = ['参数项名称', '参数名', '名称', '功能项', '项目', '清单', '资料清单'];
        const groupKeywords = ['类别', '分组', '序号'];
        const skipKeywords = ['填写说明', '说明', '备注', '单位'];

        let headerRow = 0;
        const columns = new Map<number, ColumnConfig>();

        // 搜索前 10 行找表头
        for (let r = 0; r < Math.min(10, preview.rows.length); r++) {
            const row = preview.rows[r];
            const hasNameCol = row.some(cell => nameKeywords.some(kw => cell.includes(kw)));
            if (hasNameCol) {
                headerRow = r;
                break;
            }
        }

        // 检测列角色
        const headerRowData = preview.rows[headerRow] || [];
        let nameFound = false;

        headerRowData.forEach((cell, idx) => {
            const trimmed = cell.trim();
            if (!trimmed) {
                columns.set(idx, { role: 'skip' });
                return;
            }

            if (!nameFound && nameKeywords.some(kw => trimmed.includes(kw))) {
                columns.set(idx, { role: 'name' });
                nameFound = true;
            } else if (groupKeywords.some(kw => trimmed.includes(kw))) {
                columns.set(idx, { role: 'group' });
            } else if (skipKeywords.some(kw => trimmed.includes(kw))) {
                columns.set(idx, { role: 'skip' });
            } else if (nameFound) {
                // 参数名列右侧的非元数据列 → 产品值列
                columns.set(idx, { role: 'product', customName: trimmed });
            } else {
                columns.set(idx, { role: 'skip' });
            }
        });

        // 检查下一行是否有更好的产品名
        const nextRow = preview.rows[headerRow + 1];
        let isMultiRowHeader = false;
        if (nextRow) {
            columns.forEach((col, idx) => {
                if (col.role === 'product' && nextRow[idx]?.trim()) {
                    const nextVal = nextRow[idx].trim();
                    if (col.customName === '参数值' || col.customName === '数值') {
                        col.customName = nextVal;
                        isMultiRowHeader = true;
                    }
                }
            });
        }

        const headerEnd = isMultiRowHeader ? headerRow + 1 : headerRow;
        const dataStart = headerEnd + 1;

        updateConfig(preview.sheetName, () => ({
            headerStart: headerRow,
            headerEnd,
            dataStart,
            columns
        }));
    }, [updateConfig]);

    // 初始化时自动检测
    React.useEffect(() => {
        if (currentPreview && !sheetConfigs.has(currentPreview.sheetName)) {
            autoDetect(currentPreview);
        }
    }, [currentPreview, sheetConfigs, autoDetect]);

    // 设置列角色
    const setColumnRole = (colIdx: number, role: ColumnRole) => {
        if (!currentPreview) return;
        updateConfig(currentPreview.sheetName, prev => {
            const cols = new Map(prev.columns);
            // 参数名列只能有一个
            if (role === 'name') {
                cols.forEach((v, k) => { if (v.role === 'name') cols.set(k, { ...v, role: 'skip' }); });
            }
            const existing = cols.get(colIdx);
            cols.set(colIdx, { ...existing, role });
            return { ...prev, columns: cols };
        });
    };

    // 设置产品列的自定义名称
    const setProductName = (colIdx: number, name: string) => {
        if (!currentPreview) return;
        updateConfig(currentPreview.sheetName, prev => {
            const cols = new Map(prev.columns);
            cols.set(colIdx, { ...cols.get(colIdx), role: 'product' as ColumnRole, customName: name });
            return { ...prev, columns: cols };
        });
    };

    // 验证当前 sheet 配置是否完整
    const validation = useMemo(() => {
        if (!config) return { valid: false, message: '未选择 Sheet' };
        let hasName = false;
        let hasProduct = false;
        config.columns.forEach(col => {
            if (col.role === 'name') hasName = true;
            if (col.role === 'product') hasProduct = true;
        });
        if (!hasName) return { valid: false, message: '需要指定至少一个「参数名」列' };
        if (!hasProduct) return { valid: false, message: '需要指定至少一个「产品值」列' };
        return { valid: true, message: '' };
    }, [config]);

    // 构建并提交配置
    const handleConfirm = () => {
        // 收集所有已配置的 sheet
        const configs: SheetParseConfig[] = [];
        
        sheetConfigs.forEach((cfg, sheetName) => {
            let nameColIndex = -1;
            let groupColIndex = -1;
            const productColumns: { index: number; name: string }[] = [];

            cfg.columns.forEach((col, idx) => {
                if (col.role === 'name') nameColIndex = idx;
                if (col.role === 'group') groupColIndex = idx;
                if (col.role === 'product') {
                    productColumns.push({ index: idx, name: col.customName || `列${idx + 1}` });
                }
            });

            if (nameColIndex >= 0 && productColumns.length > 0) {
                const headerRows: number[] = [];
                for (let r = cfg.headerStart; r <= cfg.headerEnd; r++) headerRows.push(r);
                
                configs.push({
                    sheetName,
                    headerRows,
                    dataStartRow: cfg.dataStart,
                    nameColIndex,
                    groupColIndex,
                    productColumns
                });
            }
        });

        if (configs.length === 0) {
            message.warning('请至少配置一个 Sheet 的解析规则');
            return;
        }

        onConfirm(configs);
    };

    // 判断行是否为表头行
    const isHeaderRow = (rowIdx: number) => {
        if (!config) return false;
        return rowIdx >= config.headerStart && rowIdx <= config.headerEnd;
    };

    const isDataRow = (rowIdx: number) => {
        if (!config) return false;
        return rowIdx >= config.dataStart;
    };

    const getColumnRole = (colIdx: number): ColumnRole => {
        if (!config) return 'skip';
        return config.columns.get(colIdx)?.role || 'skip';
    };

    const colCount = currentPreview?.totalCols || 0;

    return (
        <Modal
            open={open}
            title={`Excel 预览 — ${fileName}`}
            width="90vw"
            style={{ top: 20 }}
            styles={{ body: { maxHeight: 'calc(100vh - 160px)', overflow: 'auto', padding: '12px 16px' } }}
            onCancel={onCancel}
            footer={[
                <Button key="cancel" onClick={onCancel}>取消</Button>,
                <Tooltip key="tip" title={validation.valid ? '' : validation.message}>
                    <Button
                        key="confirm"
                        type="primary"
                        icon={<CheckOutlined />}
                        disabled={!validation.valid}
                        onClick={handleConfirm}
                    >
                        确认解析
                    </Button>
                </Tooltip>
            ]}
        >
            {/* Sheet 切换 */}
            <Tabs
                activeKey={String(activeSheet)}
                onChange={key => setActiveSheet(Number(key))}
                size="small"
                items={previews.map((p, idx) => ({
                    key: String(idx),
                    label: `${p.sheetName} (${p.totalRows}行)`,
                }))}
            />

            {currentPreview && config && (
                <>
                    {/* 控制栏 */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, color: '#666' }}>表头行：</span>
                            <InputNumber
                                size="small"
                                min={1}
                                max={currentPreview.rows.length}
                                value={config.headerStart + 1}
                                onChange={v => {
                                    if (v === null) return;
                                    const val = v - 1;
                                    updateConfig(currentPreview.sheetName, prev => ({
                                        ...prev,
                                        headerStart: val,
                                        headerEnd: Math.max(val, prev.headerEnd),
                                        dataStart: Math.max(val + 1, prev.dataStart)
                                    }));
                                }}
                                style={{ width: 60 }}
                            />
                            <span style={{ fontSize: 13, color: '#999' }}>~</span>
                            <InputNumber
                                size="small"
                                min={config.headerStart + 1}
                                max={currentPreview.rows.length}
                                value={config.headerEnd + 1}
                                onChange={v => {
                                    if (v === null) return;
                                    const val = v - 1;
                                    updateConfig(currentPreview.sheetName, prev => ({
                                        ...prev,
                                        headerEnd: val,
                                        dataStart: val + 1
                                    }));
                                }}
                                style={{ width: 60 }}
                            />
                            <span style={{ fontSize: 13, color: '#666' }}>行</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, color: '#666' }}>数据起始行：</span>
                            <InputNumber
                                size="small"
                                min={config.headerEnd + 2}
                                max={currentPreview.rows.length}
                                value={config.dataStart + 1}
                                onChange={v => {
                                    if (v === null) return;
                                    updateConfig(currentPreview.sheetName, prev => ({ ...prev, dataStart: v - 1 }));
                                }}
                                style={{ width: 60 }}
                            />
                            <span style={{ fontSize: 13, color: '#666' }}>行</span>
                        </div>

                        <Button
                            size="small"
                            icon={<ReloadOutlined />}
                            onClick={() => autoDetect(currentPreview)}
                        >
                            重新检测
                        </Button>

                        <Tooltip title="点击列头的标签可切换列角色（参数名/分组/产品值/跳过）">
                            <InfoCircleOutlined style={{ color: '#999' }} />
                        </Tooltip>
                    </div>

                    {/* 预览表格 */}
                    <div style={{ overflowX: 'auto', border: '1px solid #e8e8e8', borderRadius: 6 }}>
                        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: colCount * 100 }}>
                            {/* 列角色标签行 */}
                            <thead>
                                <tr>
                                    <th style={{ padding: '4px 8px', background: '#fafafa', border: '1px solid #e8e8e8', width: 40, fontSize: 11, color: '#999' }}>
                                        #
                                    </th>
                                    {Array.from({ length: colCount }, (_, ci) => (
                                        <th key={ci} style={{ padding: '4px 6px', background: '#fafafa', border: '1px solid #e8e8e8', minWidth: 80 }}>
                                            <Select
                                                size="small"
                                                value={getColumnRole(ci)}
                                                onChange={val => setColumnRole(ci, val)}
                                                style={{ width: '100%' }}
                                                options={ROLE_OPTIONS.map(r => ({ value: r.value, label: r.label }))}
                                            />
                                            {getColumnRole(ci) === 'product' && (
                                                <input
                                                    type="text"
                                                    value={config.columns.get(ci)?.customName || ''}
                                                    onChange={e => setProductName(ci, e.target.value)}
                                                    placeholder="产品名"
                                                    style={{
                                                        marginTop: 2, width: '100%', fontSize: 11, padding: '1px 4px',
                                                        border: '1px solid #d9d9d9', borderRadius: 3, outline: 'none'
                                                    }}
                                                />
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {currentPreview.rows.map((row, ri) => {
                                    const isHeader = isHeaderRow(ri);
                                    const isData = isDataRow(ri);
                                    const bgColor = isHeader ? '#e6f7ff' : isData ? '#fff' : '#f5f5f5';

                                    return (
                                        <tr key={ri}>
                                            <td style={{
                                                padding: '3px 6px', border: '1px solid #e8e8e8',
                                                background: isHeader ? '#1890ff' : '#fafafa',
                                                color: isHeader ? '#fff' : '#999',
                                                fontSize: 11, textAlign: 'center', fontWeight: 500
                                            }}>
                                                {ri + 1}
                                                {isHeader && <span style={{ fontSize: 9, display: 'block' }}>表头</span>}
                                            </td>
                                            {row.slice(0, colCount).map((cell, ci) => {
                                                const role = getColumnRole(ci);
                                                const borderLeft = role === 'name' ? '2px solid #1890ff' :
                                                    role === 'group' ? '2px solid #52c41a' :
                                                    role === 'product' ? '2px solid #fa8c16' : undefined;
                                                return (
                                                    <td key={ci} style={{
                                                        padding: '3px 6px', border: '1px solid #e8e8e8',
                                                        background: bgColor, maxWidth: 200,
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        borderLeft, fontWeight: isHeader ? 600 : 400
                                                    }}>
                                                        <Tooltip title={cell} placement="topLeft">
                                                            <span>{cell}</span>
                                                        </Tooltip>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* 配置摘要 */}
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                        {Array.from(config.columns.entries())
                            .filter(([, col]) => col.role !== 'skip')
                            .map(([idx, col]) => (
                                <Tag key={idx} color={roleColor(col.role)}>
                                    列{idx + 1}: {roleLabel(col.role)}
                                    {col.role === 'product' && col.customName ? ` (${col.customName})` : ''}
                                </Tag>
                            ))}
                    </div>
                </>
            )}
        </Modal>
    );
};

export default ExcelPreviewDialog;
