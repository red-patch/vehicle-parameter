import React from 'react';
import { Alert, Button } from 'antd';

/**
 * 「还没选车型」的统一前置提示（版本对比 / 智能填报 / 数据体检共用）。
 *
 * 此前只有一句「请先在「车型资产」中选择车型」，用户得自己去顶部导航找入口；
 * 现在带上直达按钮。未传 onGoPool 时只显示文案（例如独立挂载、没有导航上下文时）。
 */
export interface SelectVehiclesHintProps {
    onGoPool?: () => void;
}

const SelectVehiclesHint: React.FC<SelectVehiclesHintProps> = ({ onGoPool }) => (
    <Alert
        type="info"
        showIcon
        message="请先在「车型资产」中选择车型"
        action={onGoPool ? <Button size="small" onClick={onGoPool}>去车型资产选择</Button> : undefined}
    />
);

export default SelectVehiclesHint;
