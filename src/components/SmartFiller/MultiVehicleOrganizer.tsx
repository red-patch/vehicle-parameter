import React, { useState, useMemo } from 'react';
import { Upload, Card, Button, Input, Table, message, Spin, Tag, Empty, Tooltip, Tabs } from 'antd';
import { UploadOutlined, DownloadOutlined, DeleteOutlined, FileExcelOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { parseExcel } from '../../utils/excelParser';
import { findBestMatch } from '../../utils/matchingEngine';

const { Dragger } = Upload;

interface VehicleData {
    productName: string;
    fileName: string;
    params: Map<string, string | number>; // fieldName -> value
}

interface OrganizedRow {
    key: string;
    targetField: string;
    [vehicleName: string]: string | number | undefined;
}

const MultiVehicleOrganizer: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [vehicleDataList, setVehicleDataList] = useState<VehicleData[]>([]);
    const [targetFields, setTargetFields] = useState('');
    const [organizedData, setOrganizedData] = useState<OrganizedRow[]>([]);

    // 复用版本对比中经过验证的解析逻辑
    const handleUpload = async (file: File) => {
        setLoading(true);
        try {
            // 复用 excelParser 中的 parseExcel 函数
            const sheetData = await parseExcel(file);
            
            // 按 productName 分组，构建 VehicleData
            const productMap = new Map<string, Map<string, string | number>>();
            
            for (const param of sheetData.data) {
                const pName = param.productName || file.name;
                
                if (!productMap.has(pName)) {
                    productMap.set(pName, new Map());
                }
                
                const params = productMap.get(pName)!;
                // 使用参数名作为key，值作为value
                if (param.name && param.value !== undefined && param.value !== '') {
                    params.set(param.name, param.value);
                }
            }
            
            // 转换为 VehicleData 数组
            const newVehicles: VehicleData[] = [];
            for (const [productName, params] of productMap.entries()) {
                if (params.size > 0) {
                    newVehicles.push({
                        productName,
                        fileName: file.name,
                        params
                    });
                }
            }
            
            if (newVehicles.length === 0) {
                message.warning(`未能从 ${file.name} 中解析出车型数据`);
            } else {
                setVehicleDataList(prev => [...prev, ...newVehicles]);
                message.success(`已解析 ${file.name}，识别到 ${newVehicles.length} 个车型`);
            }
            
        } catch (error) {
            console.error(error);
            message.error(`解析失败: ${(error as Error).message}`);
        } finally {
            setLoading(false);
        }
        return false;
    };

    // 清除所有数据
    const handleClear = () => {
        setVehicleDataList([]);
        setOrganizedData([]);
        setTargetFields('');
    };

    // 删除单个车型
    const removeVehicle = (index: number) => {
        setVehicleDataList(prev => prev.filter((_, i) => i !== index));
    };

    // 执行整理
    const handleOrganize = () => {
        if (vehicleDataList.length === 0) {
            message.warning('请先上传车型文件');
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
        
        
        // 对每个目标字段，从每个车型中模糊匹配
        const results: OrganizedRow[] = fields.map((targetField, idx) => {
            const row: OrganizedRow = {
                key: `${idx}`,
                targetField
            };
            
            for (const vehicle of vehicleDataList) {
                // 构造候选 VehicleParameter 列表
                // 注意：VehicleData.params 是 Map<string, string|number>，没有 id/group 字段
                // 我们需要临时转换为 VehicleParameter 格式以供 findBestMatch 使用
                const candidates: any[] = Array.from(vehicle.params.entries()).map(([k, v]) => ({
                    name: k,
                    value: v
                }));

                const matchResult = findBestMatch(targetField, candidates, 0.5); // 保持0.5的宽松阈值

                if (matchResult.matchedParam) {
                    row[vehicle.productName] = matchResult.matchedParam.value;
                } else {
                    row[vehicle.productName] = undefined;
                }
            }
            
            return row;
        });
        
        setOrganizedData(results);
        message.success(`已整理 ${fields.length} 个字段，${vehicleDataList.length} 个车型`);
    };

    // 导出CSV
    const handleExport = async () => {
        if (organizedData.length === 0) {
            message.warning('暂无数据可导出');
            return;
        }
        
        const vehicleNames = vehicleDataList.map(v => v.productName);
        const headers = ['目标字段名', ...vehicleNames];
        const rows = organizedData.map(row => [
            row.targetField,
            ...vehicleNames.map(name => row[name] !== undefined ? String(row[name]) : '')
        ]);
        
        const data = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const csvOutput = XLSX.utils.sheet_to_csv(ws);
        
        // 动态导入downloadCsv
        const { downloadCsv } = await import('../../utils/downloadCsv');
        await downloadCsv(csvOutput, `多车型整理_${new Date().toISOString().slice(0,10)}.csv`);
        message.success('导出成功');
    };

    // 动态生成表格列
    const columns = useMemo(() => {
        const baseColumns = [
            {
                title: '目标字段名',
                dataIndex: 'targetField',
                key: 'targetField',
                width: 200,
                fixed: 'left' as const,
                render: (text: string) => <span className="font-medium">{text}</span>
            }
        ];
        
        const vehicleColumns = vehicleDataList.map(vehicle => ({
            title: (
                <Tooltip title={`来源: ${vehicle.fileName}`}>
                    <span>{vehicle.productName}</span>
                </Tooltip>
            ),
            dataIndex: vehicle.productName,
            key: vehicle.productName,
            width: 150,
            render: (value: string | number | undefined) => 
                value !== undefined 
                    ? <span className="font-mono">{String(value)}</span>
                    : <Tag color="orange">未匹配</Tag>
        }));
        
        return [...baseColumns, ...vehicleColumns];
    }, [vehicleDataList]);

    return (
        <Spin spinning={loading} tip="正在解析...">
            <div className="space-y-4">
                {/* 步骤1: 上传文件 */}
                <Card title="步骤1: 上传车型文件" size="small">
                    <Dragger
                        name="file"
                        multiple
                        accept=".xlsx,.xls,.csv"
                        showUploadList={false}
                        beforeUpload={handleUpload}
                        disabled={loading}
                        className="bg-blue-50 hover:bg-blue-100"
                    >
                        <p className="ant-upload-drag-icon">
                            <UploadOutlined className="text-blue-500" />
                        </p>
                        <p className="ant-upload-text">点击或拖拽文件到此区域</p>
                        <p className="ant-upload-hint">支持上传多个Excel/CSV文件，自动识别车型</p>
                    </Dragger>
                    
                    {vehicleDataList.length > 0 && (
                        <div className="mt-4">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-gray-600">已识别 {vehicleDataList.length} 个车型：</span>
                                <Button size="small" danger icon={<DeleteOutlined />} onClick={handleClear}>
                                    清空
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {vehicleDataList.map((v, idx) => (
                                    <Tag 
                                        key={idx} 
                                        closable 
                                        onClose={() => removeVehicle(idx)}
                                        icon={<FileExcelOutlined />}
                                        color="blue"
                                    >
                                        {v.productName} ({v.params.size}个字段)
                                    </Tag>
                                ))}
                            </div>
                        </div>
                    )}
                </Card>
                
                {/* 步骤2: 输入目标字段 */}
                <Card title="步骤2: 输入目标字段名" size="small">
                    <Tabs
                        size="small"
                        items={[
                            {
                                key: 'text',
                                label: '文本输入',
                                children: (
                                    <Input.TextArea
                                        rows={4}
                                        placeholder={"输入目标字段名，支持批量输入。\n分隔符支持：逗号(,)，中文逗号(，)，或换行符。\n\n例如：\n轴距(mm)\n电机类型\n总质量(kg)"}
                                        value={targetFields}
                                        onChange={e => setTargetFields(e.target.value)}
                                    />
                                )
                            },
                            {
                                key: 'file',
                                label: '从文件导入',
                                children: (
                                    <Upload
                                        accept=".xlsx,.xls,.csv"
                                        showUploadList={false}
                                        beforeUpload={async (file) => {
                                            try {
                                                const buffer = await file.arrayBuffer();
                                                const workbook = XLSX.read(buffer, { type: 'array' });
                                                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                                                const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                                                
                                                if (rows.length < 2) {
                                                    message.error('文件为空或格式错误');
                                                    return false;
                                                }
                                                
                                                // 检测参数名列（通常是第一列或包含"名称"关键词的列）
                                                const headers = rows[0];
                                                let nameIdx = headers.findIndex(h => h && typeof h === 'string' && 
                                                    (h.includes('名称') || h.includes('参数') || h.includes('字段') || h.includes('项目')));
                                                if (nameIdx === -1) nameIdx = 0;
                                                
                                                // 提取字段名列表
                                                const fields = rows.slice(1)
                                                    .map(row => row[nameIdx] ? String(row[nameIdx]).trim() : '')
                                                    .filter(Boolean);
                                                
                                                if (fields.length === 0) {
                                                    message.error('未能从文件中提取到字段名');
                                                    return false;
                                                }
                                                
                                                setTargetFields(fields.join('\n'));
                                                message.success(`已导入 ${fields.length} 个目标字段名`);
                                            } catch (err) {
                                                message.error(`导入失败: ${(err as Error).message}`);
                                            }
                                            return false;
                                        }}
                                    >
                                        <Button icon={<UploadOutlined />}>选择模板文件</Button>
                                        <span className="ml-2 text-xs text-gray-400">
                                            上传 Excel/CSV 模板，自动提取参数名列
                                        </span>
                                    </Upload>
                                )
                            }
                        ]}
                    />
                    {targetFields && (
                        <div className="mt-2 text-xs text-gray-500">
                            当前已有 {targetFields.split(/[,，\n]+/).filter(s => s.trim()).length} 个目标字段
                        </div>
                    )}
                    <Button 
                        type="primary" 
                        className="mt-3" 
                        onClick={handleOrganize}
                        disabled={vehicleDataList.length === 0 || !targetFields.trim()}
                    >
                        开始整理
                    </Button>
                </Card>
                
                {/* 步骤3: 结果展示 */}
                {organizedData.length > 0 && (
                    <Card 
                        title={`整理结果 (${organizedData.length} 个字段 × ${vehicleDataList.length} 个车型)`}
                        size="small"
                        extra={
                            <Button type="primary" icon={<DownloadOutlined />} onClick={handleExport}>
                                导出 CSV
                            </Button>
                        }
                    >
                        <Table
                            columns={columns}
                            dataSource={organizedData}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            size="small"
                            bordered
                        />
                    </Card>
                )}
                
                {vehicleDataList.length > 0 && organizedData.length === 0 && (
                    <Empty description={'请输入目标字段名并点击"开始整理"'} />
                )}
            </div>
        </Spin>
    );
};

export default MultiVehicleOrganizer;
