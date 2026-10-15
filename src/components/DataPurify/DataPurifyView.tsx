import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { Select, Button, Input, Tooltip, Popover, message, Popconfirm, Space, Alert } from 'antd';
import { FilterBar, FilterItem } from '../common/FilterBar';
import DataTable from '../common/DataTable';
import { SafetyCertificateOutlined, SaveOutlined, WarningOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { getEnumValuesSync, isEnumDataLoaded, preloadEnumData, getAllAttributeNames, isKnownAttributeName } from '../../utils/attributeEnums';
import { getFieldGroupsSync } from '../../utils/fieldLists';
import Fuse from 'fuse.js';
import type { VehicleParameter } from '../../types';
import SaveAssetModal from '../AssetLibrary/SaveAssetModal';
import { loadAssetFile, saveAssetFile, checkAssetExists } from '../../utils/assetManager';
import { ASSET_SOURCE_TAGS } from '../../utils/assetSourceTags';
import { getAssetBackedSourceFile } from '../ParameterWorkbench/quickRepair';
import type { RepairSourceModule } from '../../types';
import { buildVehicleDisplayLabels, buildVehicleInstanceKey, buildVehicleOptionLabel, getVehicleProductName } from '../../utils/vehicleInstance';
import { useAssetAliasResolver } from '../../hooks/useAssetAliasResolver';
import { getVehicleSelectionState } from '../../utils/vehicleSelectionState';
import { buildReferenceIndex, buildSyncPatch, computeRowDiff, matchReference, type ReferenceIndex, type RowDiff } from '../../utils/vehicleFieldDiff';
import { ReferenceProductSelect, RowSyncButton, SyncAllButton } from './ReferenceSync';

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
        referenceProduct,
        setReferenceProduct,
        assetFiles,
        activeAssets,
        repairContext,
        clearRepairContext,
        fieldGroupsVersion,
        bumpAssetVersion,
        addActiveAsset,
        removeActiveAsset,
        setAssetFiles,
    } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        selectedProductNames: state.selectedProductNames,
        assetLibraryPath: state.assetLibraryPath,
        selectedProduct: state.currentPurifyProduct,
        setSelectedProduct: state.setPurifyProduct,
        referenceProduct: state.purifyReferenceProduct,
        setReferenceProduct: state.setPurifyReferenceProduct,
        assetFiles: state.assetFiles,
        activeAssets: state.activeAssets,
        repairContext: state.repairContext,
        clearRepairContext: state.clearRepairContext,
        fieldGroupsVersion: state.fieldGroupsVersion,
        bumpAssetVersion: state.bumpAssetVersion,
        addActiveAsset: state.addActiveAsset,
        removeActiveAsset: state.removeActiveAsset,
        setAssetFiles: state.setAssetFiles,
    })));
    const [purifyParams, setPurifyParams] = useState<VehicleParameter[]>([]);
    const [enumLoaded, setEnumLoaded] = useState(isEnumDataLoaded());
    const [saveModalVisible, setSaveModalVisible] = useState(false);
    const [isExistingAsset, setIsExistingAsset] = useState(false);
    const [saving, setSaving] = useState(false);

    // 动态计算标准字段集（仅限枚举字典）
    const { standardFieldsFuse } = useMemo(() => {
        const fields = enumLoaded ? getAllAttributeNames() : [];
        const fuse = new Fuse(fields.map(f => ({ name: f })), {
            keys: ['name'],
            threshold: 0.6,
        });
        return { allStandardFields: fields, standardFieldsFuse: fuse };
    }, [enumLoaded]);

    // 过滤状态
    const [filterGroup, setFilterGroup] = useState<string | undefined>(undefined);
    const [paramSearch, setParamSearch] = useState('');
    const [quickFilter, setQuickFilter] = useState<'none' | 'system' | 'quality' | 'anomaly' | 'diff'>('none');
    const [fieldGroupFilter, setFieldGroupFilter] = useState<string>('all');
    const [manualValueRows, setManualValueRows] = useState<Set<string>>(new Set());

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
    const selectedProductName = selectedProduct ? getVehicleProductName(selectedProduct) : '未知车型';
    const { resolver: aliasResolver } = useAssetAliasResolver();
    const selectedProductDisplayLabels = useMemo(
        () => buildVehicleDisplayLabels(selectedProductNames, aliasResolver),
        [selectedProductNames, aliasResolver]
    );
    const selectedProductState = useMemo(
        () => selectedProduct ? getVehicleSelectionState(uploadedFiles, selectedProduct, assetFiles, activeAssets) : null,
        [uploadedFiles, selectedProduct, assetFiles, activeAssets]
    );
    const currentAssetFileName = useMemo(() => {
        if (!selectedProduct) return null;
        if (repairContext?.productName === selectedProduct) return repairContext.sourceFileName;
        return getAssetBackedSourceFile(assetFiles, selectedProduct);
    }, [assetFiles, repairContext, selectedProduct]);

    // 参考车型：与待体检车型相同时无意义，视为未设置
    const effectiveReferenceProduct = referenceProduct && referenceProduct !== selectedProduct ? referenceProduct : null;

    // 参考车型数据取自已保存的资产/上传数据（purifyParams 只装当前车型）
    const referenceData = useMemo(() => {
        if (!effectiveReferenceProduct) return [] as VehicleParameter[];
        const state = getVehicleSelectionState(uploadedFiles, effectiveReferenceProduct, assetFiles, activeAssets);
        return state.status === 'ready' ? state.data : [];
    }, [uploadedFiles, effectiveReferenceProduct, assetFiles, activeAssets]);

    const referenceIndex: ReferenceIndex | null = useMemo(
        () => (effectiveReferenceProduct ? buildReferenceIndex(referenceData) : null),
        [effectiveReferenceProduct, referenceData]
    );

    // 当所选产品变化时，初始化净化列表
    useEffect(() => {
        if (selectedProduct) {
            const data = selectedProductState?.status === 'ready' ? selectedProductState.data : [];
            // 深拷贝脱离 store；structuredClone 比 JSON 往返快且保留原始类型
            setPurifyParams(structuredClone(data));
            
            // 检查资产库中是否存在同名文件
            if (assetLibraryPath) {
                checkAssetExists(assetLibraryPath, currentAssetFileName || selectedProductName).then(setIsExistingAsset);
            }
        } else {
            setPurifyParams([]);
            setIsExistingAsset(false);
        }
    }, [selectedProduct, selectedProductState, assetLibraryPath, currentAssetFileName, selectedProductName]);

    const handleUpdateParam = useCallback((id: string, field: keyof VehicleParameter, value: string | number) => {
        const nowStr = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        setPurifyParams((prev: VehicleParameter[]) => prev.map(p => p.id === id ? { ...p, [field]: value, updatedAt: nowStr } : p));
    }, []);

    const handleDeleteParam = useCallback((id: string) => {
        setPurifyParams((prev: VehicleParameter[]) => prev.filter(p => p.id !== id));
    }, []);

    /** 视同更新：把参考车型的参数名/值/分组一次性写入指定行 */
    const handleSyncParam = useCallback((ids: Set<string>, diffById: Map<string, RowDiff>) => {
        if (ids.size === 0) return;
        const nowStr = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        setPurifyParams((prev: VehicleParameter[]) => prev.map(p => {
            const diff = diffById.get(p.id);
            return diff ? { ...p, ...buildSyncPatch(p, diff.reference, nowStr) } : p;
        }));
    }, []);

    const handleAddParam = () => {
        const nowStr = new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const newParam: VehicleParameter = {
            id: `new-${Date.now()}`,
            group: '新增参数',
            name: '',
            value: '',
            productName: selectedProductName,
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
                selectedProductName, 
                purifyParams
            );
            message.success(`已成功保存资产: ${fileName}`);

            // 同步更新 activeAssets 和 selectedProductNames
            const newFileNameJson = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
            // 如果是重命名，先移除旧文件
            if (currentAssetFileName && currentAssetFileName !== newFileNameJson) {
                removeActiveAsset(currentAssetFileName, selectedProductName);
            }
            // 始终注册新文件到 activeAssets（首次保存和重命名都需要）
            addActiveAsset(newFileNameJson, selectedProductName);
            // 同步更新当前选择的 instance key，使下游模块立即感知
            const newInstanceKey = buildVehicleInstanceKey('asset', newFileNameJson, selectedProductName);
            if (selectedProduct && !selectedProductNames.includes(newInstanceKey)) {
                setSelectedProduct(newInstanceKey);
            }

            // 立即加载资产数据到 assetFiles，不等 AssetDataSynchronizer 异步同步
            const targetJson = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
            const loaded = await loadAssetFile(assetLibraryPath, targetJson);
            if (loaded) {
                const exists = assetFiles.some(f => f.fileName === targetJson);
                setAssetFiles(exists
                    ? assetFiles.map(f => f.fileName === targetJson ? loaded : f)
                    : [...assetFiles, loaded]
                );
            }

            // bumpAssetVersion 移至 SaveAssetModal.performSave 中标签保存后触发
            // 更新状态
            if (fileName === selectedProductName || fileName === `${selectedProductName}.json`) {
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
        const targetFileName = currentAssetFileName || selectedProductName;
        if (!targetFileName) return;
        await handleSaveToAsset(targetFileName);
    };

    const handleSaveAndReturn = async () => {
        const targetFileName = currentAssetFileName || selectedProductName;
        if (!targetFileName) return;
        await handleSaveToAsset(targetFileName, { returnToSource: true, clearTask: true });
    };

    const handleCancelRepair = () => {
        clearRepairContext();
        if (repairContext) {
            onReturnToSource?.(repairContext.sourceModule);
        }
    };

    /** 数据体检表的一行：VehicleParameter + 体检派生字段 */
type PurifyRow = VehicleParameter & {
    isNameStandard: boolean;
    nameFixes: string[];
    enums: string[];
    hasEnums: boolean;
    isEnumMismatch: boolean;
    /** 与参考车型的差异；null = 非差异行或未设参考车型 */
    diff: RowDiff | null;
};

// 为每一行计算异常状态和推荐
    // 性能优化：用 ref 缓存上次计算结果，仅当 purifyParams.name 或 enumLoaded 变化时重算 fuse
    const prevNameKeys = useRef('');
    const nameFixesCache = useRef<Map<string, string[]>>(new Map());
    const augmentedParams = useMemo(() => {
        const nameKey = purifyParams.map(p => `${p.id}:${p.name}`).join('|');
        if (nameKey !== prevNameKeys.current) {
            prevNameKeys.current = nameKey;
            nameFixesCache.current = new Map();
            purifyParams.forEach(p => {
                if (isKnownAttributeName(p.name) || !p.name.trim()) {
                    nameFixesCache.current.set(p.id, []);
                    return;
                }
                const results = standardFieldsFuse.search(p.name);
                nameFixesCache.current.set(p.id, results.slice(0, 3).map(r => r.item.name));
            });
        }
        return purifyParams.map((p): PurifyRow => {
            const enums = enumLoaded && p.name ? getEnumValuesSync(p.name) : [];
            const hasEnums = enums.length > 0;
            const strValue = String(p.value || '').trim();
            const isEnumMismatch = hasEnums && strValue !== '' && !enums.some(e => String(e).toLowerCase() === strValue.toLowerCase());
            return {
                ...p,
                isNameStandard: isKnownAttributeName(p.name),
                nameFixes: nameFixesCache.current.get(p.id) || [],
                enums,
                hasEnums,
                isEnumMismatch,
                diff: computeRowDiff(p, matchReference(p, referenceIndex)),
            };
        });
    }, [purifyParams, enumLoaded, referenceIndex]);

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
        const selectedFieldGroup = getFieldGroupsSync().find((group) => group.id === fieldGroupFilter);
        const searchKeyword = paramSearch.trim().toLowerCase();

        return augmentedParams.filter(p => {
            // 组过滤器优先
            if (filterGroup && p.group !== filterGroup) return false;
            if (selectedFieldGroup && !selectedFieldGroup.fields.includes(p.name)) return false;

            // 统一搜索：参数名 / 分组名 / 参数值
            if (searchKeyword) {
                const matchName = p.name.toLowerCase().includes(searchKeyword);
                const matchGroup = (p.group || '').toLowerCase().includes(searchKeyword);
                const matchValue = String(p.value ?? '').toLowerCase().includes(searchKeyword);
                if (!matchName && !matchGroup && !matchValue) return false;
            }
            
            // 快捷过滤器（仅保留「仅异常」与「仅看差异」，其他通过字段组下拉实现）
            if (quickFilter === 'anomaly') {
                const isNameHealthy = p.isNameStandard;
                const isValueHealthy = !p.isEnumMismatch;
                return !(isNameHealthy && isValueHealthy);
            }
            if (quickFilter === 'diff') {
                return !!p.diff;
            }

            return true;
        });
    }, [augmentedParams, filterGroup, quickFilter, paramSearch, fieldGroupFilter, fieldGroupsVersion]);

    // 差异行索引：供行内按钮与全量同步共用
    const diffById = useMemo(() => {
        const map = new Map<string, RowDiff>();
        augmentedParams.forEach(p => { if (p.diff) map.set(p.id, p.diff); });
        return map;
    }, [augmentedParams]);

    const diffFieldNames = useMemo(
        () => augmentedParams.filter(p => p.diff).map(p => p.name || '（未命名参数）'),
        [augmentedParams]
    );

    const fieldGroupOptions = useMemo(
        () => [{ value: 'all', label: '全部字段组' }, ...getFieldGroupsSync().map((group) => ({ value: group.id, label: group.name }))],
        [fieldGroupsVersion]
    );

    const displayedParams = useMemo(() => {
        if (!targetFieldName) return filteredParams;
        const targets = filteredParams.filter(param => param.name === targetFieldName);
        const others = filteredParams.filter(param => param.name !== targetFieldName);
        return [...targets, ...others];
    }, [filteredParams, targetFieldName]);

    const anomalyCount = augmentedParams.filter(p => !p.isNameStandard || p.isEnumMismatch).length;

    // columns memo：引用稳定（handler 均 useCallback 化），避免每次击键/过滤触发全表重渲染
    const columns = useMemo(() => [
        {
            title: '参数分组',
            dataIndex: 'group',
            key: 'group',
            width: 150,
            render: (text: string, record: PurifyRow) => (
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
            render: (_: unknown, record: PurifyRow) => (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <Input 
                            value={record.name}
                            onChange={e => handleUpdateParam(record.id, 'name', e.target.value)}
                            status={!record.isNameStandard && record.name ? 'warning' : ''}
                            placeholder="输入参数名"
                        />
                        {!record.isNameStandard && record.name && (
                            <Popover
                                trigger="click"
                                placement="bottom"
                                title="推荐的标准字段名"
                                content={
                                    record.nameFixes.length > 0 ? (
                                        <div className="flex flex-col gap-1 max-w-[240px]">
                                            {record.nameFixes.map((fix: string) => (
                                                <Button
                                                    key={fix}
                                                    type="text"
                                                    size="small"
                                                    className="text-left"
                                                    onClick={() => handleUpdateParam(record.id, 'name', fix)}
                                                >
                                                    {fix}
                                                </Button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-3">无匹配的推荐字段名</div>
                                    )
                                }
                            >
                                <WarningOutlined className="text-warning hover:text-[color:var(--warning-text)] text-[15px]" />
                            </Popover>
                        )}
                    </div>
                </div>
            )
        },

        {
            title: '参数值',
            key: 'value',
            width: 350,
            render: (_: unknown, record: PurifyRow) => {
                const isManual = manualValueRows.has(record.id);
                return (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            {record.hasEnums && !isManual ? (
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
                                    onChange={(e) => handleUpdateParam(record.id, 'value', e.target.value)}
                                    placeholder="输入数值"
                                    style={{ flex: 1 }}
                                />
                            )}
                            {record.isEnumMismatch && (
                                <Tooltip title={'"' + record.value + '" 不在标准字典内'}>
                                    <WarningOutlined className="text-danger" />
                                </Tooltip>
                            )}
                            {record.hasEnums && (
                                <Tooltip title={isManual ? '切换为标准选择' : '手动输入'}>
                                    <span
                                        style={{ fontSize: 12, color: 'var(--brand)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                        onClick={() => {
                                            const next = new Set(manualValueRows);
                                            if (isManual) next.delete(record.id); else next.add(record.id);
                                            setManualValueRows(next);
                                        }}
                                    >
                                        {isManual ? '📋 标准选择' : '✏️ 手动输入'}
                                    </span>
                                </Tooltip>
                            )}
                        </div>
                        {record.updatedAt && (
                            <div className="text-[12px] text-3 mt-1 cursor-default">
                                已于 {record.updatedAt} 手动更新
                            </div>
                        )}
                        {record.diff && (
                            <RowSyncButton
                                diff={record.diff}
                                onSync={() => handleSyncParam(new Set([record.id]), diffById)}
                            />
                        )}
                    </div>
                );
            },
        },
        {
            title: '操作',
            key: 'action',
            width: 80,
            render: (_: unknown, record: PurifyRow) => (
                <Popconfirm
                    title="确定删除此参数？"
                    onConfirm={() => handleDeleteParam(record.id)}
                >
                    <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>
            )
        }
    ], [handleUpdateParam, manualValueRows, handleDeleteParam, handleSyncParam, diffById]);

    return (
        <div className="h-full flex flex-col gap-3">
            {selectedProductState?.status === 'pending' && (
                <Alert
                    type="info"
                    showIcon
                    message="当前车型数据正在同步，完成后会自动加载到体检列表"
                />
            )}
            {repairContext && repairContext.productName === selectedProduct && (
                <div>
                    <Alert
                        type="info"
                        showIcon
                        message={`来自${repairContext.sourceLabel}的修复任务`}
                        description={
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                <span>正在修复：{selectedProductDisplayLabels.get(repairContext.productName)?.shortLabel || getVehicleProductName(repairContext.productName)}{repairContext.fieldName ? ` / ${repairContext.fieldName}` : ''}</span>
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
                        {effectiveReferenceProduct && (
                            <SyncAllButton
                                diffFieldNames={diffFieldNames}
                                onSyncAll={() => handleSyncParam(new Set(diffById.keys()), diffById)}
                            />
                        )}
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
                        options={selectedProductNames.map(name => ({
                            value: name,
                            label: selectedProductDisplayLabels.get(name)?.shortLabel || getVehicleProductName(name),
                            title: selectedProductDisplayLabels.get(name)?.fullLabel || buildVehicleOptionLabel(name),
                        }))}
                        placeholder="请选择车型"
                        showSearch
                    />
                </FilterItem>

                <FilterItem label="参考车型:">
                    <ReferenceProductSelect
                        value={referenceProduct || undefined}
                        onChange={val => setReferenceProduct(val || null)}
                        options={selectedProductNames.map(name => ({
                            value: name,
                            label: selectedProductDisplayLabels.get(name)?.shortLabel || getVehicleProductName(name),
                            title: selectedProductDisplayLabels.get(name)?.fullLabel || buildVehicleOptionLabel(name),
                            disabled: name === selectedProduct,
                        }))}
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

                <FilterItem label="搜索:">
                    <Input
                        style={{ width: 260 }}
                        value={paramSearch}
                        onChange={e => setParamSearch(e.target.value)}
                        placeholder="搜索参数名、分组或参数值..."
                        allowClear
                        prefix={<SearchOutlined className="text-3" />}
                    />
                </FilterItem>

                <FilterItem label="字段组:">
                    <Select
                        style={{ width: 180 }}
                        value={fieldGroupFilter}
                        onChange={setFieldGroupFilter}
                        options={fieldGroupOptions}
                    />
                </FilterItem>

                <FilterItem label="快捷:">
                    <Space.Compact>
                        <Button
                            type={quickFilter === 'anomaly' ? 'primary' : 'default'}
                            size="small"
                            danger={quickFilter !== 'anomaly' && anomalyCount > 0}
                            icon={anomalyCount > 0 ? <WarningOutlined /> : <SafetyCertificateOutlined />}
                            onClick={() => setQuickFilter(quickFilter === 'anomaly' ? 'none' : 'anomaly')}
                        >
                            {anomalyCount > 0 ? `发现异常 (${anomalyCount})` : '完全合规'}
                        </Button>
                        {effectiveReferenceProduct && (
                            <Button
                                type={quickFilter === 'diff' ? 'primary' : 'default'}
                                size="small"
                                icon={<SyncOutlined />}
                                onClick={() => setQuickFilter(quickFilter === 'diff' ? 'none' : 'diff')}
                            >
                                仅看差异 ({diffFieldNames.length})
                            </Button>
                        )}
                    </Space.Compact>
                </FilterItem>
            </FilterBar>

            <div className="flex-1 overflow-auto border border-default rounded">
                <DataTable
                    columns={columns}
                    dataSource={displayedParams}
                    rowKey="id"
                    scrollY="calc(100vh - 320px)"
                    rowClassName={(record: PurifyRow) => targetFieldName && record.name === targetFieldName ? 'bg-brand-weak' : ''}
                />
            </div>

            <SaveAssetModal 
                visible={saveModalVisible}
                onClose={() => setSaveModalVisible(false)}
                onSave={handleSaveToAsset}
                onSaved={bumpAssetVersion}
                defaultName={`${selectedProductName || '未知车型'}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`}
                defaultTags={[ASSET_SOURCE_TAGS.purify]}
            />
        </div>
    );
};

export default DataPurifyView;
