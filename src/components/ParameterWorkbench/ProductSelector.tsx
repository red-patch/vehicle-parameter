import React, { useMemo, useState } from 'react';
import { Checkbox, Empty, Tag, Tooltip, Dropdown, Input } from 'antd';
import { CarOutlined, WarningOutlined, CheckCircleOutlined, CloseCircleOutlined, MoreOutlined, EditOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { calculateAllProductConfidences, type ProductConfidence } from '../../utils/productConfidence';

const ProductSelector: React.FC = () => {
    const { 
        uploadedFiles, 
        selectedProductNames, 
        setSelectedProductNames,
        confirmedProducts,
        excludedProducts,
        confirmProduct,
        excludeProduct,
        resetProductStatus,
        renameProduct
    } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        selectedProductNames: state.selectedProductNames,
        setSelectedProductNames: state.setSelectedProductNames,
        confirmedProducts: state.confirmedProducts,
        excludedProducts: state.excludedProducts,
        confirmProduct: state.confirmProduct,
        excludeProduct: state.excludeProduct,
        resetProductStatus: state.resetProductStatus,
        renameProduct: state.renameProduct
    })));

    const [editingName, setEditingName] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    // 计算所有产品及其置信度
    const productsWithConfidence = useMemo(() => {
        const products: { name: string; fileName: string; paramCount: number }[] = [];
        
        uploadedFiles.forEach(file => {
            const fileProducts = new Map<string, number>();
            file.data.forEach(p => {
                const pName = p.productName || file.fileName;
                fileProducts.set(pName, (fileProducts.get(pName) || 0) + 1);
            });

            fileProducts.forEach((count, name) => {
                products.push({ name, fileName: file.fileName, paramCount: count });
            });
        });
        
        // 计算置信度并排序
        const withConfidence = calculateAllProductConfidences(
            products.map(p => ({ name: p.name, paramCount: p.paramCount }))
        );
        
        // 合并文件信息
        return withConfidence.map(pc => ({
            ...pc,
            fileName: products.find(p => p.name === pc.name)?.fileName || ''
        }));
    }, [uploadedFiles]);

    // 过滤掉已排除的产品用于显示
    const visibleProducts = useMemo(() => {
        return productsWithConfidence.filter(p => !excludedProducts.includes(p.name));
    }, [productsWithConfidence, excludedProducts]);

    const handleToggle = (name: string, checked: boolean) => {
        if (checked) {
            setSelectedProductNames([...selectedProductNames, name]);
        } else {
            setSelectedProductNames(selectedProductNames.filter(n => n !== name));
        }
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            // 只选择高/中置信度或已确认的产品
            const validProducts = visibleProducts.filter(p => 
                p.level !== 'low' || confirmedProducts.includes(p.name)
            );
            setSelectedProductNames(validProducts.map(p => p.name));
        } else {
            setSelectedProductNames([]);
        }
    };

    const getConfidenceTag = (product: ProductConfidence) => {
        const isConfirmed = confirmedProducts.includes(product.name);
        
        if (isConfirmed) {
            return <Tag color="green" icon={<CheckCircleOutlined />} className="text-xs">已确认</Tag>;
        }
        
        switch (product.level) {
            case 'high':
                return null; // 高置信度不显示标签
            case 'medium':
                return <Tag color="orange" className="text-xs">待确认</Tag>;
            case 'low':
                return (
                    <Tooltip title={product.reason || '可能不是有效车型'}>
                        <Tag color="red" icon={<WarningOutlined />} className="text-xs">低置信</Tag>
                    </Tooltip>
                );
        }
    };

    const getDropdownMenu = (product: ProductConfidence): MenuProps['items'] => {
        const isConfirmed = confirmedProducts.includes(product.name);
        
        return [
            {
                key: 'rename',
                label: '重命名',
                icon: <EditOutlined />,
                onClick: () => {
                    setEditingName(product.name);
                    setEditValue(product.name);
                }
            },
            {
                key: 'confirm',
                label: isConfirmed ? '取消确认' : '确认为有效车型',
                icon: <CheckCircleOutlined />,
                onClick: () => isConfirmed ? resetProductStatus(product.name) : confirmProduct(product.name)
            },
            {
                key: 'exclude',
                label: '排除此项',
                icon: <CloseCircleOutlined />,
                danger: true,
                onClick: () => excludeProduct(product.name)
            }
        ];
    };

    if (uploadedFiles.length === 0) {
        return (
            <div className="h-full flex flex-col bg-white rounded-lg border border-gray-200">
                <div className="p-3 border-b border-gray-100">
                    <span className="text-sm font-medium text-gray-700">车型选择</span>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <Empty description="请先添加参数文件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
            </div>
        );
    }

    const selectedCount = selectedProductNames.filter(n => visibleProducts.some(p => p.name === n)).length;

    return (
        <div className="h-full flex flex-col bg-white rounded-lg border border-gray-200">
            <div className="p-3 border-b border-gray-100 flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">
                    车型选择 <span className="text-gray-400">({selectedCount}/{visibleProducts.length})</span>
                </span>
                <Checkbox 
                    checked={visibleProducts.length > 0 && selectedCount === visibleProducts.length}
                    indeterminate={selectedCount > 0 && selectedCount < visibleProducts.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                >
                    <span className="text-xs text-gray-500">全选</span>
                </Checkbox>
            </div>
            
            <div className="flex-1 overflow-y-auto">
                {visibleProducts.map((item) => (
                    <div
                        key={item.name}
                        className={`flex items-center gap-2 px-3 py-2 border-l-2 transition-colors ${
                            selectedProductNames.includes(item.name) 
                                ? 'bg-blue-50 border-blue-500' 
                                : 'border-transparent hover:bg-gray-50'
                        }`}
                    >
                        <Checkbox 
                            checked={selectedProductNames.includes(item.name)}
                            onChange={(e) => handleToggle(item.name, e.target.checked)}
                        />
                        <CarOutlined className={selectedProductNames.includes(item.name) ? 'text-blue-500' : 'text-gray-400'} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                {editingName === item.name ? (
                                    <Input
                                        size="small"
                                        value={editValue}
                                        autoFocus
                                        onChange={e => setEditValue(e.target.value)}
                                        onPressEnter={() => {
                                            const v = editValue.trim();
                                            if (v && v !== item.name) renameProduct(item.name, v);
                                            setEditingName(null);
                                        }}
                                        onBlur={() => {
                                            const v = editValue.trim();
                                            if (v && v !== item.name) renameProduct(item.name, v);
                                            setEditingName(null);
                                        }}
                                        style={{ width: 120 }}
                                    />
                                ) : (
                                    <span className="text-sm text-gray-800 truncate">{item.name}</span>
                                )}
                                {getConfidenceTag(item)}
                            </div>
                            <div className="text-xs text-gray-400">{item.paramCount} 参数</div>
                        </div>
                        <Dropdown menu={{ items: getDropdownMenu(item) }} trigger={['click']}>
                            <MoreOutlined className="text-gray-400 hover:text-gray-600 cursor-pointer" />
                        </Dropdown>
                    </div>
                ))}
                
                {/* 显示已排除的产品数量 */}
                {excludedProducts.length > 0 && (
                    <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
                        已排除 {excludedProducts.length} 项 
                        <span 
                            className="text-blue-500 ml-1 cursor-pointer hover:underline"
                            onClick={() => excludedProducts.forEach(name => resetProductStatus(name))}
                        >
                            恢复全部
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductSelector;
