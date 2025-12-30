import type { VehicleParameter, SheetData, DiffResult } from '../types';

export const compareSheets = (base: SheetData, target: SheetData): DiffResult => {
    const baseMap = new Map(base.data.map(p => [p.id, p]));
    const targetMap = new Map(target.data.map(p => [p.id, p]));

    const added: VehicleParameter[] = [];
    const removed: VehicleParameter[] = [];
    const modified: { id: string; oldParam: VehicleParameter; newParam: VehicleParameter }[] = [];
    const unchanged: VehicleParameter[] = [];

    // Check for modifications and removals (iterate over base)
    baseMap.forEach((baseParam, id) => {
        const targetParam = targetMap.get(id);
        if (!targetParam) {
            removed.push(baseParam);
        } else {
            // Check if values changed
            // Simple string comparison for now. Might need number parsing later if precision issues arise.
            if (baseParam.value.toString() !== targetParam.value.toString()) {
                modified.push({
                    id,
                    oldParam: baseParam,
                    newParam: targetParam
                });
            } else {
                unchanged.push(baseParam);
            }
        }
    });

    // Check for additions (iterate over target)
    targetMap.forEach((targetParam, id) => {
        if (!baseMap.has(id)) {
            added.push(targetParam);
        }
    });

    return { added, removed, modified, unchanged };
};
