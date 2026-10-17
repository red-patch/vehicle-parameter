import React from 'react';
import { Tooltip } from 'antd';

/**
 * 动态列标题（车型名等不可控长度的表头；设计：2026-10-17-列表区统一设计语言 §3.4）。
 *
 * 真实车型名常带整段厂商全称（如「智云S300 宁德时代新能源科技股份有限公司 100.07 SX5047…」，
 * 50+ 字），表头折成 2–3 行后高 54–73px，打破「表头 36」且各列宽度失控。
 * 统一为：单行截断 + 悬停看全名。配合列上 `ellipsis: true` 使用（让表格按列宽布局）。
 */
const ColumnTitle: React.FC<{ children: string }> = ({ children }) => (
    <Tooltip title={children} placement="topLeft">
        <span className="block truncate">{children}</span>
    </Tooltip>
);

export default ColumnTitle;
