import React, { useState, useMemo, useEffect } from 'react';
import { Card, Select, Button, Input, message, Space, Alert, Upload } from 'antd';
import { RocketOutlined, ClearOutlined, InfoCircleOutlined, UploadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { useVehicleStore } from '../../store/vehicleStore';
import { findMatches } from '../../utils/matcher';
import MatchResultTable from '../SmartFiller/MatchResultTable';
import type { VehicleParameter } from '../../types';


const { TextArea } = Input;


const SmartFillView: React.FC = () => {
    const { uploadedFiles, setMatchResults, matchResults, selectedProductNames } = useVehicleStore();
    const [referenceProduct, setReferenceProduct] = useState<string | null>(null);
    const [requirementsText, setRequirementsText] = useState('');
    const [loading, setLoading] = useState(false);

    // 从全局选中的车型生成选项
    const productOptions = useMemo(() => {
        const options: { label: string; value: string }[] = [];
        const globalSelected = new Set(selectedProductNames);
        
        uploadedFiles.forEach(file => {
            const fileProducts = new Set<string>();
            file.data.forEach(p => fileProducts.add(p.productName || file.fileName));
            fileProducts.forEach(name => {
                if (globalSelected.has(name)) {
                    options.push({ label: name, value: name });
                }
            });
        });
        return options;
    }, [uploadedFiles, selectedProductNames]);

    // 当全局选择变化时，重置参考车型
    useEffect(() => {
        if (referenceProduct && !selectedProductNames.includes(referenceProduct)) {
            setReferenceProduct(null);
        }
    }, [selectedProductNames, referenceProduct]);

    // 切换参考车型时自动重新匹配
    useEffect(() => {
        if (!referenceProduct || !requirementsText.trim() || matchResults.length === 0) return;

        const library = getProductParams(referenceProduct);
        if (library.length === 0) return;

        const requirements = requirementsText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        const results = findMatches(requirements, library);
        setMatchResults(results);
    }, [referenceProduct]);

    // Helper to get params for a product
    const getProductParams = (productName: string): VehicleParameter[] => {
        for (const file of uploadedFiles) {
            const params: VehicleParameter[] = [];
            let found = false;
            file.data.forEach(p => {
                const pName = p.productName || file.fileName;
                if (pName === productName) {
                    params.push(p);
                    found = true;
                }
            });
            if (found) return params;
        }
        return [];
    };

    const handleMatch = () => {
        if (!referenceProduct) {
            message.warning('请选择参考车型');
            return;
        }
        if (!requirementsText.trim()) {
            message.warning('请输入需求参数列表');
            return;
        }

        setLoading(true);
        try {
            // 1. Get Params
            const library = getProductParams(referenceProduct);
            if (library.length === 0) {
                message.error('未找到参考车型的参数数据');
                return;
            }

            // 2. Parse Requirements
            const requirements = requirementsText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            // 3. Run Matching
            const results = findMatches(requirements, library);
            setMatchResults(results);
            message.success(`匹配完成，共 ${results.length} 项`);
        } catch (error) {
            console.error(error);
            message.error('匹配失败');
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        setMatchResults([]);
        setRequirementsText('');
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* 提示信息 */}
            {selectedProductNames.length === 0 && (
                <Alert
                    message="请先在左侧数据池中选择车型"
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                />
            )}
            
            <Card className="shadow-sm flex-shrink-0">
                <Space direction="vertical" className="w-full">
                    <div className="flex items-start gap-4">
                        <div className="flex-1">
                            <div className="mb-2 font-medium">1. 选择参考车型 (数据来源)</div>
                            <Select
                                style={{ width: '100%' }}
                                placeholder={selectedProductNames.length > 0 ? "选择参考车型" : "请先在数据池中选择车型"}
                                options={productOptions}
                                value={referenceProduct}
                                onChange={setReferenceProduct}
                                disabled={selectedProductNames.length === 0}
                                showSearch
                            />
                        </div>
                        <div className="flex-[2]">
                            <div className="mb-2 font-medium flex items-center gap-3">
                                2. 输入需求参数列表 (每行一个)
                                <a 
                                    className="text-xs font-normal text-blue-500" 
                                    onClick={() => setRequirementsText("整备质量\n最高车速\n轴距\n外形尺寸长\n外形尺寸宽\n外形尺寸高\n轮胎规格\n发动机型号")}
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
                                            setRequirementsText(fields.join('\n'));
                                            message.success(`已导入 ${fields.length} 个字段`);
                                        } catch (err) { message.error(`导入失败: ${(err as Error).message}`); }
                                        return false;
                                    }}
                                >
                                    <a className="text-xs font-normal text-blue-500"><UploadOutlined /> 从文件导入</a>
                                </Upload>
                            </div>
                            <TextArea 
                                rows={4} 
                                value={requirementsText}
                                onChange={e => setRequirementsText(e.target.value)}
                                placeholder="粘贴参数名列表，例如：&#10;整备质量&#10;最高车速&#10;..." 
                            />
                        </div>
                        <div className="flex flex-col gap-2 mt-8">
                            <Button type="primary" icon={<RocketOutlined />} onClick={handleMatch} loading={loading}>
                                开始匹配
                            </Button>
                            <Button icon={<ClearOutlined />} onClick={handleClear}>
                                清空
                            </Button>
                        </div>
                    </div>
                </Space>
            </Card>

            <div className="flex-1 overflow-auto">
                {matchResults.length > 0 && <MatchResultTable productName={referenceProduct} />}
            </div>
        </div>
    );
};

export default SmartFillView;
