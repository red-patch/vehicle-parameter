import React, { useState, useMemo, useEffect } from 'react';
import { Card, Input, Button, Table, message, Empty, Space, Upload, Spin } from 'antd';
import { DownloadOutlined, ClearOutlined, UploadOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { findBestMatch } from '../../utils/matchingEngine';
import ProductSourceSelector from './ProductSourceSelector';
import { getProductData } from '../../store/vehicleSelectors';
import * as XLSX from 'xlsx';
import { downloadCsv } from '../../utils/downloadCsv';


const { TextArea } = Input;


interface OrganizedRow {
    key: string;
    targetField: string;
    [productName: string]: string | number | undefined;
}

const MultiVehicleView: React.FC = () => {
    const { 
        uploadedFiles, 
        assetFiles,
        multiVehicleFields: targetFields,
        setMultiVehicleFields: setTargetFields,
        localSelection,
        setLocalSelection
    } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        assetFiles: state.assetFiles,
        multiVehicleFields: state.multiVehicleFields,
        setMultiVehicleFields: state.setMultiVehicleFields,
        localSelection: state.currentCompareProducts, // Reuse or add new state? Let's use its own if exists, but store only has currentCompareProducts.
        setLocalSelection: state.setCompareProducts
    })));
    const [organizedData, setOrganizedData] = useState<OrganizedRow[]>([]);
    const [isCalculating, setIsCalculating] = useState(false);

    // Prepare Vehicle Data Cache
    const selectedVehicles = useMemo(() => {
        const vehicles: { name: string; params: Map<string, string | number> }[] = [];
        
        localSelection.forEach(productName => {
            const data = getProductData(uploadedFiles, productName, assetFiles);
            if (data.length > 0) {
                const productParams = new Map<string, string | number>();
                data.forEach(p => productParams.set(p.name, p.value));
                vehicles.push({ name: productName, params: productParams });
            }
        });
        
        return vehicles;
    }, [uploadedFiles, assetFiles, localSelection]);

    // UX: Debounce triggering automatically
    useEffect(() => {
        if (selectedVehicles.length === 0 || !targetFields.trim()) {
            if (organizedData.length > 0) setOrganizedData([]);
            return;
        }

        const fields = targetFields
            .split(/[,，\n]+/)
            .map(s => s.trim())
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
                        targetField
                    };
                    
                    for (const vehicle of selectedVehicles) {
                         const candidates = Array.from(vehicle.params.entries()).map(([k, v]) => ({
                             id: k,
                             group: 'default',
                             name: k,
                             value: v
                         }));

                         const matchResult = findBestMatch(targetField, candidates, 0.5);
                         
                         if (matchResult.matchedParam) {
                             row[vehicle.name] = matchResult.matchedParam.value;
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
                ...selectedVehicles.map(v => row[v.name] || '')
            ];
        });

        const data = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const csvOutput = XLSX.utils.sheet_to_csv(ws);
        
        await downloadCsv(csvOutput, '多车型参数整理.csv');
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
            width: 150,
        }))
    ];

    return (
        <div className="flex flex-col gap-4 h-full">
            <Card className="shadow-sm flex-shrink-0">
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
                                rows={4} 
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
                    <div className="h-full flex flex-col p-4">
                        {organizedData.length > 0 || isCalculating ? (
                            <>
                                <div className="mb-4 flex justify-between items-center">
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
                            <Empty description="暂无整理结果" className="mt-20" />
                        )}
                    </div>
                </Spin>
            </div>
        </div>
    );
};

export default MultiVehicleView;
