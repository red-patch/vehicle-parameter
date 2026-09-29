import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SheetData, DiffResult, MatchItem, VehicleParameter, CompareMode, RepairContext, AssetUpgradeDraft } from '../types';
import { calculateProductConfidence } from '../utils/productConfidence';
import { DEFAULT_POOL_SIDEBAR_WIDTH, DEFAULT_POOL_WORKSPACE_HEIGHT } from '../utils/poolLayout';
import { buildVehicleInstanceKey, getVehicleInstanceMetaFromParam, parseVehicleInstanceKey } from '../utils/vehicleInstance';

interface VehicleStore {
    baseFile: SheetData | null;
    targetFile: SheetData | null;
    diffResult: DiffResult | null;
    compareMode: CompareMode;

    setBaseFile: (data: SheetData) => void;
    setTargetFile: (data: SheetData) => void;
    setDiffResult: (result: DiffResult) => void;
    setCompareMode: (mode: CompareMode) => void;

    // Smart Filler
    matchResults: MatchItem[];
    setMatchResults: (results: MatchItem[]) => void;
    updateMatchResult: (id: string, param: VehicleParameter | null) => void;
    updateManualValue: (id: string, value: string, opts?: { explicitEmpty?: boolean }) => void;

    // MIIT Data Import
    miitData: SheetData | null;
    setMiitData: (data: SheetData | null) => void;

    repairContext: RepairContext | null;
    setRepairContext: (context: RepairContext | null) => void;
    clearRepairContext: () => void;

    reset: () => void;

    // V3.0 Unified Pool
    uploadedFiles: SheetData[];
    selectedProductNames: string[];
    addFile: (file: SheetData) => void;
    removeFile: (fileName: string) => void;
    clearFiles: () => void;
    // 启动时由 sessionPersistence 从 appDataDir/session.json 恢复会话（大数组不再走 localStorage persist）
    hydrateSession: (partial: Partial<Pick<VehicleStore, 'uploadedFiles' | 'selectedProductNames' | 'confirmedProducts' | 'excludedProducts' | 'ignoredProductNames'>>) => void;
    setSelectedProductNames: (names: string[]) => void;
    // V3.0 Unified Pool Blacklist
    ignoredProductNames: string[];
    toggleIgnoreProduct: (name: string, ignore: boolean) => void;
    
    // V3.1 产品置信度管理
    confirmedProducts: string[];      // 用户确认的产品（低置信度但有效）
    excludedProducts: string[];       // 用户排除的产品（误识别的）
    confirmProduct: (name: string) => void;
    excludeProduct: (name: string) => void;
    resetProductStatus: (name: string) => void;
    renameFileName: (oldName: string, newName: string) => void;
    renameSubProduct: (fileName: string, oldProductName: string, newProductName: string) => void;
    renameAssetProduct: (fileName: string, oldProductName: string, newProductName: string) => void;

    // UX 持久化状态
    smartFillRequirements: string;
    multiVehicleFields: string;
    setSmartFillRequirements: (text: string) => void;
    setMultiVehicleFields: (text: string) => void;
    
    // V5.0 Asset Library
    assetLibraryPath: string | null;
    setAssetLibraryPath: (path: string | null) => void;

    // V6.2 Global Module Selections (Synchronization)
    activeAssets: string[];
    addActiveAsset: (fileName: string, productName: string) => void;
    removeActiveAsset: (fileName: string, productName: string) => void;
    renameActiveAsset: (oldFileName: string, newFileName: string, newProductName: string) => void;

    currentPurifyProduct: string | null;
    currentCompareProducts: string[];
    currentMultiVehicleProducts: string[];
    currentSmartFillProduct: string | null;
    currentBidPullProducts: string[];
    setPurifyProduct: (name: string | null) => void;
    setCompareProducts: (names: string[]) => void;
    setMultiVehicleProducts: (names: string[]) => void;
    setSmartFillProduct: (name: string | null) => void;
    setBidPullProducts: (names: string[]) => void;

    // 智能填报模式：单车填报 | 多车取数（字段关联）| 自由多车整理（原「多车型管理」）
    smartFillMode: 'single' | 'bidPull' | 'freeMulti';
    setSmartFillMode: (mode: 'single' | 'bidPull' | 'freeMulti') => void;
    // 多车取数当前使用的关联方案 id（持久化，下次进入自动载入）
    bidPullSchemeId: string | null;
    setBidPullSchemeId: (id: string | null) => void;

    // V6.3 Data Pump (Asset Sync)
    assetFiles: SheetData[];
    setAssetFiles: (files: SheetData[]) => void;

    assetUpgradeDraft: AssetUpgradeDraft | null;
    setAssetUpgradeDraft: (draft: AssetUpgradeDraft | null) => void;

    poolSidebarWidth: number;
    poolWorkspaceHeight: number;
    setPoolSidebarWidth: (width: number) => void;
    setPoolWorkspaceHeight: (height: number) => void;
    resetPoolLayout: () => void;

    assetTagGroupsVersion: number;
    bumpAssetTagGroupsVersion: () => void;

    fieldGroupsVersion: number;
    bumpFieldGroupsVersion: () => void;

    assetVersion: number;
    bumpAssetVersion: () => void;

    bidMappingsVersion: number;
    bumpBidMappingsVersion: () => void;
}


export const useVehicleStore = create<VehicleStore>()(
    persist(
        (set) => ({
            baseFile: null,
    targetFile: null,
    diffResult: null,
    compareMode: 'content',

    setBaseFile: (data) => set({ baseFile: data }),
    setTargetFile: (data) => set({ targetFile: data }),
    setDiffResult: (result) => set({ diffResult: result }),
    setCompareMode: (mode) => set({ compareMode: mode }),

    // Smart Filler State
    matchResults: [],
    setMatchResults: (results) => set({ matchResults: results }),
    updateMatchResult: (id, param) => set((state) => ({
        matchResults: state.matchResults.map(m =>
            m.id === id ? { ...m, matchedParam: param, isManual: true, confidence: 1, manualValue: undefined } : m
        )
    })),
    updateManualValue: (id, value, opts) => set((state) => {
        // 行级更新：只替换命中项，避免全量 map 重建 matchResults 触发整表重渲染
        const index = state.matchResults.findIndex(m => m.id === id);
        if (index === -1) return {};

        const m = state.matchResults[index];
        let next: MatchItem;

        // 空值或纯空格 = 没填任何内容，恢复为自动匹配状态
        if (!value || !value.trim()) {
            // 手动输入模式下：空值 = 用户明确填报「空」，导出保持空值，不回退到自动匹配值
            if (opts?.explicitEmpty) {
                next = { ...m, manualValue: '', isManual: true };
            } else {
                next = { ...m, manualValue: undefined, isManual: false };
            }
        } else {
            // 如果修改后的值等于自动匹配的值，清除manualValue
            const autoMatchValue = m.matchedParam?.value?.toString() || '';
            if (value === autoMatchValue) {
                next = { ...m, manualValue: undefined, isManual: false };
            } else {
                // 否则标记为手动修改
                next = { ...m, manualValue: value, isManual: true };
            }
        }

        const nextResults = state.matchResults.slice();
        nextResults[index] = next;
        return { matchResults: nextResults };
    }),

    // MIIT Data Import State
    miitData: null,
    setMiitData: (data) => set({ miitData: data }),

    repairContext: null,
    setRepairContext: (context) => set({ repairContext: context }),
    clearRepairContext: () => set({ repairContext: null }),

    // Unified File Pool (V3.0)
    uploadedFiles: [],
    selectedProductNames: [],
    
    addFile: (file) => set((state) => {
        // Upsert 逻辑: 若存在同名文件，先把它清理掉，防止残留无效的选中状态
        const fileExists = state.uploadedFiles.some(f => f.fileName === file.fileName);
        let nextFiles = state.uploadedFiles;
        let nextSelectedNames = state.selectedProductNames;
        let nextConfirmed = state.confirmedProducts;
        let nextExcluded = state.excludedProducts;

        if (fileExists) {
            // 找出旧文件中所有的车型名，清理其相关状态
            const oldFile = state.uploadedFiles.find(f => f.fileName === file.fileName)!;
            const oldProducts = new Set(oldFile.data.map(p => getVehicleInstanceMetaFromParam('excel', oldFile, p).key));
            
            nextFiles = state.uploadedFiles.map(f => f.fileName === file.fileName ? file : f);
            
            // 清理状态
            nextSelectedNames = state.selectedProductNames.filter(name => !oldProducts.has(name));
            nextConfirmed = state.confirmedProducts.filter(name => !oldProducts.has(name));
            nextExcluded = state.excludedProducts.filter(name => !oldProducts.has(name));
            
            // 剔除可能的忽略名单
            state.ignoredProductNames = state.ignoredProductNames.filter(name => !oldProducts.has(name));
        } else {
            nextFiles = [...state.uploadedFiles, file];
        }

        // UX Lift: 自动勾选新文件里的高、中置信度车型
        const fileProducts = new Map<string, { name: string; paramCount: number }>();
        file.data.forEach(p => {
            const identity = getVehicleInstanceMetaFromParam('excel', file, p);
            const existing = fileProducts.get(identity.key);
            fileProducts.set(identity.key, {
                name: identity.productName,
                paramCount: (existing?.paramCount || 0) + 1,
            });
        });

        const autoSelected = Array.from(fileProducts.entries())
            .filter(([, product]) => calculateProductConfidence(product.name, product.paramCount).level !== 'low')
            .map(([instanceKey]) => instanceKey);

        // 去重：同一 productName 可能来自不同 source（asset vs excel），避免重复勾选
        const existingProductNames = new Set(
            nextSelectedNames
                .map(k => parseVehicleInstanceKey(k)?.productName)
                .filter(Boolean) as string[]
        );
        const dedupedAutoSelected = autoSelected.filter(key => {
            const parsed = parseVehicleInstanceKey(key);
            return parsed && !existingProductNames.has(parsed.productName);
        });

        nextSelectedNames = Array.from(new Set([...nextSelectedNames, ...dedupedAutoSelected]));

        return { 
            uploadedFiles: nextFiles,
            selectedProductNames: nextSelectedNames,
            confirmedProducts: nextConfirmed,
            excludedProducts: nextExcluded
        };
    }),
    removeFile: (fileName) => set((state) => {
        const nextFiles = state.uploadedFiles.filter(f => f.fileName !== fileName);
        const removedFile = state.uploadedFiles.find(f => f.fileName === fileName);
        
        // 如果删除了文件，需要从中提取受影响的产品名
        const affectedProductNames = removedFile 
            ? Array.from(new Set(removedFile.data.map(p => getVehicleInstanceMetaFromParam('excel', removedFile, p).key)))
            : [];
            
        return {
            uploadedFiles: nextFiles,
            // 自动剪枝：从全局选中列表和各个模块的当前选中中剔除
            selectedProductNames: state.selectedProductNames.filter(n => !affectedProductNames.includes(n)),
            ignoredProductNames: state.ignoredProductNames.filter(n => !affectedProductNames.includes(n)),
            currentPurifyProduct: affectedProductNames.includes(state.currentPurifyProduct || '') ? null : state.currentPurifyProduct,
            currentCompareProducts: state.currentCompareProducts.filter(n => !affectedProductNames.includes(n)),
            currentMultiVehicleProducts: state.currentMultiVehicleProducts.filter(n => !affectedProductNames.includes(n)),
            currentBidPullProducts: state.currentBidPullProducts.filter(n => !affectedProductNames.includes(n)),
            currentSmartFillProduct: affectedProductNames.includes(state.currentSmartFillProduct || '') ? null : state.currentSmartFillProduct
        };
    }),
    clearFiles: () => set({
        uploadedFiles: [],
        selectedProductNames: [],
        ignoredProductNames: [],
        currentPurifyProduct: null,
        currentCompareProducts: [],
        currentMultiVehicleProducts: [],
        currentBidPullProducts: [],
        currentSmartFillProduct: null,
        assetFiles: []
    }),
    hydrateSession: (partial) => set(partial),
    setSelectedProductNames: (names) => set((state) => ({
        selectedProductNames: names,
        // 自动剪枝：若某个模块选中的车型在总列表中被取消勾选了，则同步清理
        currentPurifyProduct: (state.currentPurifyProduct && names.includes(state.currentPurifyProduct)) ? state.currentPurifyProduct : null,
        currentCompareProducts: state.currentCompareProducts.filter(n => names.includes(n)),
        currentMultiVehicleProducts: state.currentMultiVehicleProducts.filter(n => names.includes(n)),
        currentBidPullProducts: state.currentBidPullProducts.filter(n => names.includes(n)),
        currentSmartFillProduct: (state.currentSmartFillProduct && names.includes(state.currentSmartFillProduct)) ? state.currentSmartFillProduct : null
    })),
    
    ignoredProductNames: [],
    toggleIgnoreProduct: (name, ignore) => set((state) => {
        if (ignore) {
            // 当忽略时，还需要干掉勾选状态
            return {
                ignoredProductNames: Array.from(new Set([...state.ignoredProductNames, name])),
                selectedProductNames: state.selectedProductNames.filter(n => n !== name),
                currentPurifyProduct: state.currentPurifyProduct === name ? null : state.currentPurifyProduct,
                currentCompareProducts: state.currentCompareProducts.filter(n => n !== name),
                currentMultiVehicleProducts: state.currentMultiVehicleProducts.filter(n => n !== name),
                currentBidPullProducts: state.currentBidPullProducts.filter(n => n !== name),
                currentSmartFillProduct: state.currentSmartFillProduct === name ? null : state.currentSmartFillProduct
            };
        } else {
            return {
                ignoredProductNames: state.ignoredProductNames.filter(n => n !== name)
            };
        }
    }),

    // V3.1 产品置信度管理
    confirmedProducts: [],
    excludedProducts: [],
    
    confirmProduct: (name) => set((state) => ({
        confirmedProducts: state.confirmedProducts.includes(name) 
            ? state.confirmedProducts 
            : [...state.confirmedProducts, name],
        excludedProducts: state.excludedProducts.filter(n => n !== name),
        // 同时添加到选中列表
        selectedProductNames: state.selectedProductNames.includes(name)
            ? state.selectedProductNames
            : [...state.selectedProductNames, name]
    })),
    
    excludeProduct: (name) => set((state) => ({
        excludedProducts: state.excludedProducts.includes(name)
            ? state.excludedProducts
            : [...state.excludedProducts, name],
        confirmedProducts: state.confirmedProducts.filter(n => n !== name),
        // 从选中列表移除
        selectedProductNames: state.selectedProductNames.filter(n => n !== name)
    })),
    
    resetProductStatus: (name) => set((state) => ({
        confirmedProducts: state.confirmedProducts.filter(n => n !== name),
        excludedProducts: state.excludedProducts.filter(n => n !== name)
    })),

    // 纯粹地对引入时的工作台「文件容器」进行更名。绝不动用里面可能包含成百上千款的独立 productName 
    renameFileName: (oldName, newName) => set((state) => ({
        uploadedFiles: state.uploadedFiles.map(file => {
            if (file.fileName === oldName) {
                return { ...file, fileName: newName };
            }
            return file;
        })
    })),

    // 精确打击修改某一特定文件内的某一个特定的车型名称
    renameSubProduct: (fileName, oldProductName, newProductName) => set((state) => ({
        uploadedFiles: state.uploadedFiles.map(file => {
            if (file.fileName === fileName) {
                return {
                    ...file,
                    data: file.data.map(p => 
                        (p.productName || file.fileName) === oldProductName 
                            ? {
                                ...p,
                                productName: newProductName,
                                instanceKey: buildVehicleInstanceKey('excel', fileName, newProductName)
                            } 
                            : p
                    )
                };
            }
            return file;
        }),
        // 同步更改大纲选中索引数组
        selectedProductNames: state.selectedProductNames.map(n => n === buildVehicleInstanceKey('excel', fileName, oldProductName) ? buildVehicleInstanceKey('excel', fileName, newProductName) : n),
        confirmedProducts: state.confirmedProducts.map(n => n === buildVehicleInstanceKey('excel', fileName, oldProductName) ? buildVehicleInstanceKey('excel', fileName, newProductName) : n),
        excludedProducts: state.excludedProducts.map(n => n === buildVehicleInstanceKey('excel', fileName, oldProductName) ? buildVehicleInstanceKey('excel', fileName, newProductName) : n),
    })),

    renameAssetProduct: (fileName, oldProductName, newProductName) => set((state) => ({
        assetFiles: state.assetFiles.map(file => {
            if (file.fileName === fileName) {
                return {
                    ...file,
                        data: file.data.map(p =>
                            (p.productName || file.fileName) === oldProductName
                            ? {
                                ...p,
                                productName: newProductName,
                                instanceKey: buildVehicleInstanceKey('asset', fileName, newProductName)
                            }
                            : p
                    )
                };
            }
            return file;
        }),
        selectedProductNames: state.selectedProductNames.map(n => n === buildVehicleInstanceKey('asset', fileName, oldProductName) ? buildVehicleInstanceKey('asset', fileName, newProductName) : n),
        confirmedProducts: state.confirmedProducts.map(n => n === buildVehicleInstanceKey('asset', fileName, oldProductName) ? buildVehicleInstanceKey('asset', fileName, newProductName) : n),
        excludedProducts: state.excludedProducts.map(n => n === buildVehicleInstanceKey('asset', fileName, oldProductName) ? buildVehicleInstanceKey('asset', fileName, newProductName) : n),
        ignoredProductNames: state.ignoredProductNames.map(n => n === buildVehicleInstanceKey('asset', fileName, oldProductName) ? buildVehicleInstanceKey('asset', fileName, newProductName) : n),
        currentPurifyProduct: state.currentPurifyProduct === buildVehicleInstanceKey('asset', fileName, oldProductName) ? buildVehicleInstanceKey('asset', fileName, newProductName) : state.currentPurifyProduct,
        currentCompareProducts: state.currentCompareProducts.map(n => n === buildVehicleInstanceKey('asset', fileName, oldProductName) ? buildVehicleInstanceKey('asset', fileName, newProductName) : n),
        currentMultiVehicleProducts: state.currentMultiVehicleProducts.map(n => n === buildVehicleInstanceKey('asset', fileName, oldProductName) ? buildVehicleInstanceKey('asset', fileName, newProductName) : n),
        currentBidPullProducts: state.currentBidPullProducts.map(n => n === buildVehicleInstanceKey('asset', fileName, oldProductName) ? buildVehicleInstanceKey('asset', fileName, newProductName) : n),
        currentSmartFillProduct: state.currentSmartFillProduct === buildVehicleInstanceKey('asset', fileName, oldProductName) ? buildVehicleInstanceKey('asset', fileName, newProductName) : state.currentSmartFillProduct,
    })),

    // UX 持久化
    smartFillRequirements: '',
    multiVehicleFields: '',
    setSmartFillRequirements: (text) => set({ smartFillRequirements: text }),
    setMultiVehicleFields: (text) => set({ multiVehicleFields: text }),

    // V5.0 资产库
    assetLibraryPath: null,
    setAssetLibraryPath: (path) => set({ assetLibraryPath: path }),

    reset: () => set({
        baseFile: null,
        targetFile: null,
        diffResult: null,
        matchResults: [],
        compareMode: 'content',
        miitData: null,
        repairContext: null,
        assetUpgradeDraft: null,
        // V3.0
        uploadedFiles: [],
        selectedProductNames: [],
        // V3.1
        confirmedProducts: [],
        excludedProducts: [],
        currentPurifyProduct: null,
        currentCompareProducts: [],
        currentMultiVehicleProducts: [],
        currentBidPullProducts: [],
        currentSmartFillProduct: null,
        assetFiles: []
    }),

    // V6.2 Implementation
    activeAssets: [],
    addActiveAsset: (fileName, productName) => set((state) => {
        const newKey = buildVehicleInstanceKey('asset', fileName, productName);
        const newProductName = parseVehicleInstanceKey(newKey)?.productName;
        // 同名产品替换：资产版优先级高于 Excel/公告等原始来源
        const oldKeys = newProductName
            ? state.selectedProductNames.filter(k => {
                const parsed = parseVehicleInstanceKey(k);
                return parsed && parsed.productName === newProductName && parsed.source !== 'asset';
            })
            : [];
        const replaceInList = (list: string[]) =>
            Array.from(new Set(
                (oldKeys.length > 0 ? list.filter(k => !oldKeys.includes(k)) : list).concat(newKey)
            ));
        return {
            activeAssets: state.activeAssets.includes(fileName) 
                ? state.activeAssets 
                : [...state.activeAssets, fileName],
            selectedProductNames: replaceInList(state.selectedProductNames),
            currentCompareProducts: replaceInList(state.currentCompareProducts),
            currentMultiVehicleProducts: replaceInList(state.currentMultiVehicleProducts),
            currentBidPullProducts: replaceInList(state.currentBidPullProducts),
            currentSmartFillProduct: oldKeys.includes(state.currentSmartFillProduct || '') ? newKey : state.currentSmartFillProduct,
            currentPurifyProduct: oldKeys.includes(state.currentPurifyProduct || '') ? newKey : state.currentPurifyProduct,
        };
    }),
    removeActiveAsset: (fileName, productName) => set((state) => {
        const removedKey = buildVehicleInstanceKey('asset', fileName, productName);
        return {
            activeAssets: state.activeAssets.filter(n => n !== fileName),
            selectedProductNames: state.selectedProductNames.filter(n => n !== removedKey),
            // 同步修剪各模块的当前选中，保持状态闭环
            currentPurifyProduct: state.currentPurifyProduct === removedKey ? null : state.currentPurifyProduct,
            currentCompareProducts: state.currentCompareProducts.filter(n => n !== removedKey),
            currentMultiVehicleProducts: state.currentMultiVehicleProducts.filter(n => n !== removedKey),
            currentBidPullProducts: state.currentBidPullProducts.filter(n => n !== removedKey),
            currentSmartFillProduct: state.currentSmartFillProduct === removedKey ? null : state.currentSmartFillProduct,
        };
    }),
    renameActiveAsset: (oldFileName, newFileName, newProductName) => set((state) => {
        const oldProductName = state.assetFiles.find(file => file.fileName === oldFileName)?.data[0]?.productName
            || oldFileName.replace(/\.json$/i, '');
        const oldKey = buildVehicleInstanceKey('asset', oldFileName, oldProductName);
        const newKey = buildVehicleInstanceKey('asset', newFileName, newProductName);

        return {
            activeAssets: state.activeAssets.map(n => n === oldFileName ? newFileName : n),
            selectedProductNames: state.selectedProductNames.map(n => {
                return n === oldKey ? newKey : n;
            }),
            currentPurifyProduct: state.currentPurifyProduct === oldKey 
                ? newKey 
                : state.currentPurifyProduct,
            currentCompareProducts: state.currentCompareProducts.map(n =>
                n === oldKey ? newKey : n
            ),
            currentMultiVehicleProducts: state.currentMultiVehicleProducts.map(n =>
                n === oldKey ? newKey : n
            ),
            currentBidPullProducts: state.currentBidPullProducts.map(n =>
                n === oldKey ? newKey : n
            ),
            currentSmartFillProduct: state.currentSmartFillProduct === oldKey
                ? newKey
                : state.currentSmartFillProduct,
        };
    }),

    currentPurifyProduct: null,
    currentCompareProducts: [],
    currentMultiVehicleProducts: [],
    currentSmartFillProduct: null,
    currentBidPullProducts: [],
    setPurifyProduct: (name) => set({ currentPurifyProduct: name }),
    setCompareProducts: (names) => set({ currentCompareProducts: names }),
    setMultiVehicleProducts: (names) => set({ currentMultiVehicleProducts: names }),
    setSmartFillProduct: (name) => set({ currentSmartFillProduct: name }),
    setBidPullProducts: (names) => set({ currentBidPullProducts: names }),

    smartFillMode: 'single',
    setSmartFillMode: (mode) => set({ smartFillMode: mode }),
    bidPullSchemeId: null,
    setBidPullSchemeId: (id) => set({ bidPullSchemeId: id }),

    // V6.3 Implementation
    assetFiles: [],
    setAssetFiles: (files) => set({ assetFiles: files }),

    assetUpgradeDraft: null,
    setAssetUpgradeDraft: (draft) => set({ assetUpgradeDraft: draft }),

    poolSidebarWidth: DEFAULT_POOL_SIDEBAR_WIDTH,
    poolWorkspaceHeight: DEFAULT_POOL_WORKSPACE_HEIGHT,
    setPoolSidebarWidth: (width) => set({ poolSidebarWidth: width }),
    setPoolWorkspaceHeight: (height) => set({ poolWorkspaceHeight: height }),
    resetPoolLayout: () => set({
        poolSidebarWidth: DEFAULT_POOL_SIDEBAR_WIDTH,
        poolWorkspaceHeight: DEFAULT_POOL_WORKSPACE_HEIGHT,
    }),

    assetTagGroupsVersion: 0,
    bumpAssetTagGroupsVersion: () => set((state) => ({ assetTagGroupsVersion: state.assetTagGroupsVersion + 1 })),

    fieldGroupsVersion: 0,
    bumpFieldGroupsVersion: () => set((state) => ({ fieldGroupsVersion: state.fieldGroupsVersion + 1 })),

    assetVersion: 0,
    bumpAssetVersion: () => set((state) => ({ assetVersion: state.assetVersion + 1 })),

    bidMappingsVersion: 0,
    bumpBidMappingsVersion: () => set((state) => ({ bidMappingsVersion: state.bidMappingsVersion + 1 })),
}), {
    name: 'vehicle-parameter-storage',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
        smartFillRequirements: state.smartFillRequirements,
        multiVehicleFields: state.multiVehicleFields,
        smartFillMode: state.smartFillMode,
        bidPullSchemeId: state.bidPullSchemeId,
        assetLibraryPath: state.assetLibraryPath,
        activeAssets: state.activeAssets,
        poolSidebarWidth: state.poolSidebarWidth,
        poolWorkspaceHeight: state.poolWorkspaceHeight,
        // 核心分析环境（uploadedFiles/selected*/confirmed*/excluded*/ignored*）已迁移至
        // appDataDir/session.json，由 src/utils/sessionPersistence.ts 异步持久化，
        // 避免每次 set() 在主线程同步序列化 MB 级数据写 localStorage
    }),
}));
