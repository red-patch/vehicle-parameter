import { create } from 'zustand';
import type { SheetData, DiffResult, MatchItem, VehicleParameter, CompareMode } from '../types';

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
}


export const useVehicleStore = create<VehicleStore>((set) => ({
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
        matchResults: state.matchResults.map(m =>
            m.id === id ? { ...m, manualValue: value, isManual: true } : m
        )
    })),

    // MIIT Data Import State
    miitData: null,
    setMiitData: (data) => set({ miitData: data }),

    reset: () => set({ baseFile: null, targetFile: null, diffResult: null, requirementFile: null, matchResults: [], selectedProduct: null, compareMode: 'content', miitData: null }),
}));

