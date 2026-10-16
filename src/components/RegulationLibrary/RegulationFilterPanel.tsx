import React from 'react';
import { Select, Typography } from 'antd';
import FacetChips from '../common/FacetChips';
import { STATUS_ORDER, type RegulationFilters, type RegulationVocab } from '../../utils/regulationTypes';

const { Text } = Typography;

interface Props {
    filters: RegulationFilters;
    vocab: RegulationVocab;
    /** 各状态的当前条数，0 条的状态仍显示（避免用户以为筛选项丢了） */
    statusCounts: Record<string, number>;
    onChange: (patch: Partial<RegulationFilters>) => void;
}

/**
 * 筛选维度：层级 × 主题域 × 状态（设计文档 Q10/Q13/Q17）。
 * 维度之间是「与」，同一维度内多值是「或」——与资产受控属性的筛选语义一致。
 *
 * 它**只渲染筛选维度的控件行**，不带外层容器——外壳由 ListToolbar 的 ② 筛选段承担
 * （设计：2026-10-16-列表页设计语言-design.md §4.1）。关键字搜索也在那一段，
 * 由调用方放置，本组件不管。
 *
 * 控件形态遵循同一份规范 §5：
 * - 定长枚举（层级 / 状态）用 FacetChips，不再用 Checkbox.Group（禁项）
 * - 主题域保留 Select multiple——它是**可增长的开放词表**（用户能增删），
 *   而 FacetChips 的 options 是定长枚举；规范未覆盖此场景
 */
const RegulationFilterPanel: React.FC<Props> = ({ filters, vocab, statusCounts, onChange }) => {
    const statusOptions = Object.keys(statusCounts)
        .sort((a, b) => (STATUS_ORDER[a] ?? 9) - (STATUS_ORDER[b] ?? 9))
        .map(s => ({ value: s, label: s, count: statusCounts[s] }));

    const rowLabel = { fontSize: 'var(--fs-aux)' } as const;

    return (
        <>
            {vocab.levels.length > 0 && (
                <div className="flex items-center gap-2">
                    <Text type="secondary" style={rowLabel}>层级</Text>
                    <FacetChips
                        multiple
                        options={vocab.levels.map(l => ({ value: l, label: l }))}
                        value={filters.levels}
                        onChange={v => onChange({ levels: v })}
                    />
                </div>
            )}

            <div className="flex items-center gap-2">
                <Text type="secondary" style={rowLabel}>主题域</Text>
                <Select
                    mode="multiple"
                    allowClear
                    placeholder="按主题域横切"
                    style={{ minWidth: 240 }}
                    value={filters.domains}
                    onChange={v => onChange({ domains: v })}
                    options={vocab.domains.map(d => ({ label: d, value: d }))}
                />
            </div>

            {statusOptions.length > 0 && (
                <div className="flex items-center gap-2">
                    <Text type="secondary" style={rowLabel}>状态</Text>
                    <FacetChips
                        multiple
                        options={statusOptions}
                        value={filters.statuses}
                        onChange={v => onChange({ statuses: v })}
                    />
                </div>
            )}
        </>
    );
};

export default RegulationFilterPanel;
