import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SheetData, DiffResult, MatchItem, VehicleParameter, CompareMode } from '../types';
import { calculateAllProductConfidences } from '../utils/productConfidence';

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

    reset: () => void;

    // V3.0 Unified Pool
    uploadedFiles: SheetData[];
    selectedProductNames: string[];
    addFile: (file: SheetData) => void;
    removeFile: (fileName: string) => void;
    clearFiles: () => void;
    setSelectedProductNames: (names: string[]) => void;
    
    // V3.1 产品置信度管理
    confirmedProducts: string[];      // 用户确认的产品（低置信度但有效）
    excludedProducts: string[];       // 用户排除的产品（误识别的）
    confirmProduct: (name: string) => void;
    excludeProduct: (name: string) => void;
    resetProductStatus: (name: string) => void;
    renameProduct: (oldName: string, newName: string) => void;

    // UX 持久化状态
    smartFillRequirements: string;
    multiVehicleFields: string;
    setSmartFillRequirements: (text: string) => void;
    setMultiVehicleFields: (text: string) => void;
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

    // Unified File Pool (V3.0)
    uploadedFiles: [],
    selectedProductNames: [],
    
    addFile: (file) => set((state) => {
        // Dedup by filename
        if (state.uploadedFiles.some(f => f.fileName === file.fileName)) {
            return state;
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

        const newSelectedNames = Array.from(new Set([...state.selectedProductNames, ...autoSelected]));

        return { 
            uploadedFiles: [...state.uploadedFiles, file],
            selectedProductNames: newSelectedNames
        };
    }),
    removeFile: (fileName) => set((state) => ({
        uploadedFiles: state.uploadedFiles.filter(f => f.fileName !== fileName)
    })),
    clearFiles: () => set({ uploadedFiles: [] }),
    setSelectedProductNames: (names) => set({ selectedProductNames: names }),

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

    renameProduct: (oldName, newName) => set((state) => ({
        uploadedFiles: state.uploadedFiles.map(file => ({
            ...file,
            data: file.data.map(p => p.productName === oldName ? { ...p, productName: newName } : p)
        })),
        selectedProductNames: state.selectedProductNames.map(n => n === oldName ? newName : n),
        confirmedProducts: state.confirmedProducts.map(n => n === oldName ? newName : n),
        excludedProducts: state.excludedProducts.map(n => n === oldName ? newName : n),
    })),

    // UX 持久化
    smartFillRequirements: '',
    multiVehicleFields: '',
    setSmartFillRequirements: (text) => set({ smartFillRequirements: text }),
    setMultiVehicleFields: (text) => set({ multiVehicleFields: text }),

    reset: () => set({ 
        baseFile: null, 
        targetFile: null, 
        diffResult: null, 
        requirementFile: null, 
        matchResults: [], 
        selectedProduct: null, 
        compareMode: 'content', 
        miitData: null,
        // V3.0
        uploadedFiles: [],
        selectedProductNames: [],
        // V3.1
        confirmedProducts: [],
        excludedProducts: []
    }),
}), {
    name: 'vehicle-parameter-storage',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({ 
        smartFillRequirements: state.smartFillRequirements, 
        multiVehicleFields: state.multiVehicleFields 
    }),
}));

