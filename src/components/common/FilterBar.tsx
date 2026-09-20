import React, { type ReactNode } from 'react';

export interface FilterItemProps {
    label?: ReactNode;
    children: ReactNode;
    className?: string;
}

export const FilterItem: React.FC<FilterItemProps> = ({ label, children, className = '' }) => {
    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {label && <span className="font-semibold text-2 text-sm whitespace-nowrap">{label}</span>}
            {children}
        </div>
    );
};

export interface FilterBarProps {
    children?: ReactNode;
    extra?: ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export const FilterBar: React.FC<FilterBarProps> = ({ children, extra, className = '', style }) => {
    return (
        <div 
            className={`surface-container p-3 rounded border border-default flex items-center justify-between flex-wrap gap-4 mb-4 ${className}`}
            style={style}
        >
            <div className="flex items-center gap-4 flex-wrap flex-1">
                {children}
            </div>
            {extra && (
                <div className="flex items-center gap-2 flex-shrink-0">
                    {extra}
                </div>
            )}
        </div>
    );
};
