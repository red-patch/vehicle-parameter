import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SheetData, DiffResult, MatchItem, VehicleParameter, CompareMode, RepairContext, AssetUpgradeDraft } from '../types';
import { calculateAllProductConfidences } from '../utils/productConfidence';
import { DEFAULT_POOL_SIDEBAR_WIDTH, DEFAULT_POOL_WORKSPACE_HEIGHT } from '../utils/poolLayout';

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
    requirementFile: SheetData | null;
    matchResults: MatchItem[];
    selectedProduct: string | null;
    setRequirementFile: (data: SheetData) => void;
    setMatchResults: (results: MatchItem[]) => void;
    setSelectedProduct: (product: string | null) => void;
    updateMatchResult: (id: string, param: VehicleParameter | null) => void;
    updateManualValue: (id: string, value: string) => void;

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
    currentSmartFillProduct: string | null;
    setPurifyProduct: (name: string | null) => void;
    setCompareProducts: (names: string[]) => void;
    setSmartFillProduct: (name: string | null) => void;

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
    requirementFile: null,
    matchResults: [],
    selectedProduct: null,
    setRequirementFile: (data) => set({ requirementFile: data }),
    setMatchResults: (results) => set({ matchResults: results }),
    setSelectedProduct: (product) => set({ selectedProduct: product }),
    updateMatchResult: (id, param) => set((state) => ({
        matchResults: state.matchResults.map(m =>
            m.id === id ? { ...m, matchedParam: param, isManual: true, confidence: 1, manualValue: undefined } : m
        )
    })),
    updateManualValue: (id, value) => set((state) => ({
        matchResults: state.matchResults.map(m => {
            if (m.id !== id) return m;
            
            // 智能检测：如果修改后的值等于自动匹配的值，清除manualValue
            const autoMatchValue = m.matchedParam?.value?.toString() || '';
            if (value === autoMatchValue) {
                // 恢复为自动匹配状态
                return { ...m, manualValue: undefined, isManual: false };
            }
            
            // 否则标记为手动修改
            return { ...m, manualValue: value, isManual: true };
        })
    })),

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
            const oldProducts = new Set(oldFile.data.map(p => p.productName || file.fileName));
            
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
        const fileProducts = new Map<string, number>();
        file.data.forEach(p => {
            const pName = p.productName || file.fileName;
            fileProducts.set(pName, (fileProducts.get(pName) || 0) + 1);
        });

        const products = Array.from(fileProducts.entries()).map(([name, count]) => ({
            name,
            paramCount: count
        }));

        const withConfidence = calculateAllProductConfidences(products);
        
        const autoSelected = withConfidence
            .filter((p) => p.level !== 'low')
            .map((p) => p.name);

        nextSelectedNames = Array.from(new Set([...nextSelectedNames, ...autoSelected]));

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
            ? Array.from(new Set(removedFile.data.map(p => p.productName || removedFile.fileName)))
            : [];
            
        return {
            uploadedFiles: nextFiles,
            // 自动剪枝：从全局选中列表和各个模块的当前选中中剔除
            selectedProductNames: state.selectedProductNames.filter(n => !affectedProductNames.includes(n)),
            ignoredProductNames: state.ignoredProductNames.filter(n => !affectedProductNames.includes(n)),
            currentPurifyProduct: affectedProductNames.includes(state.currentPurifyProduct || '') ? null : state.currentPurifyProduct,
            currentCompareProducts: state.currentCompareProducts.filter(n => !affectedProductNames.includes(n)),
            currentSmartFillProduct: affectedProductNames.includes(state.currentSmartFillProduct || '') ? null : state.currentSmartFillProduct
        };
    }),
    clearFiles: () => set({ 
        uploadedFiles: [], 
        selectedProductNames: [],
        ignoredProductNames: [],
        currentPurifyProduct: null,
        currentCompareProducts: [],
        currentSmartFillProduct: null,
        assetFiles: []
    }),
    setSelectedProductNames: (names) => set((state) => ({ 
        selectedProductNames: names,
        // 自动剪枝：若某个模块选中的车型在总列表中被取消勾选了，则同步清理
        currentPurifyProduct: (state.currentPurifyProduct && names.includes(state.currentPurifyProduct)) ? state.currentPurifyProduct : null,
        currentCompareProducts: state.currentCompareProducts.filter(n => names.includes(n)),
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
                            ? { ...p, productName: newProductName } 
                            : p
                    )
                };
            }
            return file;
        }),
        // 同步更改大纲选中索引数组
        selectedProductNames: state.selectedProductNames.map(n => n === oldProductName ? newProductName : n),
        confirmedProducts: state.confirmedProducts.map(n => n === oldProductName ? newProductName : n),
        excludedProducts: state.excludedProducts.map(n => n === oldProductName ? newProductName : n),
    })),

    renameAssetProduct: (fileName, oldProductName, newProductName) => set((state) => ({
        assetFiles: state.assetFiles.map(file => {
            if (file.fileName === fileName) {
                return {
                    ...file,
                    data: file.data.map(p =>
                        (p.productName || file.fileName) === oldProductName
                            ? { ...p, productName: newProductName }
                            : p
                    )
                };
            }
            return file;
        }),
        selectedProductNames: state.selectedProductNames.map(n => n === oldProductName ? newProductName : n),
        confirmedProducts: state.confirmedProducts.map(n => n === oldProductName ? newProductName : n),
        excludedProducts: state.excludedProducts.map(n => n === oldProductName ? newProductName : n),
        ignoredProductNames: state.ignoredProductNames.map(n => n === oldProductName ? newProductName : n),
        currentPurifyProduct: state.currentPurifyProduct === oldProductName ? newProductName : state.currentPurifyProduct,
        currentCompareProducts: state.currentCompareProducts.map(n => n === oldProductName ? newProductName : n),
        currentSmartFillProduct: state.currentSmartFillProduct === oldProductName ? newProductName : state.currentSmartFillProduct,
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
        requirementFile: null, 
        matchResults: [], 
        selectedProduct: null, 
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
        assetFiles: []
    }),

    // V6.2 Implementation
    activeAssets: [],
    addActiveAsset: (fileName, productName) => set((state) => ({
        activeAssets: state.activeAssets.includes(fileName) 
            ? state.activeAssets 
            : [...state.activeAssets, fileName],
        // 同步勾选核心选集
        selectedProductNames: Array.from(new Set([...state.selectedProductNames, productName]))
    })),
    removeActiveAsset: (fileName, productName) => set((state) => ({
        activeAssets: state.activeAssets.filter(n => n !== fileName),
        // 同步移出核心选集，保持状态闭环
        selectedProductNames: state.selectedProductNames.filter(n => n !== productName)
    })),
    renameActiveAsset: (oldFileName, newFileName, newProductName) => set((state) => {
        const oldProductName = state.assetFiles.find(file => file.fileName === oldFileName)?.data[0]?.productName
            || oldFileName.replace(/\.json$/i, '');

        return {
            activeAssets: state.activeAssets.map(n => n === oldFileName ? newFileName : n),
            selectedProductNames: state.selectedProductNames.map(n => {
                return n === oldProductName ? newProductName : n;
            }),
            currentPurifyProduct: state.currentPurifyProduct === oldProductName 
                ? newProductName 
                : state.currentPurifyProduct,
            currentCompareProducts: state.currentCompareProducts.map(n => 
                n === oldProductName ? newProductName : n
            ),
            currentSmartFillProduct: state.currentSmartFillProduct === oldProductName 
                ? newProductName 
                : state.currentSmartFillProduct,
        };
    }),

    currentPurifyProduct: null,
    currentCompareProducts: [],
    currentSmartFillProduct: null,
    setPurifyProduct: (name) => set({ currentPurifyProduct: name }),
    setCompareProducts: (names) => set({ currentCompareProducts: names }),
    setSmartFillProduct: (name) => set({ currentSmartFillProduct: name }),

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
}), {
    name: 'vehicle-parameter-storage',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({ 
        smartFillRequirements: state.smartFillRequirements, 
        multiVehicleFields: state.multiVehicleFields,
        assetLibraryPath: state.assetLibraryPath,
        activeAssets: state.activeAssets,
        // 核心分析环境持久化
        uploadedFiles: state.uploadedFiles,
        selectedProductNames: state.selectedProductNames,
        confirmedProducts: state.confirmedProducts,
        excludedProducts: state.excludedProducts,
        ignoredProductNames: state.ignoredProductNames,
        poolSidebarWidth: state.poolSidebarWidth,
        poolWorkspaceHeight: state.poolWorkspaceHeight,
    }),
}));
