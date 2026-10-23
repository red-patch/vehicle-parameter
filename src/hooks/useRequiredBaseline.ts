import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../store/vehicleStore';
import { buildRequiredBaseline, type RequiredBaseline } from '../utils/requiredBaseline';

/**
 * 当前必填基准（全局一份）。没选基准组时返回 `null`，
 * 调用方据此**整列/整个筛选不出现**，而不是把所有行判成「非必填」。
 */
export function useRequiredBaseline(): RequiredBaseline | null {
    const { requiredBaselineGroupId, fieldGroupsVersion } = useVehicleStore(useShallow(state => ({
        requiredBaselineGroupId: state.requiredBaselineGroupId,
        fieldGroupsVersion: state.fieldGroupsVersion,
    })));
    return useMemo(
        () => buildRequiredBaseline(requiredBaselineGroupId),
        [requiredBaselineGroupId, fieldGroupsVersion],
    );
}
