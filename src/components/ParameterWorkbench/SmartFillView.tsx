import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, message, Segmented, Space, Alert, Upload, Select } from 'antd';
import { ClearOutlined, InfoCircleOutlined, UploadOutlined } from '@ant-design/icons';
import { getFieldGroupsSync } from '../../utils/fieldLists';
import * as XLSX from 'xlsx';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import ProductSourceSelector from './ProductSourceSelector';
import { findMatches } from '../../utils/matcher';
import MatchResultTable from '../SmartFiller/MatchResultTable';
import BidPullView from './BidPullView';
import MultiVehicleView from './MultiVehicleView';
import { getVehicleSelectionState } from '../../utils/vehicleSelectionState';


const { TextArea } = Input;

interface SmartFillViewProps {
    onGoRepair?: () => void;
}

const SmartFillView: React.FC<SmartFillViewProps> = ({ onGoRepair }) => {
    const { 
        uploadedFiles, 
        setMatchResults, 
        matchResults, 
        selectedProductNames,
        smartFillRequirements: requirementsText,
        setSmartFillRequirements: setRequirementsText,
        referenceProduct,
        setReferenceProduct,
        assetFiles,
        activeAssets,
        fieldGroupsVersion,
        smartFillMode,
        setSmartFillMode
    } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        setMatchResults: state.setMatchResults,
        matchResults: state.matchResults,
        selectedProductNames: state.selectedProductNames,
        smartFillRequirements: state.smartFillRequirements,
        setSmartFillRequirements: state.setSmartFillRequirements,
        referenceProduct: state.currentSmartFillProduct,
        setReferenceProduct: state.setSmartFillProduct,
        assetFiles: state.assetFiles,
        activeAssets: state.activeAssets,
        fieldGroupsVersion: state.fieldGroupsVersion,
        smartFillMode: state.smartFillMode,
        setSmartFillMode: state.setSmartFillMode,
    })));
    // 自动清理：已在主工作区中移除的车型，同步清除本模块参考车型
    useEffect(() => {
        if (referenceProduct && !selectedProductNames.includes(referenceProduct)) {
            setReferenceProduct(null);
        }
    }, [selectedProductNames, referenceProduct, setReferenceProduct]);

    const [selectedFieldGroupId, setSelectedFieldGroupId] = useState<string | undefined>(undefined);
    const referenceProductState = useMemo(
        () => referenceProduct ? getVehicleSelectionState(uploadedFiles, referenceProduct, assetFiles, activeAssets) : null,
        [uploadedFiles, referenceProduct, assetFiles, activeAssets]
    );

    // getProductOptions is no longer needed here locally

    // 默认填充：当本模块尚未选择参考车型时，自动选中第一个
    useEffect(() => {
        if (!referenceProduct && selectedProductNames.length > 0) {
            setReferenceProduct(selectedProductNames[0]);
        }
    }, [selectedProductNames]);

    // 当全局选择变化时，重置参考车型
    useEffect(() => {
        if (referenceProduct && !selectedProductNames.includes(referenceProduct)) {
            setReferenceProduct(null);
        }
    }, [selectedProductNames, referenceProduct]);

    // 3. UX 提升: 输入即触发 (Debounce)
    useEffect(() => {
        if (!referenceProduct || !requirementsText.trim()) {
            if (matchResults.length > 0) setMatchResults([]);
            return;
        }
        if (referenceProductState?.status !== 'ready') {
            if (matchResults.length > 0) setMatchResults([]);
            return;
        }

        const timer = setTimeout(() => {
            try {
                const library = referenceProductState.data;
                if (library.length === 0) {
                    setMatchResults([]);
                    return;
                }

                const requirements = requirementsText
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);

                const results = findMatches(requirements, library);
                setMatchResults(results);
            } finally {
                // setLoading is removed
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [referenceProduct, requirementsText, referenceProductState, matchResults.length, setMatchResults]);

    const handleClear = () => {
        setRequirementsText('');
        setMatchResults([]);
    };

    const fieldGroupOptions = useMemo(
        () => getFieldGroupsSync().map((group) => ({ value: group.id, label: group.name })),
        [fieldGroupsVersion]
    );

    const handleApplyFieldGroup = (groupId: string) => {
        const group = getFieldGroupsSync().find((item) => item.id === groupId);
        if (!group) return;
        setSelectedFieldGroupId(groupId);
        setRequirementsText(group.fields.join('\n'));
        message.success(`已导入字段组：${group.name}（${group.fields.length} 项）`);
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex justify-between items-center gap-3 flex-shrink-0">
                <Segmented
                    value={smartFillMode}
                    onChange={(value) => setSmartFillMode(value as 'single' | 'bidPull' | 'freeMulti')}
                    options={[
                        { label: '单车填报', value: 'single' },
                        { label: '多车取数（字段关联）', value: 'bidPull' },
                        { label: '自由多车整理', value: 'freeMulti' },
                    ]}
                />
                {smartFillMode === 'single' && (
                    <span className="text-xs text-3">多车取数：先在方案里把投标字段关联到系统字段，再一键拉取多车型参数</span>
                )}
                {smartFillMode === 'freeMulti' && (
                    <span className="text-xs text-3">粘贴目标字段即可横向整理多车型参数，无需预先配置方案</span>
                )}
            </div>
            {smartFillMode === 'bidPull' ? (
                <BidPullView onGoRepair={onGoRepair} />
            ) : smartFillMode === 'freeMulti' ? (
                <MultiVehicleView onGoRepair={onGoRepair} />
            ) : (
            <>
            {/* 提示信息 */}
            {selectedProductNames.length === 0 && (
                <Alert
                    message="请先在资产管理中选择车型"
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                />
            )}
            {referenceProductState?.status === 'pending' && (
                <Alert
                    message="参考车型数据正在同步，完成后会自动开始匹配"
                    type="info"
                    showIcon
                />
            )}
            
            <Card className="shadow-sm flex-shrink-0" size="small">
                <Space direction="vertical" className="w-full">
                    <div className="flex items-start gap-4">
                        <div className="flex-1">
                            <div className="mb-2 font-medium">1. 选择参考车型 (数据来源)</div>
                            <ProductSourceSelector 
                                mode="single"
                                value={referenceProduct}
                                onChange={setReferenceProduct}
                                placeholder={selectedProductNames.length > 0 ? "选择参考车型" : "请先在资产管理中激活车型"}
                                showTags={false}
                            />
                        </div>
                        <div className="flex-[2]">
                            <div className="mb-2 font-medium flex items-center gap-3">
                                2. 输入需求参数列表 (每行一个)
                                <a
                                    className="text-xs font-normal text-brand"
                                    onClick={() => setRequirementsText("整备质量\n最高车速\n轴距\n外形尺寸长\n外形尺寸宽\n外形尺寸高\n轮胎规格\n发动机型号")}
                                >
                                    填入示例
                                </a>
                                <Select
                                    size="small"
                                    value={selectedFieldGroupId}
                                    onChange={handleApplyFieldGroup}
                                    options={fieldGroupOptions}
                                    placeholder="字段配置组"
                                    allowClear
                                    className="min-w-[180px]"
                                />
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
                                    <a className="text-xs font-normal text-brand"><UploadOutlined /> 从文件导入</a>
                                </Upload>
                            </div>
                            <TextArea 
                                rows={3} 
                                value={requirementsText}
                                onChange={e => setRequirementsText(e.target.value)}
                                placeholder="粘贴参数名列表，例如：&#10;整备质量&#10;最高车速&#10;..." 
                            />
                        </div>
                        <div className="flex flex-col gap-2 mt-8">
                            <Button icon={<ClearOutlined />} onClick={handleClear}>
                                清空内容
                            </Button>
                        </div>
                    </div>
                </Space>
            </Card>

            <div className="flex-1 overflow-auto">
                {matchResults.length > 0 && <MatchResultTable productName={referenceProduct} onGoRepair={onGoRepair} />}
            </div>
            </>
            )}
        </div>
    );
};

export default SmartFillView;
