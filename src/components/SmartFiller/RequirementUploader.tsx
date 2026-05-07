import React, { useState } from 'react';
import { Upload, Card, Typography, Spin, message, Button, Select, Tabs, Input } from 'antd';
import { UploadOutlined, FileExcelOutlined, FileTextOutlined, HistoryOutlined } from '@ant-design/icons';
import { parseRequirementAsync } from '../../utils/excelParserAsync';
import { useVehicleStore } from '../../store/vehicleStore';
import { findMatches } from '../../utils/matcher';
import type { MatchItem } from '../../types';
import * as XLSX from 'xlsx';

const { Text } = Typography;
const { Dragger } = Upload;

const RequirementUploader: React.FC = () => {
    const { setRequirementFile, setMatchResults, requirementFile, baseFile, selectedProduct, setSelectedProduct } = useVehicleStore();
    const [loading, setLoading] = useState(false);
    const [textInput, setTextInput] = useState('');
    const [activeTab, setActiveTab] = useState('file');

    // Compute available products from baseFile
    const productOptions = React.useMemo(() => {
        if (!baseFile?.data) return [];
        const products = Array.from(new Set(baseFile.data.map(p => p.productName).filter(Boolean)));
        return products.map(p => ({ label: p, value: p }));
    }, [baseFile]);

    const handleTextSubmit = () => {
        if (!textInput.trim()) {
            message.warning('请输入参数名称');
            return;
        }

        if (!baseFile) {
            message.error('请先在"差异比对"页面上传基准版本作为参数库');
            return;
        }

        setLoading(true);
        try {
            // Split by comma (English/Chinese) or newline
            const params = textInput.split(/[,，\n]+/).map(s => s.trim()).filter(Boolean);
            
            if (params.length === 0) {
                 message.warning('未识别到有效参数');
                 setLoading(false);
                 return;
            }

            // Create Virtual SheetData
            const virtualData = {
                fileName: '手动输入 (Manual Input)',
                rawHeaders: ['手动参数'],
                data: params.map((p, idx) => ({
                    id: `MANUAL_${idx}`,
                    group: 'Manual',
                    name: p,
                    value: '',
                    originSheet: 'Input'
                }))
            };

            setRequirementFile(virtualData);

            // Trigger Matching Logic (Same as File Upload)
            let searchScope = baseFile.data;
            if (selectedProduct) {
                searchScope = baseFile.data.filter(p => p.productName === selectedProduct);
            }

            const matches = findMatches(params, searchScope);
            setMatchResults(matches);
            message.success(`已识别并匹配 ${matches.length} 个参数`);

        } catch (error) {
            message.error('处理失败');
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (file: File) => {
        setLoading(true);
        try {
            if (!baseFile) {
                message.error('请先在"差异比对"页面上传基准版本作为参数库');
                setLoading(false);
                return false;
            }

            const data = await parseRequirementAsync(file);
            setRequirementFile(data);

            // Trigger Matching with Filtering
            const requirements = data.data.map(p => p.name).filter(n => n);

            // Filter base data by selected product if one is chosen
            let searchScope = baseFile.data;
            if (selectedProduct) {
                searchScope = baseFile.data.filter(p => p.productName === selectedProduct);
            }

            const matches = findMatches(requirements, searchScope);
            setMatchResults(matches);

            message.success(`需求文件解析成功，已自动匹配 ${matches.length} 个字段`);
        } catch (error) {
            console.error(error);
            message.error(`解析失败: ${(error as Error).message}`);
        } finally {
            setLoading(false);
        }
        return false;
    };

    // 导入历史CSV：从之前导出的CSV恢复编辑状态
    const handleImportHistory = async (file: File) => {
        setLoading(true);
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (rows.length < 2) {
                message.error('CSV文件为空或格式错误');
                setLoading(false);
                return false;
            }

            // 解析表头
            const headers = rows[0];
            const reqNameIdx = headers.findIndex(h => h?.includes('需求参数'));
            const valueIdx = headers.findIndex(h => h?.includes('填报值'));
            const statusIdx = headers.findIndex(h => h?.includes('状态'));

            if (reqNameIdx === -1 || valueIdx === -1) {
                message.error('CSV格式错误：缺少"需求参数名"或"填报值"列');
                setLoading(false);
                return false;
            }

            // 解析数据行，恢复为MatchItem
            const matchItems: MatchItem[] = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || !row[reqNameIdx]) continue;

                const requirementName = String(row[reqNameIdx]).trim();
                const fillValue = row[valueIdx] !== undefined ? String(row[valueIdx]).trim() : '';
                const status = statusIdx !== -1 && row[statusIdx] ? String(row[statusIdx]).trim() : '';
                const isManual = status.includes('手动');

                matchItems.push({
                    id: `HISTORY_${i}`,
                    requirementName,
                    matchedParam: null, // 不重新匹配，仅恢复填报值
                    confidence: 1,
                    isManual: isManual || fillValue !== '',
                    manualValue: fillValue || undefined
                });
            }

            if (matchItems.length === 0) {
                message.error('未能从CSV中解析出有效数据');
                setLoading(false);
                return false;
            }

            // 创建虚拟SheetData用于显示
            const virtualData = {
                fileName: `历史导入: ${file.name}`,
                rawHeaders: ['导入参数'],
                data: matchItems.map(m => ({
                    id: m.id,
                    group: 'History',
                    name: m.requirementName,
                    value: m.manualValue || '',
                    originSheet: 'Import'
                }))
            };

            setRequirementFile(virtualData);
            setMatchResults(matchItems);
            message.success(`已恢复 ${matchItems.length} 个字段的编辑状态`);

        } catch (error) {
            console.error(error);
            message.error(`导入失败: ${(error as Error).message}`);
        } finally {
            setLoading(false);
        }
        return false;
    };

    if (requirementFile) {
        return (
            <div className="flex flex-col items-center justify-center py-6 bg-blue-50 rounded border border-blue-200 mb-6">
                <FileExcelOutlined className="text-4xl text-blue-600 mb-2" />
                <Text strong>{requirementFile.fileName}</Text>
                <Text type="secondary">{requirementFile.data.length} 个需求字段</Text>
                <Button
                    type="link"
                    danger
                    onClick={() => {
                        setRequirementFile(null!);
                        setMatchResults([]);
                    }}
                >
                    清除并重新上传
                </Button>
            </div>
        );
    }

    const renderFileUploader = () => (
        <Dragger
            name="file"
            accept=".xlsx,.xls,.csv"
            showUploadList={false}
            beforeUpload={handleUpload}
            disabled={loading}
            className="bg-gray-50 hover:bg-gray-100 transition-colors"
        >
            <p className="ant-upload-drag-icon">
                <UploadOutlined className="text-blue-500" />
            </p>
            <p className="ant-upload-text">点击或拖拽招标文件到此区域</p>
            <p className="ant-upload-hint">将自动提取"参数名"列并与参数库进行模糊匹配</p>
        </Dragger>
    );

    const renderTextInput = () => (
        <div className="flex flex-col gap-4 py-4">
            <Input.TextArea 
                rows={6} 
                placeholder="在此输入参数名称，支持批量输入。&#10;分隔符支持：逗号(,)，中文逗号(，)，或换行符。"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                className="text-base"
            />
            <Button type="primary" onClick={handleTextSubmit} loading={loading} icon={<FileTextOutlined />}>
                开始匹配 (Match Parameters)
            </Button>
        </div>
    );

    const renderHistoryImport = () => (
        <Dragger
            name="file"
            accept=".csv,.xlsx,.xls"
            showUploadList={false}
            beforeUpload={handleImportHistory}
            disabled={loading}
            className="bg-green-50 hover:bg-green-100 transition-colors"
        >
            <p className="ant-upload-drag-icon">
                <HistoryOutlined className="text-green-500" />
            </p>
            <p className="ant-upload-text">导入历史填报文件</p>
            <p className="ant-upload-hint">上传之前导出的CSV文件，恢复编辑状态继续修改</p>
        </Dragger>
    );

    return (
        <Spin spinning={loading} tip="正在解析并匹配...">
            <Card title="上传招标文件 (Requirement Upload)" className="mb-6">
                <div className="mb-4">
                    <p className="mb-2 text-gray-600">选择要匹配的基准车型配置 (可选):</p>
                    <Select
                        style={{ width: '100%' }}
                        placeholder="不选择则匹配所有车型"
                        allowClear
                        options={productOptions}
                        value={selectedProduct}
                        onChange={setSelectedProduct}
                    />
                </div>
                
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        { label: '文件上传', key: 'file', children: renderFileUploader() },
                        { label: '文本输入', key: 'text', children: renderTextInput() },
                        { label: <span><HistoryOutlined /> 导入历史</span>, key: 'history', children: renderHistoryImport() }
                    ]}
                />
            </Card>
        </Spin>
    );
};

export default RequirementUploader;
