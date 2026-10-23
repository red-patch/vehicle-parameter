import { useCallback } from 'react';
import { Button, message } from 'antd';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../../store/vehicleStore';

/**
 * 一键清空工作集（资产车 + 本地车 + 各模块选中），带「撤销」。
 *
 * 为什么不做二次确认：清空是高频整理动作，Popconfirm 等于把「点两次」的问题
 * 换个地方（用户反馈的正是这个）。改成「一次点击 + 5 秒撤销」，误触的代价
 * 从「重新挑一遍车」降到「点一下撤销」，正常路径仍是一次点击。
 *
 * 两个入口（浮动胶囊上的清空键、浮层头部的「清空」）共用本 hook，
 * 保证同屏只有一种清空语义。
 */
export const useClearWorkspace = (): (() => void) => {
    const { clearActiveWorkspace, restoreActiveWorkspace } = useVehicleStore(useShallow(state => ({
        clearActiveWorkspace: state.clearActiveWorkspace,
        restoreActiveWorkspace: state.restoreActiveWorkspace,
    })));

    return useCallback(() => {
        const snapshot = clearActiveWorkspace();
        // 不必往 toast 里塞数量：胶囊的「N 台车」只数资产车，写的数字对不上反而生疑
        if (snapshot.selectedProductNames.length === 0) return;

        // 固定 key：连续清空时替换上一条，不会堆一列 toast
        const key = 'asset-workspace-cleared';
        message.open({
            key,
            type: 'success',
            duration: 5,
            content: (
                <span className="flex items-center gap-2">
                    <span>已清空工作集</span>
                    <Button
                        size="small"
                        type="link"
                        className="px-1"
                        onClick={() => {
                            restoreActiveWorkspace(snapshot);
                            message.destroy(key);
                        }}
                    >
                        撤销
                    </Button>
                </span>
            ),
        });
    }, [clearActiveWorkspace, restoreActiveWorkspace]);
};
