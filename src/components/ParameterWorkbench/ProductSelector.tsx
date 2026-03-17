import React, { useMemo, useState } from 'react';
import { Checkbox, Empty, Tag, Tooltip, Dropdown, Input, message } from 'antd';
import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { CarOutlined, WarningOutlined, CheckCircleOutlined, CloseCircleOutlined, MoreOutlined, EditOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { calculateProductConfidence, type ProductConfidence } from '../../utils/productConfidence';
import { buildVehicleDisplayLabels, buildVehicleInstanceKey } from '../../utils/vehicleInstance';

type ProductWithInstance = ProductConfidence & { key: string; fileName: string };

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
        renameSubProduct,
        assetLibraryPath
    } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        selectedProductNames: state.selectedProductNames,
        setSelectedProductNames: state.setSelectedProductNames,
        confirmedProducts: state.confirmedProducts,
        excludedProducts: state.excludedProducts,
        confirmProduct: state.confirmProduct,
        excludeProduct: state.excludeProduct,
        resetProductStatus: state.resetProductStatus,
        renameSubProduct: state.renameSubProduct,
        assetLibraryPath: state.assetLibraryPath
    })));

    const [editingName, setEditingName] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    // 计算所有产品及其置信度
    const productsWithConfidence = useMemo(() => {
        const products: ProductWithInstance[] = [];
        
        uploadedFiles.forEach(file => {
            const fileProducts = new Map<string, number>();
            file.data.forEach(p => {
                const pName = p.productName || file.fileName;
                const key = buildVehicleInstanceKey('excel', file.fileName, pName);
                fileProducts.set(key, (fileProducts.get(key) || 0) + 1);
            });

            fileProducts.forEach((count, key) => {
                const name = key.split('::').slice(2).join('::');
                products.push({
                    ...calculateProductConfidence(name, count),
                    key,
                    fileName: file.fileName,
                });
            });
        });

        return products.sort((a, b) => {
            const levelOrder = { high: 0, medium: 1, low: 2 };
            if (levelOrder[a.level] !== levelOrder[b.level]) {
                return levelOrder[a.level] - levelOrder[b.level];
            }
            return b.confidence - a.confidence;
        });
    }, [uploadedFiles]);

    // 过滤掉已排除的产品用于显示
    const visibleProducts = useMemo(() => {
        return productsWithConfidence.filter(p => !excludedProducts.includes(p.key));
    }, [productsWithConfidence, excludedProducts]);
    const productDisplayLabels = useMemo(
        () => buildVehicleDisplayLabels(visibleProducts.map((product) => product.key)),
        [visibleProducts]
    );

    const handleToggle = (instanceKey: string, checked: boolean) => {
        if (checked) {
            setSelectedProductNames([...selectedProductNames, instanceKey]);
        } else {
            setSelectedProductNames(selectedProductNames.filter(n => n !== instanceKey));
        }
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            // 只选择高/中置信度或已确认的产品
            const validProducts = visibleProducts.filter(p => 
                p.level !== 'low' || confirmedProducts.includes(p.key)
            );
            setSelectedProductNames(validProducts.map(p => p.key));
        } else {
            setSelectedProductNames([]);
        }
    };

    // 核心双层重命名逻辑
    const handleRenameCommit = async (item: { key: string, name: string, fileName: string }, newName: string) => {
        if (!newName || newName === item.name) {
            setEditingName(null);
            return;
        }

        // 1. 修改内存 store (大纲 + 数据体)
        renameSubProduct(item.fileName, item.name, newName);

        // 2. 如果存在资产库并且它是通过加载进来的，尝试反向静态热存储
        if (assetLibraryPath) {
            try {
                const finalFileName = item.fileName.endsWith('.json') ? item.fileName : `${item.fileName}.json`;
                const fullPath = await join(assetLibraryPath, finalFileName);
                
                if (await exists(fullPath)) {
                    // 仅切开目标文件并更换对应型号名称作为热保存
                    const content = await readTextFile(fullPath);
                    const parsed = JSON.parse(content);
                    if (parsed && typeof parsed === 'object') {
                        // 如果刚好和外壳的名称一样，也要一并替换外在特征，否则仅替换明细参数的归属
                        if (parsed.productName === item.name) {
                            parsed.productName = newName;
                        }
                        if (Array.isArray(parsed.parameters)) {
                            parsed.parameters.forEach((p: any) => {
                                if (p.productName === item.name) {
                                    p.productName = newName;
                                }
                            });
                        }
                        await writeTextFile(fullPath, JSON.stringify(parsed, null, 2));
                        message.success(`已反向热保存 ${newName} 至本地资产库`);
                    }
                }
            } catch (err) {
                console.warn('反向热存资产库失败，可能非物理资产(从浏览器导入等):', err);
            }
        }
        
        setEditingName(null);
    };

    const getConfidenceTag = (product: ProductWithInstance) => {
        const isConfirmed = confirmedProducts.includes(product.key);
        
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

    const getDropdownMenu = (product: ProductWithInstance): MenuProps['items'] => {
        const isConfirmed = confirmedProducts.includes(product.key);
        
        return [
            {
                key: 'rename',
                label: '重命名',
                icon: <EditOutlined />,
                onClick: () => {
                    setEditingName(product.key);
                    setEditValue(product.name);
                }
            },
            {
                key: 'confirm',
                label: isConfirmed ? '取消确认' : '确认为有效车型',
                icon: <CheckCircleOutlined />,
                onClick: () => isConfirmed ? resetProductStatus(product.key) : confirmProduct(product.key)
            },
            {
                key: 'exclude',
                label: '排除此项',
                icon: <CloseCircleOutlined />,
                danger: true,
                onClick: () => excludeProduct(product.key)
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

    const selectedCount = selectedProductNames.filter(n => visibleProducts.some(p => p.key === n)).length;

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
                        key={item.key}
                        className={`flex items-center gap-2 px-3 py-2 border-l-2 transition-colors ${
                            selectedProductNames.includes(item.key) 
                                ? 'bg-blue-50 border-blue-500' 
                                : 'border-transparent hover:bg-gray-50'
                        }`}
                    >
                        <Checkbox 
                            checked={selectedProductNames.includes(item.key)}
                            onChange={(e) => handleToggle(item.key, e.target.checked)}
                        />
                        <CarOutlined className={selectedProductNames.includes(item.key) ? 'text-blue-500' : 'text-gray-400'} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                {editingName === item.key ? (
                                    <Input
                                        size="small"
                                        value={editValue}
                                        autoFocus
                                        onChange={e => setEditValue(e.target.value)}
                                        onPressEnter={() => {
                                            const v = editValue.trim();
                                            handleRenameCommit(item, v);
                                        }}
                                        onBlur={() => {
                                            const v = editValue.trim();
                                            handleRenameCommit(item, v);
                                        }}
                                        style={{ width: 120 }}
                                    />
                                ) : (
                                    <span
                                        className="text-sm text-gray-800 truncate"
                                        title={productDisplayLabels.get(item.key)?.fullLabel || item.name}
                                    >
                                        {productDisplayLabels.get(item.key)?.shortLabel || item.name}
                                    </span>
                                )}
                                {getConfidenceTag(item)}
                            </div>
                            <div
                                className="text-xs text-gray-400"
                                title={productDisplayLabels.get(item.key)?.fullLabel || item.fileName}
                            >
                                @{item.fileName} · {item.paramCount} 参数
                            </div>
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
