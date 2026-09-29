import React, { useState, useMemo } from 'react';
import { Upload, Button, Table, Card, Statistic, Row, Col, Empty, message } from 'antd';
import { UploadOutlined, DownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import type { ColumnsType } from 'antd/es/table';
import * as XLSX from 'xlsx';
import { readWorkbookFromBufferAsync } from '../../utils/excelParserAsync';
import { downloadCsv } from '../../utils/downloadCsv';

interface AttributeRow {
    key: string;
    name: string;
    required: string;
}

const AttributeDedup: React.FC = () => {
    const [rawData, setRawData] = useState<Array<Record<string, unknown>>>([]);
    const [fileName, setFileName] = useState<string>('');

    // 去重后的数据
    const dedupedData = useMemo<AttributeRow[]>(() => {
        const uniqueMap = new Map<string, string>();
        rawData.forEach((row) => {
            const name = row['属性名称'] as string;
            if (name && !uniqueMap.has(name)) {
                uniqueMap.set(name, (row['是否必填'] as string) || '');
            }
        });
        return Array.from(uniqueMap.entries()).map(([name, required], index) => ({
            key: `${index}`,
            name,
            required,
        }));
    }, [rawData]);

    // 处理文件上传
    const handleUpload = (file: UploadFile) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const buffer = e.target?.result as ArrayBuffer;
                // Worker 线程解析，避免大文件 XLSX.read 阻塞 UI
                const workbook = await readWorkbookFromBufferAsync(buffer);
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
                
                if (!jsonData.length) {
                    message.error('文件内容为空');
                    return;
                }

                // 检查必要列是否存在
                const firstRow = jsonData[0];
                if (!('属性名称' in firstRow)) {
                    message.error('文件缺少「属性名称」列');
                    return;
                }

                setRawData(jsonData);
                setFileName(file.name || 'uploaded.xlsx');
                message.success(`成功解析 ${jsonData.length} 条数据`);
            } catch (err) {
                console.error(err);
                message.error('文件解析失败，请确保是有效的Excel文件');
            }
        };
        reader.readAsArrayBuffer(file as unknown as Blob);
        return false; // 阻止自动上传
    };

    // 导出CSV
    const handleExport = () => {
        if (!dedupedData.length) {
            message.warning('暂无数据可导出');
            return;
        }

        const header = '属性名称,是否必填';
        const rows = dedupedData.map((item) => 
            `"${item.name.replace(/"/g, '""')}","${item.required.replace(/"/g, '""')}"`
        );
        const csvContent = [header, ...rows].join('\n');
        
        const outputName = fileName.replace(/\.(xlsx|xls)$/i, '_去重.csv') || '属性去重结果.csv';
        downloadCsv(csvContent, outputName);
    };

    // 清空数据
    const handleClear = () => {
        setRawData([]);
        setFileName('');
    };

    const columns: ColumnsType<AttributeRow> = [
        {
            title: '序号',
            dataIndex: 'key',
            key: 'index',
            width: 80,
            render: (_: unknown, __: AttributeRow, index: number) => index + 1,
        },
        {
            title: '属性名称',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
        },
        {
            title: '是否必填',
            dataIndex: 'required',
            key: 'required',
            width: 120,
            filters: [
                { text: '是', value: '是' },
                { text: '否', value: '否' },
            ],
            onFilter: (value: boolean | React.Key, record: AttributeRow) => record.required === value,
            render: (text: string) => (
                <span style={{ color: text === '是' ? 'var(--success)' : 'var(--text-3)' }}>
                    {text || '-'}
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            {/* 页面标题 */}
            <div>
                <h2 className="text-xl font-bold mb-2">商品属性数据去重</h2>
                <p className="text-3">
                    上传属性池Excel文件，按「属性名称」去重后导出「属性名称、是否必填」两列CSV
                </p>
            </div>

            {/* 操作区域 */}
            <Card>
                <div className="flex items-center gap-4 flex-wrap">
                    <Upload
                        accept=".xlsx,.xls"
                        showUploadList={false}
                        beforeUpload={handleUpload}
                    >
                        <Button icon={<UploadOutlined />} type="primary">
                            上传Excel文件
                        </Button>
                    </Upload>

                    {fileName && (
                        <span className="text-3">
                            当前文件：<strong>{fileName}</strong>
                        </span>
                    )}

                    <div className="flex-1" />

                    {rawData.length > 0 && (
                        <>
                            <Button 
                                icon={<DownloadOutlined />} 
                                onClick={handleExport}
                                type="primary"
                                ghost
                            >
                                导出CSV
                            </Button>
                            <Button 
                                icon={<DeleteOutlined />} 
                                onClick={handleClear}
                                danger
                            >
                                清空
                            </Button>
                        </>
                    )}
                </div>
            </Card>

            {/* 统计信息 */}
            {rawData.length > 0 && (
                <Row gutter={16}>
                    <Col span={8}>
                        <Card>
                            <Statistic 
                                title="原始数据条数" 
                                value={rawData.length} 
                                suffix="条"
                            />
                        </Card>
                    </Col>
                    <Col span={8}>
                        <Card>
                            <Statistic 
                                title="去重后条数" 
                                value={dedupedData.length} 
                                suffix="条"
                                valueStyle={{ color: 'var(--success)' }}
                            />
                        </Card>
                    </Col>
                    <Col span={8}>
                        <Card>
                            <Statistic 
                                title="去除重复" 
                                value={rawData.length - dedupedData.length} 
                                suffix="条"
                                valueStyle={{ color: 'var(--danger)' }}
                            />
                        </Card>
                    </Col>
                </Row>
            )}

            {/* 数据预览表格 */}
            {dedupedData.length > 0 ? (
                <Card title="去重结果预览">
                    <Table
                        columns={columns}
                        dataSource={dedupedData}
                        pagination={{ 
                            pageSize: 20,
                            showSizeChanger: true,
                            showQuickJumper: true,
                            showTotal: (total) => `共 ${total} 条`
                        }}
                        size="small"
                        scroll={{ y: 500 }}
                    />
                </Card>
            ) : (
                <Card>
                    <Empty 
                        description="请上传属性池Excel文件" 
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                </Card>
            )}
        </div>
    );
};

export default AttributeDedup;
