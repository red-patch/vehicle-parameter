import React from 'react';
import { Button, Popconfirm, Select, Tooltip } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import type { RowDiff } from '../../utils/vehicleFieldDiff';

/** 筛选栏里的「参考车型」下拉：选项含 value / label / title / disabled */
export const ReferenceProductSelect: React.FC<{
    value?: string;
    options: { value: string; label: string; title?: string; disabled?: boolean }[];
    onChange: (value?: string) => void;
}> = ({ value, options, onChange }) => (
    <Select
        style={{ width: 220 }}
        value={value}
        onChange={onChange}
        options={options}
        placeholder="不参考任何车型"
        allowClear
        showSearch
        optionFilterProp="label"
    />
);

/** 行内「视同」按钮：把参考车型的参数名/值/分组写进当前行 */
export const RowSyncButton: React.FC<{
    diff: RowDiff;
    onSync: () => void;
}> = ({ diff, onSync }) => (
    <div className="flex items-center gap-2">
        <span className="text-[12px] text-3 truncate" title={`参考：${diff.reference.name} / ${diff.reference.value}`}>
            参考：{String(diff.reference.value)}
        </span>
        <Tooltip title={`采纳参考车型的参数名、参数值与分组`}>
            <Button size="small" type="text" icon={<SyncOutlined />} onClick={onSync}>
                视同
            </Button>
        </Tooltip>
    </div>
);

/** 全量同步：一次把所有差异行的参数名/值/分组对齐到参考车型 */
export const SyncAllButton: React.FC<{
    diffFieldNames: string[];
    onSyncAll: () => void;
}> = ({ diffFieldNames, onSyncAll }) => {
    if (diffFieldNames.length === 0) {
        return (
            <Button size="small" icon={<SyncOutlined />} disabled>
                视同参考差异
            </Button>
        );
    }
    return (
        <Popconfirm
            title={`将按参考车型覆盖 ${diffFieldNames.length} 个字段的参数名、参数值与分组`}
            description={
                <div className="max-h-[240px] overflow-auto text-[12px] text-3 flex flex-col gap-0.5">
                    {diffFieldNames.map((name, i) => (
                        <span key={`${name}-${i}`}>{name}</span>
                    ))}
                </div>
            }
            okText="全部视同"
            cancelText="取消"
            onConfirm={onSyncAll}
        >
            <Button size="small" icon={<SyncOutlined />}>视同参考差异 ({diffFieldNames.length})</Button>
        </Popconfirm>
    );
};
