import React, { useState, useMemo, useCallback } from 'react';
import { Modal, Tabs, InputNumber, Select, Button, Tag, Tooltip, message } from 'antd';
import { CheckOutlined, ReloadOutlined, InfoCircleOutlined, StopOutlined, PlayCircleOutlined } from '@ant-design/icons';
import type { SheetPreview, SheetParseConfig, ColumnRole } from '../../types';

interface Props {
    open: boolean;
    previews: SheetPreview[];
    fileName: string;
    onConfirm: (configs: SheetParseConfig[]) => void;
    onCancel: () => void;
    preselectedDisabledSheets?: Set<string>;
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

const ExcelPreviewDialog: React.FC<Props> = ({ open, previews, fileName, onConfirm, onCancel, preselectedDisabledSheets }) => {
    const [activeSheet, setActiveSheet] = useState(0);
    const [sheetConfigs, setSheetConfigs] = useState<Map<string, {
        enabled: boolean;
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
        // 默认值：第 0 索引（第 1 行）为表头，第 1 索引（第 2 行）开始是数据
        return { enabled: true, headerStart: 0, headerEnd: 0, dataStart: 1, columns: new Map<number, ColumnConfig>() };
    }, [sheetConfigs]);

    const config = currentPreview ? getConfig(currentPreview) : null;

    const updateConfig = useCallback((sheetName: string, updater: (prev: ReturnType<typeof getConfig>) => ReturnType<typeof getConfig>) => {
        setSheetConfigs(prev => {
            const next = new Map(prev);
            const current = next.get(sheetName) || { enabled: true, headerStart: 0, headerEnd: 0, dataStart: 1, columns: new Map<number, ColumnConfig>() };
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

        // 增加多行表头检测逻辑：如果下一行在产品值列有内容，且当前行是通用的“参数值”，则将下一行也纳为表头以提取产品名
        const nextRow = preview.rows[headerRow + 1];
        let isMultiRowHeader = false;
        if (nextRow) {
            columns.forEach((col, idx) => {
                if (col.role === 'product' && nextRow[idx]?.trim()) {
                    const nextVal = nextRow[idx].trim();
                    // 如果表头是通用名称，尝试取下一行作为具体产品名
                    if (col.customName === '参数值' || col.customName === '数值' || !col.customName) {
                        col.customName = nextVal;
                        isMultiRowHeader = true;
                    }
                }
            });
        }

        const headerEnd = isMultiRowHeader ? headerRow + 1 : headerRow;
        const dataStart = headerEnd + 1;

        updateConfig(preview.sheetName, () => ({
            enabled: true,
            headerStart: headerRow,
            headerEnd,
            dataStart,
            columns
        }));
    }, [updateConfig]);

    // 初始化并同步 SheetPicker 传入的禁用列表
    React.useEffect(() => {
        if (previews.length === 0) return;
        previews.forEach(p => {
            // 首次打开：自动检测列角色
            if (!sheetConfigs.has(p.sheetName)) {
                autoDetect(p);
            }
            // 始终同步跳过状态（包括重新配置场景）
            if (preselectedDisabledSheets?.has(p.sheetName)) {
                setSheetEnabled(p.sheetName, false);
            }
        });
    }, [previews, preselectedDisabledSheets]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const setSheetEnabled = (sheetName: string, enabled: boolean) => {
        updateConfig(sheetName, prev => ({ ...prev, enabled }));
    };

    const enableOnlyCurrentSheet = () => {
        if (!currentPreview) return;
        setSheetConfigs(prev => {
            const next = new Map(prev);
            previews.forEach(preview => {
                const current = next.get(preview.sheetName) || getConfig(preview);
                next.set(preview.sheetName, { ...current, enabled: preview.sheetName === currentPreview.sheetName });
            });
            return next;
        });
    };

    // 一键：仅保留当前产品列，其余产品列全部设为跳过
    const keepOnlyThisProductColumn = (colIdx: number) => {
        if (!currentPreview) return;
        updateConfig(currentPreview.sheetName, prev => {
            const cols = new Map(prev.columns);
            cols.forEach((col, idx) => {
                if (col.role === 'product' && idx !== colIdx) cols.set(idx, { ...col, role: 'skip' });
                if (idx === colIdx) cols.set(idx, { ...col, role: 'product' });
            });
            return { ...prev, columns: cols };
        });
    };

    const enableAllSheets = () => {
        setSheetConfigs(prev => {
            const next = new Map(prev);
            previews.forEach(preview => {
                const current = next.get(preview.sheetName) || getConfig(preview);
                next.set(preview.sheetName, { ...current, enabled: true });
            });
            return next;
        });
    };

    // 验证当前 sheet 配置是否完整
    const validation = useMemo(() => {
        if (!config) return { valid: false, message: '未选择 Sheet' };
        if (!config.enabled) return { valid: true, message: '' };
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

    const parsedConfigsPreview = useMemo(() => {
        const configs: SheetParseConfig[] = [];

        sheetConfigs.forEach((cfg, sheetName) => {
            if (!cfg.enabled) return;

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
                for (let rowIndex = cfg.headerStart; rowIndex <= cfg.headerEnd; rowIndex++) headerRows.push(rowIndex);

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

        return configs;
    }, [sheetConfigs]);

    const enabledSheetCount = useMemo(
        () => Array.from(sheetConfigs.values()).filter(cfg => cfg.enabled).length,
        [sheetConfigs]
    );

    const currentSheetStats = useMemo(() => {
        if (!currentPreview || !config) return null;
        if (!config.enabled) return null;
        const headerRows = config.headerEnd - config.headerStart + 1;
        const dataRows = currentPreview.rows.length - config.dataStart;
        const productCols = Array.from(config.columns.values()).filter(c => c.role === 'product').length;
        return { headerRows, dataRows, productCols, estimated: dataRows * productCols };
    }, [currentPreview, config]);

    // 构建并提交配置
    const handleConfirm = () => {
        if (enabledSheetCount === 0) {
            message.warning('请至少启用一个 Sheet 参与解析');
            return;
        }

        if (parsedConfigsPreview.length === 0) {
            message.warning('启用的 Sheet 中至少需要一个配置完整的解析规则');
            return;
        }

        onConfirm(parsedConfigsPreview);
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
                        disabled={enabledSheetCount === 0 || (!validation.valid && !!config?.enabled)}
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
                tabBarExtraContent={
                    <Tag color="blue" style={{ marginRight: 8 }}>
                        已启用 {enabledSheetCount}/{previews.length} 个 Sheet
                    </Tag>
                }
                items={previews.map((p, idx) => {
                    const cfg = getConfig(p);
                    return {
                        key: String(idx),
                        label: (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                    color: cfg.enabled ? 'inherit' : '#bbb',
                                    textDecoration: cfg.enabled ? 'none' : 'line-through',
                                }}>
                                    {p.sheetName} ({p.totalRows}行)
                                </span>
                                <Tooltip title={cfg.enabled ? '跳过此 Sheet' : '启用此 Sheet'}>
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={cfg.enabled ? <StopOutlined /> : <PlayCircleOutlined />}
                                        onClick={(e) => { e.stopPropagation(); setSheetEnabled(p.sheetName, !cfg.enabled); }}
                                        style={{ padding: 0, minWidth: 20, height: 20, color: cfg.enabled ? '#ff4d4f' : '#52c41a' }}
                                    />
                                </Tooltip>
                            </span>
                        ),
                    };
                })}
            />

            {currentPreview && config && (
                <>
                    {/* 控制栏 */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Tag color={config.enabled ? 'blue' : 'default'}>
                                {config.enabled ? '当前页参与解析' : '当前页已跳过'}
                            </Tag>
                            <Button
                                size="small"
                                type={config.enabled ? 'dashed' : 'default'}
                                danger={config.enabled}
                                icon={config.enabled ? <StopOutlined /> : <PlayCircleOutlined />}
                                onClick={() => setSheetEnabled(currentPreview.sheetName, !config.enabled)}
                            >
                                {config.enabled ? '跳过当前 Sheet' : '启用当前 Sheet'}
                            </Button>
                            <Button size="small" onClick={enableOnlyCurrentSheet}>仅解析当前页</Button>
                            <Button size="small" onClick={enableAllSheets}>全部启用</Button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, color: '#666' }}>表头行：</span>
                            <InputNumber
                                size="small"
                                min={1}
                                max={currentPreview.rows.length}
                                value={config.headerStart + 1}
                                disabled={!config.enabled}
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
                                disabled={!config.enabled}
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
                                disabled={!config.enabled}
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
                            disabled={!config.enabled}
                            onClick={() => autoDetect(currentPreview)}
                        >
                            重新检测
                        </Button>

                        <Tooltip title="点击列头下拉框可切换列角色（参数名/分组/产品值/跳过）。若需跳过整个 Sheet，请使用上方「跳过当前 Sheet」按钮或点击 Sheet 标签上的跳过图标。">
                            <InfoCircleOutlined style={{ color: '#999' }} />
                        </Tooltip>
                    </div>

                    {/* 统计摘要 */}
                    {currentSheetStats && (
                        <div style={{ marginBottom: 8, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#666' }}>
                            <Tag color="default">表头 {currentSheetStats.headerRows} 行</Tag>
                            <Tag color="blue">数据 {currentSheetStats.dataRows} 行</Tag>
                            <Tag color="orange">产品 {currentSheetStats.productCols} 列</Tag>
                            <Tag color="green">预计提取 {currentSheetStats.estimated} 个参数</Tag>
                        </div>
                    )}

                    {/* 预览表格 */}
                    <div style={{ overflowX: 'auto', border: '1px solid #e8e8e8', borderRadius: 6, opacity: config.enabled ? 1 : 0.55, filter: config.enabled ? 'none' : 'grayscale(30%)' }}>
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
                                                disabled={!config.enabled}
                                                onChange={val => setColumnRole(ci, val)}
                                                style={{ width: '100%' }}
                                                options={ROLE_OPTIONS.map(r => ({ value: r.value, label: r.label }))}
                                            />
                                            {getColumnRole(ci) === 'product' && (
                                                <>
                                                    <input
                                                        type="text"
                                                        value={config.columns.get(ci)?.customName || ''}
                                                        disabled={!config.enabled}
                                                        onChange={e => setProductName(ci, e.target.value)}
                                                        placeholder="产品名"
                                                        style={{
                                                            marginTop: 2, width: '100%', fontSize: 11, padding: '1px 4px',
                                                            border: '1px solid #d9d9d9', borderRadius: 3, outline: 'none'
                                                        }}
                                                    />
                                                    <span
                                                        style={{ fontSize: 10, color: '#1890ff', cursor: 'pointer', display: 'block', marginTop: 2, textAlign: 'right' }}
                                                        onClick={() => keepOnlyThisProductColumn(ci)}
                                                    >
                                                        仅此列
                                                    </span>
                                                </>
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
                        {!config.enabled ? (
                            <Tag color="default">当前 Sheet 将被完全跳过，不参与解析</Tag>
                        ) : (
                            Array.from(config.columns.entries())
                                .filter(([, col]) => col.role !== 'skip')
                                .map(([idx, col]) => (
                                    <Tag key={idx} color={roleColor(col.role)}>
                                        列{idx + 1}: {roleLabel(col.role)}
                                        {col.role === 'product' && col.customName ? ` (${col.customName})` : ''}
                                    </Tag>
                                ))
                        )}
                    </div>
                </>
            )}
        </Modal>
    );
};

export default ExcelPreviewDialog;
