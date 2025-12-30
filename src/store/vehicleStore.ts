import { create } from 'zustand';
import type { SheetData, DiffResult, MatchItem, VehicleParameter } from '../types';

interface VehicleStore {
    baseFile: SheetData | null;
    targetFile: SheetData | null;
    diffResult: DiffResult | null;

    setBaseFile: (data: SheetData) => void;
    setTargetFile: (data: SheetData) => void;
    setDiffResult: (result: DiffResult) => void;

    // Smart Filler
    requirementFile: SheetData | null;
    matchResults: MatchItem[];
    selectedProduct: string | null;
    setRequirementFile: (data: SheetData) => void;
    setMatchResults: (results: MatchItem[]) => void;
    setSelectedProduct: (product: string | null) => void;
    updateMatchResult: (id: string, param: VehicleParameter | null) => void;

    reset: () => void;
}

export const useVehicleStore = create<VehicleStore>((set) => ({
    baseFile: null,
    targetFile: null,
    diffResult: null,

    setBaseFile: (data) => set({ baseFile: data }),
    setTargetFile: (data) => set({ targetFile: data }),
    setDiffResult: (result) => set({ diffResult: result }),

    // Smart Filler State
    requirementFile: null,
    matchResults: [],
    selectedProduct: null,
    setRequirementFile: (data) => set({ requirementFile: data }),
    setMatchResults: (results) => set({ matchResults: results }),
    setSelectedProduct: (product) => set({ selectedProduct: product }),
    updateMatchResult: (id, param) => set((state) => ({
        matchResults: state.matchResults.map(m =>
            m.id === id ? { ...m, matchedParam: param, isManual: true, confidence: 1 } : m
        )
    })),

    reset: () => set({ baseFile: null, targetFile: null, diffResult: null, requirementFile: null, matchResults: [], selectedProduct: null }),
}));
