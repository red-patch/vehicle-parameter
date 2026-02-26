import React, { useState, useMemo } from 'react';
import { Card, Input, Button, Table, message, Empty, Tag, Space, Upload } from 'antd';
import { AppstoreOutlined, DownloadOutlined, ClearOutlined, UploadOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { findBestMatch } from '../../utils/matchingEngine';
import * as XLSX from 'xlsx';
import { downloadCsv } from '../../utils/downloadCsv';


const { TextArea } = Input;


interface OrganizedRow {
    key: string;
    targetField: string;
    [productName: string]: string | number | undefined;
}

const MultiVehicleView: React.FC = () => {
    const { uploadedFiles, selectedProductNames } = useVehicleStore();
    const [targetFields, setTargetFields] = useState('');
    const [organizedData, setOrganizedData] = useState<OrganizedRow[]>([]);
    const [loading, setLoading] = useState(false);

    // Prepare Vehicle Data Cache
    const selectedVehicles = useMemo(() => {
        const vehicles: { name: string; params: Map<string, string | number> }[] = [];
        
        selectedProductNames.forEach(productName => {
            // Find in uploaded files
            for (const file of uploadedFiles) {
                const productParams = new Map<string, string | number>();
                let found = false;
                
                file.data.forEach(p => {
                    const pName = p.productName || file.fileName;
                    if (pName === productName) {
                        productParams.set(p.name, p.value);
                        found = true;
                    }
                });

                if (found) {
                    vehicles.push({ name: productName, params: productParams });
                    break; // Found the product, move to next product name
                }
            }
        });
        
        return vehicles;
    }, [uploadedFiles, selectedProductNames]);

    const handleOrganize = () => {
        if (selectedVehicles.length === 0) {
            message.warning('请先在“数据池”中选择要整理的车型');
            return;
        }

        const fields = targetFields
            .split(/[,，\n]+/)
            .map(s => s.trim())
            .filter(Boolean);
        
        if (fields.length === 0) {
            message.warning('请输入目标字段名');
            return;
        }

        setLoading(true);
        setTimeout(() => { // Yield for UI update
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
                message.success('整理完成');
            } catch (err) {
                console.error(err);
                message.error('整理失败');
            } finally {
                setLoading(false);
            }
        }, 100);
    };

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
                            <div className="mb-2 font-medium">2. 已选车型 ({selectedVehicles.length})</div>
                            <div className="bg-gray-50 p-2 rounded h-[100px] overflow-auto border border-gray-200">
                                {selectedVehicles.length > 0 ? (
                                    selectedVehicles.map(v => <Tag key={v.name} className="mb-1">{v.name}</Tag>)
                                ) : (
                                    <div className="text-gray-400 text-sm mt-8 text-center">请在“数据池”中勾选车型</div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 mt-8">
                            <Button type="primary" icon={<AppstoreOutlined />} onClick={handleOrganize} loading={loading}>
                                开始整理
                            </Button>
                            <Button icon={<ClearOutlined />} onClick={() => { setOrganizedData([]); setTargetFields(''); }}>
                                清空
                            </Button>
                        </div>
                    </div>
                </Space>
            </Card>

            <div className="flex-1 overflow-auto bg-white rounded shadow p-4">
                {organizedData.length > 0 ? (
                     <div className="h-full flex flex-col">
                        <div className="mb-4 flex justify-between items-center">
                            <h3 className="font-bold">整理结果</h3>
                            <Button icon={<DownloadOutlined />} onClick={handleDownload}>导出 CSV</Button>
                        </div>
                        <Table
                            dataSource={organizedData}
                            columns={columns}
                            scroll={{ x: 'max-content', y: 500 }}
                            pagination={false}
                            bordered
                            size="small"
                        />
                     </div>
                ) : (
                    <Empty description="暂无整理结果" className="mt-20" />
                )}
            </div>
        </div>
    );
};

export default MultiVehicleView;
