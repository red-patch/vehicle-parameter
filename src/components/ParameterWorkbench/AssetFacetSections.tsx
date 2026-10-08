import React from 'react';
import { Tag } from 'antd';
import AssetGroupedView from './AssetGroupedView';
import type { VehicleGroup } from '../../utils/assetGovernance';

export interface FacetSection {
    key: string;
    label: string;
    /** 「(无)」分节（该维度缺值的组） */
    isNone?: boolean;
    groups: (VehicleGroup & { displayName: string })[];
}

interface AssetFacetSectionsProps extends Omit<React.ComponentProps<typeof AssetGroupedView>, 'groups'> {
    sections: FacetSection[];
}

/**
 * 按受控属性分节渲染车型组（分组维度 = 主机厂 / 车型族群）：
 * 每节一个分组头 + 同款车型组卡片（AssetGroupedView 子集）。
 */
const AssetFacetSections: React.FC<AssetFacetSectionsProps> = ({ sections, ...viewProps }) => (
    <div className="space-y-3">
        {sections.map(section => (
            <div key={section.key}>
                <div className="flex items-center gap-2 px-1.5 pb-1">
                    <span className={`text-[13px] font-semibold ${section.isNone ? 'text-3' : 'text-1'}`}>
                        {section.label}
                    </span>
                    <Tag className="m-0 text-[11px] leading-[16px] px-1.5 rounded surface-inset border-default text-3">
                        {section.groups.length} 组
                    </Tag>
                    <span className="flex-1 h-px bg-[color:var(--border-default)]" />
                </div>
                <AssetGroupedView groups={section.groups} {...viewProps} />
            </div>
        ))}
    </div>
);

export default AssetFacetSections;
