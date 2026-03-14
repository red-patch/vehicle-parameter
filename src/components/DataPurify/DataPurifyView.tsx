import React, { useState, useMemo, useEffect } from 'react';
import { Table, Select, Button, Tag, Input, Tooltip, message, Popconfirm, Space, Alert } from 'antd';
import { FilterBar, FilterItem } from '../common/FilterBar';
import { SafetyCertificateOutlined, SaveOutlined, WarningOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { getProductData } from '../../store/vehicleSelectors';
import { getEnumValuesSync, isEnumDataLoaded, preloadEnumData, getAllAttributeNames } from '../../utils/attributeEnums';
import { getSystemRequiredFieldsSync, getQualityCheckFieldsSync } from '../../utils/fieldLists';
import Fuse from 'fuse.js';
import type { VehicleParameter } from '../../types';
import SaveAssetModal from '../AssetLibrary/SaveAssetModal';
import { saveAssetFile, checkAssetExists } from '../../utils/assetManager';
import { ASSET_SOURCE_TAGS } from '../../utils/assetSourceTags';
import { getAssetBackedSourceFile } from '../ParameterWorkbench/quickRepair';
import type { RepairSourceModule } from '../../types';

interface DataPurifyViewProps {
    onReturnToSource?: (sourceModule: RepairSourceModule) => void;
}

const DataPurifyView: React.FC<DataPurifyViewProps> = ({ onReturnToSource }) => {
    const { 
        uploadedFiles, 
        selectedProductNames, 
        assetLibraryPath,
        selectedProduct,
        setSelectedProduct,
        assetFiles,
        repairContext,
        clearRepairContext,
    } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        selectedProductNames: state.selectedProductNames,
        assetLibraryPath: state.assetLibraryPath,
        selectedProduct: state.currentPurifyProduct,
        setSelectedProduct: state.setPurifyProduct,
        assetFiles: state.assetFiles,
        repairContext: state.repairContext,
        clearRepairContext: state.clearRepairContext,
    })));
    const [purifyParams, setPurifyParams] = useState<VehicleParameter[]>([]);
    const [enumLoaded, setEnumLoaded] = useState(isEnumDataLoaded());
    const [saveModalVisible, setSaveModalVisible] = useState(false);
    const [isExistingAsset, setIsExistingAsset] = useState(false);
    const [saving, setSaving] = useState(false);

    // 动态计算标准字段集（仅限枚举字典）
    const { allStandardFields, standardFieldsFuse } = useMemo(() => {
        const fields = enumLoaded ? getAllAttributeNames() : [];
        const fuse = new Fuse(fields.map(f => ({ name: f })), {
            keys: ['name'],
            threshold: 0.6,
        });
        return { allStandardFields: fields, standardFieldsFuse: fuse };
    }, [enumLoaded]);

    // 过滤状态
    const [filterGroup, setFilterGroup] = useState<string | undefined>(undefined);
    const [valueSearch, setValueSearch] = useState('');
    const [quickFilter, setQuickFilter] = useState<'none' | 'system' | 'quality' | 'anomaly'>('none');

    // 预加载枚举数据
    useEffect(() => {
        if (!enumLoaded) {
            preloadEnumData().then(() => setEnumLoaded(true));
        }
    }, [enumLoaded]);

    // 默认选中第一个产品
    useEffect(() => {
        if (!selectedProduct && selectedProductNames.length > 0) {
            setSelectedProduct(selectedProductNames[0]);
        }
    }, [selectedProductNames, selectedProduct]);

    useEffect(() => {
        if (repairContext?.productName && repairContext.productName !== selectedProduct) {
            setSelectedProduct(repairContext.productName);
        }
    }, [repairContext, selectedProduct, setSelectedProduct]);

    const targetFieldName = repairContext?.productName === selectedProduct ? repairContext.fieldName : undefined;
    const currentAssetFileName = useMemo(() => {
        if (!selectedProduct) return null;
        if (repairContext?.productName === selectedProduct) return repairContext.sourceFileName;
        return getAssetBackedSourceFile(assetFiles, selectedProduct);
    }, [assetFiles, repairContext, selectedProduct]);

    // 当所选产品变化时，初始化净化列表
    useEffect(() => {
        if (selectedProduct) {
            const data = getProductData(uploadedFiles, selectedProduct, assetFiles);
            // 深度拷贝以脱离 store 变异
            setPurifyParams(JSON.parse(JSON.stringify(data)));
            
            // 检查资产库中是否存在同名文件
            if (assetLibraryPath) {
                checkAssetExists(assetLibraryPath, currentAssetFileName || selectedProduct).then(setIsExistingAsset);
            }
        } else {
            setPurifyParams([]);
            setIsExistingAsset(false);
        }
    }, [selectedProduct, uploadedFiles, assetFiles, assetLibraryPath, currentAssetFileName]);

    const handleUpdateParam = (id: string, field: keyof VehicleParameter, value: string | number) => {
        const nowStr = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        setPurifyParams((prev: VehicleParameter[]) => prev.map(p => p.id === id ? { ...p, [field]: value, updatedAt: nowStr } : p));
    };

    const handleDeleteParam = (id: string) => {
        setPurifyParams((prev: VehicleParameter[]) => prev.filter(p => p.id !== id));
    };

    const handleAddParam = () => {
        const nowStr = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const newParam: VehicleParameter = {
            id: `new-${Date.now()}`,
            group: '新增参数',
            name: '',
            value: '',
            productName: selectedProduct || '未知产品',
            updatedAt: nowStr
        };
        setPurifyParams([newParam, ...purifyParams]);
    };

    const handleSaveToAsset = async (fileName: string, options?: { returnToSource?: boolean; clearTask?: boolean }) => {
        if (!assetLibraryPath) return;
        if (!selectedProduct) return;
        
        setSaving(true);
        try {
            await saveAssetFile(
                assetLibraryPath, 
                fileName, 
                selectedProduct, 
                purifyParams
            );
            message.success(`已成功保存资产: ${fileName}`);
            // 更新状态
            if (fileName === selectedProduct || fileName === `${selectedProduct}.json`) {
                setIsExistingAsset(true);
            }
            if (options?.clearTask) {
                clearRepairContext();
            }
            if (options?.returnToSource && repairContext) {
                onReturnToSource?.(repairContext.sourceModule);
            }
        } catch (error) {
            message.error('保存失败: ' + (error as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleQuickSave = async () => {
        const targetFileName = currentAssetFileName || selectedProduct;
        if (!targetFileName) return;
        await handleSaveToAsset(targetFileName);
    };

    const handleSaveAndReturn = async () => {
        const targetFileName = currentAssetFileName || selectedProduct;
        if (!targetFileName) return;
        await handleSaveToAsset(targetFileName, { returnToSource: true, clearTask: true });
    };

    const handleCancelRepair = () => {
        clearRepairContext();
        if (repairContext) {
            onReturnToSource?.(repairContext.sourceModule);
        }
    };

    // 为每一行计算异常状态和推荐
    const augmentedParams = useMemo(() => {
        return purifyParams.map(p => {
            const isNameStandard = allStandardFields.includes(p.name);
            let nameFixes: string[] = [];
            
            if (!isNameStandard && p.name.trim() !== '') {
                const results = standardFieldsFuse.search(p.name);
                nameFixes = results.slice(0, 3).map((r: any) => r.item.name);
            }

            const enums = enumLoaded && p.name ? getEnumValuesSync(p.name) : [];
            const hasEnums = enums.length > 0;
            const strValue = String(p.value || '').trim();
            const isEnumMismatch = hasEnums && strValue !== '' && !enums.includes(strValue);

            return {
                ...p,
                isNameStandard,
                nameFixes,
                enums,
                hasEnums,
                isEnumMismatch
            };
        });
    }, [purifyParams, enumLoaded]);

    // 提取所有可用的分组用于下拉菜单
    const availableGroups = useMemo(() => {
        const groups = new Set<string>();
        purifyParams.forEach(p => {
            if (p.group) groups.add(p.group);
        });
        return Array.from(groups).sort();
    }, [purifyParams]);

    // 三级衍生：基于过滤状态对数据进行可见性过滤
    const filteredParams = useMemo(() => {
        const sysReq = getSystemRequiredFieldsSync();
        const qualCheck = getQualityCheckFieldsSync();
        const searchKeyword = valueSearch.trim().toLowerCase();

        return augmentedParams.filter(p => {
            // 组过滤器优先
            if (filterGroup && p.group !== filterGroup) return false;

            // 参数值搜索
            if (searchKeyword && !String(p.value ?? '').toLowerCase().includes(searchKeyword)) return false;
            
            // 快捷过滤器
            if (quickFilter === 'system') return sysReq.includes(p.name);
            if (quickFilter === 'quality') return qualCheck.includes(p.name);
            if (quickFilter === 'anomaly') {
                const isNameHealthy = p.isNameStandard;
                const isValueHealthy = !p.isEnumMismatch;
                return !(isNameHealthy && isValueHealthy); // 如果名字不规范或者值不对，放行
            }

            return true;
        });
    }, [augmentedParams, filterGroup, quickFilter, valueSearch]);

    const displayedParams = useMemo(() => {
        if (!targetFieldName) return filteredParams;
        const targets = filteredParams.filter(param => param.name === targetFieldName);
        const others = filteredParams.filter(param => param.name !== targetFieldName);
        return [...targets, ...others];
    }, [filteredParams, targetFieldName]);

    const anomalyCount = augmentedParams.filter(p => !p.isNameStandard || p.isEnumMismatch).length;

    const columns = [
        {
            title: '参数分组',
            dataIndex: 'group',
            key: 'group',
            width: 150,
            render: (text: string, record: any) => (
                <Input 
                    value={text} 
                    onChange={e => handleUpdateParam(record.id, 'group', e.target.value)} 
                    variant="borderless" 
                />
            )
        },
        {
            title: '参数名',
            key: 'name',
            width: 300,
            render: (_: any, record: any) => (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <Input 
                            value={record.name}
                            onChange={e => handleUpdateParam(record.id, 'name', e.target.value)}
                            status={!record.isNameStandard && record.name ? 'warning' : ''}
                            placeholder="输入参数名"
                        />
                        {!record.isNameStandard && record.name && (
                            <Tooltip title="非标准名称">
                                <WarningOutlined className="text-yellow-500" />
                            </Tooltip>
                        )}
                    </div>
                    {record.nameFixes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                            <span className="text-xs text-gray-400">名推荐:</span>
                            {record.nameFixes.map((fix: string) => (
                                <Tag 
                                    key={fix}
                                    className="cursor-pointer hover:border-blue-400 text-xs m-0"
                                    onClick={() => handleUpdateParam(record.id, 'name', fix)}
                                >
                                    {fix}
                                </Tag>
                            ))}
                        </div>
                    )}
                </div>
            )
        },
        {
            title: '参数值',
            key: 'value',
            width: 350,
            render: (_: any, record: any) => (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        {record.hasEnums ? (
                            <Select
                                showSearch
                                allowClear
                                style={{ flex: 1 }}
                                value={record.value ? String(record.value) : undefined}
                                onChange={val => handleUpdateParam(record.id, 'value', val || '')}
                                options={record.enums.map((e: string) => ({ value: e, label: e }))}
                                status={record.isEnumMismatch ? 'error' : ''}
                                placeholder="选择或查找标准值"
                                dropdownStyle={{ minWidth: 200 }}
                            />
                        ) : (
                            <Input 
                                value={record.value}
                                onChange={e => handleUpdateParam(record.id, 'value', e.target.value)}
                                placeholder="输入数值"
                                style={{ flex: 1 }}
                            />
                        )}
                        {record.isEnumMismatch && (
                            <Tooltip title={`"${record.value}" 不在标准字典内`}>
                                <WarningOutlined className="text-red-500" />
                            </Tooltip>
                        )}
                    </div>
                    {record.updatedAt && (
                        <div className="text-[10px] text-gray-400 mt-1 cursor-default">
                            已于 {record.updatedAt} 手动更新
                        </div>
                    )}
                </div>
            )
        },
        {
            title: '操作',
            key: 'action',
            width: 80,
            render: (_: any, record: any) => (
                <Popconfirm 
                    title="确定删除此参数？" 
                    onConfirm={() => handleDeleteParam(record.id)}
                >
                    <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>
            )
        }
    ];

    return (
        <div className="h-full flex flex-col">
            {repairContext && repairContext.productName === selectedProduct && (
                <div className="mb-4">
                    <Alert
                        type="info"
                        showIcon
                        message={`来自${repairContext.sourceLabel}的修复任务`}
                        description={
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                <span>正在修复：{repairContext.productName}{repairContext.fieldName ? ` / ${repairContext.fieldName}` : ''}</span>
                                <Button size="small" type="primary" loading={saving} onClick={handleQuickSave}>
                                    保存并留在体检页
                                </Button>
                                <Button size="small" loading={saving} onClick={handleSaveAndReturn}>
                                    保存后返回来源页面
                                </Button>
                                <Button size="small" type="text" onClick={handleCancelRepair}>
                                    取消本次修复
                                </Button>
                            </div>
                        }
                    />
                </div>
            )}
            <FilterBar
                extra={
                    <Space>
                        <Button icon={<PlusOutlined />} onClick={handleAddParam}>
                            手动新增参数
                        </Button>
                        <Button 
                            icon={<SaveOutlined />}
                            disabled={!selectedProduct || purifyParams.length === 0}
                            onClick={() => {
                                if (!assetLibraryPath) {
                                    message.error('请先设置资产库目录');
                                    return;
                                }
                                setSaveModalVisible(true);
                            }}
                        >
                            单独保存 (另存为)
                        </Button>
                        <Button 
                            type="primary" 
                            className={isExistingAsset ? "bg-orange-500 hover:bg-orange-400" : "bg-green-600 hover:bg-green-500"}
                            icon={<SaveOutlined />}
                            loading={saving}
                            disabled={!selectedProduct || purifyParams.length === 0}
                            onClick={() => {
                                if (!assetLibraryPath) {
                                    message.error('请先在应用右上角设置资产库目录');
                                    return;
                                }
                                if (isExistingAsset) {
                                    handleQuickSave();
                                } else {
                                    setSaveModalVisible(true);
                                }
                            }}
                        >
                            {isExistingAsset ? '覆盖原资产' : '保存至资产库'}
                        </Button>
                    </Space>
                }
            >
                <FilterItem label="待体检车型:">
                    <Select
                        style={{ width: 220 }}
                        value={selectedProduct}
                        onChange={setSelectedProduct}
                        options={selectedProductNames.map(name => ({ value: name, label: name }))}
                        placeholder="请选择车型"
                        showSearch
                    />
                </FilterItem>
                
                <FilterItem label="分组:">
                    <Select
                        style={{ width: 140 }}
                        value={filterGroup}
                        onChange={setFilterGroup}
                        options={availableGroups.map(g => ({ value: g, label: g }))}
                        placeholder="所有分组"
                        allowClear
                        showSearch
                    />
                </FilterItem>

                <FilterItem label="参数值:">
                    <Input
                        style={{ width: 220 }}
                        value={valueSearch}
                        onChange={e => setValueSearch(e.target.value)}
                        placeholder="搜索参数值..."
                        allowClear
                        prefix={<SearchOutlined className="text-gray-400" />}
                    />
                </FilterItem>

                <FilterItem label="快捷:">
                    <Button
                        type={quickFilter === 'system' ? 'primary' : 'default'}
                        size="small"
                        onClick={() => setQuickFilter(quickFilter === 'system' ? 'none' : 'system')}
                    >
                        系统必填 ({getSystemRequiredFieldsSync().length})
                    </Button>
                    <Button
                        type={quickFilter === 'quality' ? 'primary' : 'default'}
                        size="small"
                        onClick={() => setQuickFilter(quickFilter === 'quality' ? 'none' : 'quality')}
                    >
                        质量验车 ({getQualityCheckFieldsSync().length})
                    </Button>
                    <Button
                        type={quickFilter === 'anomaly' ? 'primary' : 'default'}
                        size="small"
                        danger={quickFilter !== 'anomaly' && anomalyCount > 0}
                        icon={anomalyCount > 0 ? <WarningOutlined /> : <SafetyCertificateOutlined />}
                        onClick={() => setQuickFilter(quickFilter === 'anomaly' ? 'none' : 'anomaly')}
                    >
                        {anomalyCount > 0 ? `发现异常 (${anomalyCount})` : '完全合规'}
                    </Button>
                </FilterItem>
            </FilterBar>

            <div className="flex-1 overflow-hidden border border-gray-200 rounded">
                <Table 
                    columns={columns}
                    dataSource={displayedParams}
                    rowKey="id"
                    pagination={{
                        pageSize: 50,
                        showSizeChanger: true,
                        size: 'small',
                        showTotal: (total) => `共 ${total} 条`
                    }}
                    scroll={{ y: 'calc(100vh - 320px)' }}
                    size="small"
                    rowClassName={(record) => targetFieldName && record.name === targetFieldName ? 'bg-blue-50' : ''}
                />
            </div>

            <SaveAssetModal 
                visible={saveModalVisible}
                onClose={() => setSaveModalVisible(false)}
                onSave={handleSaveToAsset}
                defaultName={`${selectedProduct || '未知车型'}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`}
                defaultTags={[ASSET_SOURCE_TAGS.purify]}
            />
        </div>
    );
};

export default DataPurifyView;
