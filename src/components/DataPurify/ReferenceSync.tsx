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
        style={{ width: 200 }}
        value={value}
        onChange={onChange}
        options={options}
        placeholder="不参考任何车型"
        allowClear
        showSearch
        optionFilterProp="label"
    />
);

/** 行内「视同」按钮：把参考车型的参数值/分组写进当前行（参数名只读，不参与） */
export const RowSyncButton: React.FC<{
    diff: RowDiff;
    onSync: () => void;
}> = ({ diff, onSync }) => {
    const parts: string[] = [];
    if (diff.valueDiffers) parts.push('参数值');
    if (diff.groupDiffers) parts.push('分组');
    return (
        <Tooltip title={`采纳参考车型的${parts.join('、')}`}>
            <Button size="small" type="link" icon={<SyncOutlined />} onClick={onSync} className="!px-1">
                视同
            </Button>
        </Tooltip>
    );
};

/** 全量同步：一次把所有差异行的参数值/分组对齐到参考车型（参数名只读，不参与） */
export const SyncAllButton: React.FC<{
    diffFieldNames: string[];
    onSyncAll: () => void;
}> = ({ diffFieldNames, onSyncAll }) => {
    if (diffFieldNames.length === 0) {
        return (
            <Button icon={<SyncOutlined />} disabled>
                视同参考差异
            </Button>
        );
    }
    return (
        <Popconfirm
            title={`将按参考车型覆盖 ${diffFieldNames.length} 个字段的参数值与分组`}
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
            <Button icon={<SyncOutlined />}>视同参考差异 ({diffFieldNames.length})</Button>
        </Popconfirm>
    );
};
