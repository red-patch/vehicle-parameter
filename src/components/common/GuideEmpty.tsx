import React, { type ReactNode } from 'react';
import { Empty } from 'antd';

/**
 * 引导型空状态：一句话说明「为什么是空的」+ 下一步动作按钮。
 *
 * 用于「前置条件没满足」的空页面（未设置资产库目录、资产库无车型、筛选无结果等）。
 * 纯展示型空表格（「暂无数据」）继续用 antd `Empty`，不必换成本组件。
 * 动作按钮用默认样式：primary 只留给页面的产出/终点动作。
 */
export interface GuideEmptyProps {
    /** 主文案：说明现状，例如「没有匹配的资产」 */
    title: ReactNode;
    /** 补充说明：告诉用户怎么继续 */
    description?: ReactNode;
    /** 下一步动作（通常是一个或两个 Button） */
    action?: ReactNode;
    className?: string;
}

const GuideEmpty: React.FC<GuideEmptyProps> = ({ title, description, action, className }) => (
    <div className={`py-12 ${className ?? ''}`} role="status">
        <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
                <div className="flex flex-col items-center gap-1">
                    <span className="text-2 text-body">{title}</span>
                    {description && <span className="text-3 text-caption">{description}</span>}
                </div>
            }
        >
            {action && <div className="flex items-center justify-center gap-2">{action}</div>}
        </Empty>
    </div>
);

export default GuideEmpty;
