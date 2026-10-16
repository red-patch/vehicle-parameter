import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { Select, Button, Input, Tooltip, Popover, message, Popconfirm, Alert } from 'antd';
import { FilterItem } from '../common/FilterBar';
import ListToolbar from '../common/ListToolbar';
import SearchInput from '../common/SearchInput';
import FacetChips from '../common/FacetChips';
import DataTable from '../common/DataTable';
import { SaveOutlined, WarningOutlined, DeleteOutlined, PlusOutlined, EditOutlined, ProfileOutlined, InfoCircleOutlined } from '@ant-design/icons';
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
import { applySyncToParams, buildReferenceIndex, computeRowDiff, matchReference, type ReferenceIndex, type RowDiff } from '../../utils/vehicleFieldDiff';
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

    /** 视同更新：把参考车型的参数名/值/分组写入 ids 指定的行（不写 updatedAt） */
    const handleSyncParam = useCallback((ids: Set<string>, diffById: Map<string, RowDiff>) => {
        setPurifyParams((prev: VehicleParameter[]) => applySyncToParams(prev, ids, diffById));
    }, []);

    // 单元格内联编辑：同时只有一个单元格处于编辑态（参数分组 / 参数名共用）
    const [editingCell, setEditingCell] = useState<{ id: string; field: 'group' | 'name' } | null>(null);
    const openCell = useCallback((id: string, field: 'group' | 'name') => setEditingCell({ id, field }), []);
    const closeCell = useCallback(() => setEditingCell(null), []);

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
    /** 参考车型里对应该行的字段；null = 未设参考车型或两边都匹配不上 */
    reference: VehicleParameter | null;
    /** 与参考车型的差异；null = 非差异行 */
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
            const reference = matchReference(p, referenceIndex);
            return {
                ...p,
                isNameStandard: isKnownAttributeName(p.name),
                nameFixes: nameFixesCache.current.get(p.id) || [],
                enums,
                hasEnums,
                isEnumMismatch,
                reference,
                diff: computeRowDiff(p, reference),
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
            width: 160,
            render: (text: string, record: PurifyRow) => {
                const isEditing = editingCell?.id === record.id && editingCell.field === 'group';
                if (isEditing) {
                    return (
                        <Input
                            autoFocus
                            size="small"
                            value={text}
                            onChange={e => handleUpdateParam(record.id, 'group', e.target.value)}
                            onBlur={closeCell}
                            onPressEnter={closeCell}
                            placeholder="输入分组"
                        />
                    );
                }
                return (
                    <span
                        className={`cell-edit-text text-2 ${text ? '' : 'text-3'}`}
                        title={text || '点击输入分组'}
                        onClick={() => openCell(record.id, 'group')}
                    >
                        {text || '未分组'}
                    </span>
                );
            }
        },
        {
            title: '参数名',
            key: 'name',
            width: 220,
            render: (_: unknown, record: PurifyRow) => {
                const isEditing = editingCell?.id === record.id && editingCell.field === 'name';
                const isNonStandard = !record.isNameStandard && !!record.name;
                if (isEditing) {
                    return (
                        <Input
                            autoFocus
                            size="small"
                            value={record.name}
                            onChange={e => handleUpdateParam(record.id, 'name', e.target.value)}
                            onBlur={closeCell}
                            onPressEnter={closeCell}
                            placeholder="输入参数名"
                        />
                    );
                }
                return (
                    <div className="flex items-center gap-1 min-w-0">
                        <span
                            className={`cell-edit-text ${isNonStandard ? 'text-warning-text' : 'text-1'}`}
                            title={record.name || '点击输入参数名'}
                            onClick={() => openCell(record.id, 'name')}
                        >
                            {record.name || <span className="text-3">未命名</span>}
                        </span>
                        {isNonStandard && (
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
                                <WarningOutlined className="text-warning hover:text-[color:var(--warning-text)] text-[13px] flex-shrink-0" />
                            </Popover>
                        )}
                    </div>
                );
            }
        },

        {
            title: '参数值',
            key: 'value',
            width: 380,
            render: (_: unknown, record: PurifyRow) => {
                const isManual = manualValueRows.has(record.id);
                return (
                    <div className="flex items-center gap-1.5">
                        {record.hasEnums && !isManual ? (
                            <Select
                                showSearch
                                allowClear
                                size="small"
                                style={{ flex: 1, minWidth: 0 }}
                                value={record.value ? String(record.value) : undefined}
                                onChange={val => handleUpdateParam(record.id, 'value', val || '')}
                                options={record.enums.map((e: string) => ({ value: e, label: e }))}
                                status={record.isEnumMismatch ? 'error' : ''}
                                placeholder="选择或查找标准值"
                                dropdownStyle={{ minWidth: 200 }}
                            />
                        ) : (
                            <Input
                                size="small"
                                value={record.value}
                                onChange={(e) => handleUpdateParam(record.id, 'value', e.target.value)}
                                placeholder="输入数值"
                                style={{ flex: 1, minWidth: 0 }}
                            />
                        )}
                        {/* 图标槽宽度恒定（每行固定 3 个），保证左侧控件逐行对齐 */}
                        <span className="flex items-center gap-0.5 flex-shrink-0 w-[24px] justify-center">
                            {record.isEnumMismatch && (
                                <Tooltip title={'"' + record.value + '" 不在标准字典内'}>
                                    <WarningOutlined className="text-danger" />
                                </Tooltip>
                            )}
                        </span>
                        <span className="flex items-center justify-center flex-shrink-0 w-[24px]">
                            {record.hasEnums && (
                                <Tooltip title={isManual ? '切换为标准选择' : '手动输入'}>
                                    <Button
                                        type="text"
                                        size="small"
                                        className="!w-[24px] !h-[24px] !min-w-0 !p-0"
                                        icon={isManual ? <ProfileOutlined /> : <EditOutlined />}
                                        onClick={() => {
                                            const next = new Set(manualValueRows);
                                            if (isManual) next.delete(record.id); else next.add(record.id);
                                            setManualValueRows(next);
                                        }}
                                    />
                                </Tooltip>
                            )}
                        </span>
                        <span className="flex items-center justify-center flex-shrink-0 w-[24px]">
                            {record.updatedAt && (
                                <Tooltip title={`已于 ${record.updatedAt} 手动更新`}>
                                    <InfoCircleOutlined className="text-3" />
                                </Tooltip>
                            )}
                        </span>
                    </div>
                );
            },
        },
        {
            title: '参考值',
            key: 'reference',
            width: 240,
            render: (_: unknown, record: PurifyRow) => {
                if (!record.reference) {
                    return <span className="cell-plain text-3">—</span>;
                }
                return (
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span
                            className={`cell-plain ${record.diff ? 'text-brand font-medium' : 'text-2'}`}
                            title={String(record.reference.value) || '参考车型此字段为空'}
                        >
                            {String(record.reference.value) || <span className="text-3">（空）</span>}
                        </span>
                        <span className="flex items-center justify-center flex-shrink-0 w-[52px]">
                            {record.diff && (
                                <RowSyncButton
                                    diff={record.diff}
                                    onSync={() => handleSyncParam(new Set([record.id]), diffById)}
                                />
                            )}
                        </span>
                    </div>
                );
            },
        },
        {
            title: '操作',
            key: 'action',
            width: 64,
            align: 'center' as const,
            render: (_: unknown, record: PurifyRow) => (
                <Popconfirm
                    title="确定删除此参数？"
                    onConfirm={() => handleDeleteParam(record.id)}
                >
                    <Button type="text" danger icon={<DeleteOutlined />} size="small" className="!w-[24px] !h-[24px] !min-w-0 !p-0" />
                </Popconfirm>
            )
        }
    ], [handleUpdateParam, manualValueRows, handleDeleteParam, handleSyncParam, diffById, editingCell, openCell, closeCell]);

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
            {/* 列表页外壳统一走 ListToolbar 三段（设计语言 §4.1/§4.3）：
                此前是 FilterBar 的「筛选在左 + 操作在右，挤同一行」。 */}
            <ListToolbar
                title={<span className="font-semibold text-1">体检参数</span>}
                actions={
                    <>
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
                            单独保存（另存为）
                        </Button>
                        {/* §5.1 Q19：本页的产出/终点动作是「把改好的数据落盘」，故保留 1 个 primary。
                            覆盖是风险动作，用 danger 表达（与 AssetUpgradeModal 同一处理）；
                            此前用 className 硬改 bg-orange-500/bg-green-600，绕过曜蓝 token，
                            暗色下不翻转，且违反「色彩是信号不是填充」的设计系统铁律。 */}
                        <Button
                            type={isExistingAsset ? 'primary' : 'primary'}
                            danger={isExistingAsset}
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
                    </>
                }
                filters={
                    <>
                        <FilterItem label="待体检车型">
                            <Select
                                style={{ width: 200 }}
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

                        <FilterItem label="参考车型">
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

                        <span className="ml-auto" />
                        <FilterItem label="搜索">
                            <SearchInput
                                width="md"
                                placeholder="搜索参数名、分组或参数值"
                                value={paramSearch}
                                onChange={setParamSearch}
                            />
                        </FilterItem>
                    </>
                }
                display={
                    /* ③ 显示选项：分组/字段组与两个快捷筛选都只改「呈现什么」，
                       不改数据集合本身，按 §4.1 归属此段。
                       快捷筛选由「变色主按钮」改为 FacetChips（规范禁项）。 */
                    <>
                        <FilterItem label="分组">
                            <Select
                                style={{ width: 160 }}
                                size="small"
                                value={filterGroup}
                                onChange={setFilterGroup}
                                options={availableGroups.map(g => ({ value: g, label: g }))}
                                placeholder="所有分组"
                                allowClear
                                showSearch
                            />
                        </FilterItem>
                        <FilterItem label="字段组">
                            <Select
                                style={{ width: 160 }}
                                size="small"
                                value={fieldGroupFilter}
                                onChange={setFieldGroupFilter}
                                options={fieldGroupOptions}
                            />
                        </FilterItem>
                        <FilterItem label="快捷">
                            <FacetChips
                                options={[
                                    {
                                        value: 'anomaly',
                                        label: anomalyCount > 0 ? '发现异常' : '完全合规',
                                        count: anomalyCount > 0 ? anomalyCount : undefined,
                                        tone: anomalyCount > 0 ? 'warning' : undefined,
                                    },
                                    ...(effectiveReferenceProduct
                                        ? [{
                                              value: 'diff',
                                              label: '仅看差异',
                                              count: diffFieldNames.length,
                                              disabled: diffFieldNames.length === 0 && quickFilter !== 'diff',
                                          }]
                                        : []),
                                ]}
                                value={quickFilter === 'none' ? '' : quickFilter}
                                onChange={v => setQuickFilter((v || 'none') as typeof quickFilter)}
                            />
                        </FilterItem>
                    </>
                }
                padded={false}
            >
                <div className="flex-1 overflow-auto">
                    <DataTable
                        columns={columns}
                        dataSource={displayedParams}
                        rowKey="id"
                        scrollY="calc(100vh - 360px)"
                        rowClassName={(record: PurifyRow) => targetFieldName && record.name === targetFieldName ? 'bg-brand-weak' : ''}
                    />
                </div>
            </ListToolbar>

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
