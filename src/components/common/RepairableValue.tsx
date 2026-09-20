import React from 'react';
import { Tooltip } from 'antd';

interface RepairableValueProps {
    value: React.ReactNode;
    repairable: boolean;
    onRepair: () => void;
    hint?: string;
    className?: string;
}

const RepairableValue: React.FC<RepairableValueProps> = ({
    value,
    repairable,
    onRepair,
    hint = '点击修复源数据',
    className = '',
}) => {
    if (!repairable) {
        return <span className={className}>{value}</span>;
    }

    return (
        <Tooltip title={hint}>
            <button
                type="button"
                title={hint}
                onClick={(event) => {
                    event.stopPropagation();
                    onRepair();
                }}
                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-[color:var(--warning-weak)] hover:text-[color:var(--warning-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--warning)] ${className}`}
            >
                {value}
            </button>
        </Tooltip>
    );
};

export default RepairableValue;
