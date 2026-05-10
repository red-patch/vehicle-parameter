import React, { useState, useMemo } from 'react';
import { Modal, Button, message, Select, Table, Tag, Spin, Statistic, Divider, Input } from 'antd';
import { FolderOpenOutlined, FileExcelOutlined, ReloadOutlined, CheckCircleOutlined, WarningOutlined, SearchOutlined } from '@ant-design/icons';
import { readFile, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import * as XLSX from 'xlsx';

interface EnumImportModalProps {
    open: boolean;
    onClose: () => void;
    assetLibraryPath: string | null;
    onImported: () => void;
}

interface ExcelRow {
    [key: string]: string | number | null | undefined;
}

interface ColumnMapping {
    fieldNameCol: string;
    enumValueCol: string;
    categoryCol: string;
    requiredCol: string;
    fieldKeyCol: string;
    categoryPathCol: string;
}

interface FieldMeta {
    category: string;
    required: string;
    key: string;
    categoryPath: string;
}

interface FieldGroup {
    fieldName: string;
    fieldKey: string;
    category: string;
    required: string;
    categoryPath: string;
    values: string[];
    count: number;
}

const defaultMapping: ColumnMapping = {
    fieldNameCol: '属性名称',
    enumValueCol: '属性值',
    categoryCol: '属性类别',
    requiredCol: '是否必填',
    fieldKeyCol: '属性key',
    categoryPathCol: '所属类目',
};

const EnumImportModal: React.FC<EnumImportModalProps> = ({ open, onClose, assetLibraryPath, onImported }) => {
    const [filePath, setFilePath] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [rawData, setRawData] = useState<ExcelRow[]>([]);
    const [actualColumns, setActualColumns] = useState<string[]>([]);
    const [mapping, setMapping] = useState<ColumnMapping>({ ...defaultMapping });
    const [fieldSearch, setFieldSearch] = useState('');

    const handleSelectFile = async () => {
        try {
            const { open: dialogOpen } = await import('@tauri-apps/plugin-dialog');
            const selected = await dialogOpen({
                multiple: false,
                filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
                title: '选择属性池导出文件'
            });
            if (!selected || typeof selected !== 'string') return;

            setFilePath(selected);
            setLoading(true);

            const buffer = await readFile(selected);
            const data = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);

            const workbook = XLSX.read(binary, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            // !ref bug workaround: detect actual range from cell keys
            const cellKeys = Object.keys(sheet).filter(k => !k.startsWith('!'));
            let minCol = Infinity, maxCol = 0, minRow = Infinity, maxRow = 0;
            for (const key of cellKeys) {
                try {
                    const { r, c } = XLSX.utils.decode_cell(key);
                    minCol = Math.min(minCol, c);
                    maxCol = Math.max(maxCol, c);
                    minRow = Math.min(minRow, r);
                    maxRow = Math.max(maxRow, r);
                } catch { /* skip */ }
            }

            const numCols = maxCol - minCol + 1;
            const numRows = maxRow - minRow + 1;

            if (numRows < 2) {
                message.warning('表格数据不足');
                setLoading(false);
                return;
            }

            // Extract headers from first row
            const headers: string[] = [];
            for (let c = 0; c < numCols; c++) {
                const addr = XLSX.utils.encode_cell({ r: minRow, c: minCol + c });
                const cell = sheet[addr];
                const val = cell ? String(cell.v ?? '').trim() : '';
                if (val) headers.push(val);
            }

            if (headers.length === 0) {
                message.warning('未检测到表头列');
                setLoading(false);
                return;
            }

            // Build row objects
            const jsonData: ExcelRow[] = [];
            for (let r = 1; r < numRows; r++) {
                const rowObj: ExcelRow = {};
                let hasValue = false;
                for (let c = 0; c < numCols; c++) {
                    const addr = XLSX.utils.encode_cell({ r: minRow + r, c: minCol + c });
                    const cell = sheet[addr];
                    const val = cell ? (cell.v ?? '') : '';
                    if (c < headers.length) rowObj[headers[c]] = val;
                    if (val !== '' && val !== null && val !== undefined) hasValue = true;
                }
                if (hasValue) jsonData.push(rowObj);
            }

            if (jsonData.length === 0) {
                message.warning('表格为空');
                setLoading(false);
                return;
            }

            const cols = headers;
            setActualColumns(cols);

            // Auto-detect mapping
            const am: ColumnMapping = { ...defaultMapping };
            if (!cols.includes('属性名称')) am.fieldNameCol = '无';
            if (!cols.includes('属性值')) am.enumValueCol = '无';
            if (!cols.includes('属性类别')) am.categoryCol = '无';
            if (!cols.includes('是否必填')) am.requiredCol = '无';
            if (!cols.includes('属性key')) am.fieldKeyCol = '无';
            if (!cols.includes('所属类目')) am.categoryPathCol = '无';
            setMapping(am);
            setRawData(jsonData);
            setFieldSearch('');

            setLoading(false);
            message.success(`成功读取 ${jsonData.length} 行数据`);
        } catch (err) {
            setLoading(false);
            console.error('Failed to read Excel', err);
            message.error('读取文件失败');
        }
    };

    // Group raw data by field name
    const fieldGroups = useMemo<FieldGroup[]>(() => {
        if (!rawData.length || mapping.fieldNameCol === '无' || mapping.enumValueCol === '无') return [];

        const groups = new Map<string, FieldGroup>();

        for (const row of rawData) {
            const fn = String(row[mapping.fieldNameCol] ?? '').trim();
            const ev = String(row[mapping.enumValueCol] ?? '').trim();
            if (!fn) continue;

            if (!groups.has(fn)) {
                groups.set(fn, {
                    fieldName: fn,
                    fieldKey: mapping.fieldKeyCol !== '无' ? String(row[mapping.fieldKeyCol] ?? '').trim() : '',
                    category: mapping.categoryCol !== '无' ? String(row[mapping.categoryCol] ?? '').trim() : '',
                    required: mapping.requiredCol !== '无' ? String(row[mapping.requiredCol] ?? '').trim() : '',
                    categoryPath: mapping.categoryPathCol !== '无' ? String(row[mapping.categoryPathCol] ?? '').trim() : '',
                    values: [],
                    count: 0,
                });
            }
            if (ev) {
                groups.get(fn)!.values.push(ev);
            }
        }

        const result = Array.from(groups.values());
        for (const g of result) {
            g.values = [...new Set(g.values)];
            g.count = g.values.length;
        }
        result.sort((a, b) => a.fieldName.localeCompare(b.fieldName, 'zh-CN'));
        return result;
    }, [rawData, mapping]);

    // Filter by search
    const filteredGroups = useMemo(() => {
        if (!fieldSearch.trim()) return fieldGroups;
        const q = fieldSearch.toLowerCase();
        return fieldGroups.filter(g =>
            g.fieldName.toLowerCase().includes(q) ||
            g.fieldKey.toLowerCase().includes(q)
        );
    }, [fieldGroups, fieldSearch]);

    // Stats
    const stats = useMemo(() => {
        if (!fieldGroups.length) return null;
        const catDist: Record<string, number> = {};
        let reqCount = 0, notReqCount = 0;
        for (const g of fieldGroups) {
            if (g.category) catDist[g.category] = (catDist[g.category] || 0) + 1;
            if (g.required === '是') reqCount++;
            else if (g.required === '否') notReqCount++;
        }
        return {
            fieldCount: fieldGroups.length,
            enumCount: fieldGroups.reduce((s, g) => s + g.count, 0),
            totalRows: rawData.length,
            categoryDist: catDist,
            requiredCount: reqCount,
            notRequiredCount: notReqCount,
        };
    }, [fieldGroups, rawData.length]);

    const handleImport = async () => {
        if (!assetLibraryPath) { message.error('请先设置资产库目录'); return; }
        if (mapping.fieldNameCol === '无' || mapping.enumValueCol === '无') {
            message.error('请先配置字段名称列和枚举值列的映射');
            return;
        }

        setImporting(true);
        try {
            // Build enums and metadata
            const enumsMap = new Map<string, string[]>();
            const metaMap = new Map<string, FieldMeta>();

            for (const row of rawData) {
                const fn = String(row[mapping.fieldNameCol] ?? '').trim();
                const ev = String(row[mapping.enumValueCol] ?? '').trim();
                if (!fn) continue;
                if (!enumsMap.has(fn)) enumsMap.set(fn, []);
                if (ev) enumsMap.get(fn)!.push(ev);
                if (!metaMap.has(fn)) {
                    metaMap.set(fn, {
                        category: mapping.categoryCol !== '无' ? String(row[mapping.categoryCol] ?? '').trim() : '',
                        required: mapping.requiredCol !== '无' ? String(row[mapping.requiredCol] ?? '').trim() : '',
                        key: mapping.fieldKeyCol !== '无' ? String(row[mapping.fieldKeyCol] ?? '').trim() : '',
                        categoryPath: mapping.categoryPathCol !== '无' ? String(row[mapping.categoryPathCol] ?? '').trim() : '',
                    });
                }
            }

            // Merge enums
            let existingEnums: Record<string, string[]> = {};
            try {
                const p = await join(assetLibraryPath, 'custom_enums.json');
                existingEnums = JSON.parse(await readTextFile(p));
            } catch { /* new file */ }
            const mergedEnums: Record<string, string[]> = { ...existingEnums };
            for (const [k, v] of enumsMap) mergedEnums[k] = [...new Set(v)];

            // Merge meta
            let existingMeta: Record<string, FieldMeta> = {};
            try {
                const p = await join(assetLibraryPath, 'custom_enum_meta.json');
                existingMeta = JSON.parse(await readTextFile(p));
            } catch { /* new file */ }
            const mergedMeta: Record<string, FieldMeta> = { ...existingMeta };
            for (const [k, v] of metaMap) mergedMeta[k] = v;

            await writeTextFile(await join(assetLibraryPath, 'custom_enums.json'), JSON.stringify(mergedEnums, null, 2));
            await writeTextFile(await join(assetLibraryPath, 'custom_enum_meta.json'), JSON.stringify(mergedMeta, null, 2));

            setImporting(false);
            const ec = fieldGroups.reduce((s, g) => s + g.count, 0);
            message.success(`导入完成！共导入 ${fieldGroups.length} 个字段，${ec} 个枚举值`);
            onImported();
            onClose();
        } catch (err) {
            setImporting(false);
            console.error('Import failed', err);
            message.error('导入失败');
        }
    };

    const handleReset = () => {
        setFilePath('');
        setRawData([]);
        setActualColumns([]);
        setMapping({ ...defaultMapping });
        setFieldSearch('');
    };

    const updateMapping = (key: keyof ColumnMapping, val: string) => {
        setMapping(p => ({ ...p, [key]: val }));
    };

    const columnOptions = actualColumns.length > 0 ? ['无', ...actualColumns] : [];

    // Build dynamic table columns from mapping
    const tableColumns = useMemo(() => {
        const cols: { title: string; dataIndex: keyof FieldGroup; key: string; width?: number; ellipsis?: boolean; render?: (v: any, r: FieldGroup) => React.ReactNode }[] = [];

        cols.push({ title: '字段名称', dataIndex: 'fieldName', key: 'fieldName', width: 180, ellipsis: true });

        if (mapping.fieldKeyCol !== '无') {
            cols.push({ title: '字段标识', dataIndex: 'fieldKey', key: 'fieldKey', width: 130, ellipsis: true });
        }

        if (mapping.categoryCol !== '无') {
            cols.push({ title: '属性类别', dataIndex: 'category', key: 'category', width: 90 });
        }

        if (mapping.requiredCol !== '无') {
            cols.push({ title: '必填', dataIndex: 'required', key: 'required', width: 60 });
        }

        if (mapping.categoryPathCol !== '无') {
            cols.push({ title: '所属类目', dataIndex: 'categoryPath', key: 'categoryPath', width: 120, ellipsis: true });
        }

        cols.push({ title: '枚举数', dataIndex: 'count', key: 'count', width: 65 });

        cols.push({
            title: '枚举值',
            dataIndex: 'values',
            key: 'values',
            width: 300,
            render: (values: string[]) => {
                if (!values || values.length === 0) return <span className="text-slate-300">-</span>;
                const showCount = 8;
                const preview = values.slice(0, showCount);
                const hasMore = values.length > showCount;
                return (
                    <div>
                        <div className="flex flex-wrap gap-1">
                            {preview.map((v, i) => (
                                <Tag key={i} className="text-xs max-w-[140px] overflow-hidden text-ellipsis">{v}</Tag>
                            ))}
                            {hasMore && (
                                <span className="text-xs text-blue-400 cursor-pointer"
                                    onClick={e => { e.stopPropagation(); /* expand via row expansion */ }}
                                >+{values.length - showCount}</span>
                            )}
                        </div>
                    </div>
                );
            }
        });

        return cols;
    }, [mapping]);

    // Expanded row: full enum values with search
    const expandedRowRender = (record: FieldGroup) => {
        const [valSearch, setValSearch] = React.useState('');
        const filtered = valSearch.trim()
            ? record.values.filter(v => v.toLowerCase().includes(valSearch.toLowerCase()))
            : record.values;
        return (
            <div className="p-3 bg-gray-50 rounded max-h-[300px] overflow-y-auto">
                <Input
                    size="small"
                    placeholder="搜索枚举值..."
                    prefix={<SearchOutlined />}
                    value={valSearch}
                    onChange={e => setValSearch(e.target.value)}
                    className="mb-2 w-64"
                />
                <div className="flex flex-wrap gap-1">
                    {filtered.map((v, i) => <Tag key={i} className="text-xs">{v}</Tag>)}
                    {filtered.length === 0 && <span className="text-xs text-slate-400">无匹配</span>}
                </div>
            </div>
        );
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <FileExcelOutlined className="text-green-500" />
                    <span>从属性池 Excel 导入枚举数据</span>
                </div>
            }
            open={open}
            onCancel={onClose}
            width={1100}
            footer={null}
            destroyOnClose
        >
            <div className="space-y-4">
                {/* Step 1: File Selection */}
                <div className="flex items-center gap-3">
                    <Button icon={<FolderOpenOutlined />} onClick={handleSelectFile} loading={loading}>
                        选择 Excel 文件
                    </Button>
                    {filePath && (
                        <>
                            <span className="text-sm text-slate-500 truncate flex-1">{filePath}</span>
                            <Button type="text" size="small" icon={<ReloadOutlined />} onClick={handleReset}>重新选择</Button>
                        </>
                    )}
                </div>

                {loading && <div className="flex justify-center py-8"><Spin tip="正在读取 Excel..." /></div>}

                {rawData.length > 0 && (
                    <>
                        <Divider />

                        {/* Column Mapping */}
                        <div>
                            <div className="text-sm font-medium mb-2 text-slate-600">列映射配置</div>
                            <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                                {([
                                    ['fieldNameCol', '字段名称列*', true],
                                    ['enumValueCol', '枚举值列*', true],
                                    ['categoryCol', '属性类别列', false],
                                    ['requiredCol', '是否必填列', false],
                                    ['fieldKeyCol', '字段标识列', false],
                                    ['categoryPathCol', '所属类目列', false],
                                ] as const).map(([key, label, required]) => (
                                    <div key={key} className="flex items-center gap-2">
                                        <span className="text-sm text-slate-500 w-24 shrink-0">{label}</span>
                                        <Select
                                            value={mapping[key]}
                                            onChange={v => updateMapping(key, v)}
                                            options={columnOptions.filter(c => c !== '无' || !required || mapping[key] === '无').map(c => ({ value: c, label: c }))}
                                            style={{ flex: 1 }}
                                            size="small"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <Divider />

                        {/* Statistics */}
                        {stats && (
                            <div>
                                <div className="text-sm font-medium mb-2 text-slate-600">数据概览</div>
                                <div className="flex flex-wrap gap-6 mb-3">
                                    <Statistic title="字段数" value={stats.fieldCount} prefix={<FileExcelOutlined />} valueStyle={{ fontSize: 18 }} />
                                    <Statistic title="枚举值数" value={stats.enumCount} valueStyle={{ fontSize: 18 }} />
                                    <Statistic title="总行数" value={stats.totalRows} valueStyle={{ fontSize: 18 }} />
                                    <Statistic title="必填字段" value={stats.requiredCount} valueStyle={{ fontSize: 18, color: stats.requiredCount > 0 ? '#cf1322' : undefined }} />
                                </div>
                                {Object.keys(stats.categoryDist).length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-sm text-slate-500">类别分布:</span>
                                        {Object.entries(stats.categoryDist).map(([k, v]) => (
                                            <Tag key={k} color="blue">{k}: {v}</Tag>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <Divider />

                        {/* Field table with search */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-slate-600">字段列表（按字段分组，点击展开查看全部枚举值）</span>
                                <Input
                                    placeholder="搜索字段..."
                                    prefix={<SearchOutlined />}
                                    value={fieldSearch}
                                    onChange={e => setFieldSearch(e.target.value)}
                                    style={{ width: 240 }}
                                    size="small"
                                    allowClear
                                />
                            </div>
                            <Table<FieldGroup>
                                dataSource={filteredGroups}
                                columns={tableColumns}
                                size="small"
                                pagination={{ pageSize: 50, showSizeChanger: false, showTotal: t => `共 ${t} 个字段` }}
                                scroll={{ x: 900, y: 400 }}
                                bordered
                                rowKey="fieldName"
                                expandable={{
                                    expandedRowRender,
                                    rowExpandable: r => r.count > 8,
                                    expandRowByClick: true,
                                }}
                            />
                        </div>

                        <Divider />

                        {/* Import Button */}
                        <div className="flex justify-end gap-2">
                            <Button onClick={onClose}>取消</Button>
                            <Button
                                type="primary"
                                icon={<CheckCircleOutlined />}
                                onClick={handleImport}
                                loading={importing}
                                disabled={mapping.fieldNameCol === '无' || mapping.enumValueCol === '无'}
                            >
                                导入枚举数据
                            </Button>
                        </div>
                    </>
                )}

                {!rawData.length && !loading && (
                    <div className="text-center py-8 text-slate-400">
                        <WarningOutlined className="text-2xl mb-2" />
                        <div>请先选择一个 Excel 文件</div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default EnumImportModal;
