import React, { useMemo } from 'react';
import { Select, Tag, Space, Button, Tooltip } from 'antd';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { getProductOptions } from '../../store/vehicleSelectors';
import { SelectOutlined, ClearOutlined } from '@ant-design/icons';
import { buildVehicleOptionLabel } from '../../utils/vehicleInstance';

interface ProductSourceSelectorProps {
    value: string | string[] | null;
    onChange: (value: any) => void;
    mode?: 'multiple' | 'single';
    placeholder?: string;
    style?: React.CSSProperties;
    showTags?: boolean;
}

/**
 * ProductSourceSelector - 统一的车型选择模组
 * 职责：
 * 1. 自动聚合展示 Excel (uploadedFiles) 和 资产库 (assetFiles) 的所有车型。
 * 2. 支持单选 (SmartFill) 和多选 (Compare/MultiVehicle) 模式。
 * 3. 统一各业务模块的数据源选取 UI。
 */
const ProductSourceSelector: React.FC<ProductSourceSelectorProps> = ({ 
    value, 
    onChange, 
    mode = 'multiple', 
    placeholder = "请选择车型...",
    style,
    showTags = true
}) => {
    const { 
        uploadedFiles, 
        assetFiles, 
        selectedProductNames 
    } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        assetFiles: state.assetFiles,
        selectedProductNames: state.selectedProductNames
    })));

    // 聚合两路数据源生成的下拉选项
    const productOptions = useMemo(() => {
        return getProductOptions(uploadedFiles, selectedProductNames, assetFiles);
    }, [uploadedFiles, selectedProductNames, assetFiles]);

    const handleSelectAll = () => {
        if (mode === 'multiple') {
            const allValues = productOptions.map(opt => opt.value);
            onChange(allValues);
        }
    };

    const handleClear = () => {
        onChange(mode === 'multiple' ? [] : null);
    };

    return (
        <div className="flex flex-col gap-2" style={style}>
            <div className="flex items-center justify-between gap-2">
                <Select
                    mode={mode === 'multiple' ? 'multiple' : undefined}
                    style={{ flex: 1 }}
                    placeholder={productOptions.length > 0 ? placeholder : "请先在数据池激活车型"}
                    options={productOptions}
                    value={value as any}
                    onChange={onChange}
                    disabled={productOptions.length === 0}
                    showSearch
                    maxTagCount={0}
                    maxTagPlaceholder={() => (
                        <span className="text-gray-400 text-xs italic">已选 {value && Array.isArray(value) ? value.length : 0} 个车型</span>
                    )}
                    filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                />
                
                {mode === 'multiple' && (
                    <Space size={4}>
                        <Tooltip title="选中当前工作集所有车型">
                            <Button 
                                size="small" 
                                icon={<SelectOutlined />} 
                                onClick={handleSelectAll}
                                disabled={productOptions.length === 0}
                            />
                        </Tooltip>
                        <Tooltip title="清空选择">
                            <Button 
                                size="small" 
                                icon={<ClearOutlined />} 
                                onClick={handleClear}
                                disabled={!value || (Array.isArray(value) && value.length === 0)}
                            />
                        </Tooltip>
                    </Space>
                )}
            </div>

            {showTags && mode === 'multiple' && (
                <div className="flex flex-wrap gap-1 mt-1 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-md border border-gray-100 dark:border-gray-700 min-h-[42px] max-h-[120px] overflow-y-auto">
                    {Array.isArray(value) && value.length > 0 ? (
                        value.map(name => (
                            <Tag 
                                key={name} 
                                closable 
                                className="m-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-sm text-[12px]"
                                onClose={() => onChange(value.filter(v => v !== name))}
                            >
                                {buildVehicleOptionLabel(name)}
                            </Tag>
                        ))
                    ) : (
                        <span className="text-gray-400 text-xs self-center">暂未选择车型</span>
                    )}
                </div>
            )}
        </div>
    );
};

export default ProductSourceSelector;
