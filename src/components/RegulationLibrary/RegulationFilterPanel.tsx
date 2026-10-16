import React from 'react';
import { Button, Card, Checkbox, Input, Select, Space, Typography } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { STATUS_ORDER, type RegulationFilters, type RegulationVocab } from '../../utils/regulationTypes';

const { Text } = Typography;

/** 折叠态本地记忆（纯偏好，不随库同步） */
const COLLAPSED_KEY = 'regulation-filter-collapsed';

interface Props {
    filters: RegulationFilters;
    vocab: RegulationVocab;
    /** 各状态的当前条数，0 条的状态置灰但仍显示（避免用户以为筛选项丢了） */
    statusCounts: Record<string, number>;
    onChange: (patch: Partial<RegulationFilters>) => void;
    onReset: () => void;
}

/**
 * 筛选面板：横切筛选（层级 × 主题域 × 状态）+ 关键词（设计 Q10/Q13/Q17）。
 * 维度之间是「与」，同一维度内多值是「或」——与资产受控属性的筛选语义一致。
 */
const RegulationFilterPanel: React.FC<Props> = ({ filters, vocab, statusCounts, onChange, onReset }) => {
    const statusOptions = Object.keys(statusCounts)
        .sort((a, b) => (STATUS_ORDER[a] ?? 9) - (STATUS_ORDER[b] ?? 9))
        .map(s => ({ label: `${s} (${statusCounts[s]})`, value: s }));

    const dirty =
        filters.levels.length > 0 ||
        filters.domains.length > 0 ||
        filters.statuses.length > 0 ||
        filters.query.trim() !== '';

    const [collapsed, setCollapsed] = React.useState<boolean>(() => {
        try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
    });
    const toggleCollapsed = () => {
        setCollapsed(prev => {
            const next = !prev;
            try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* 忽略 */ }
            return next;
        });
    };

    // 筛选行统一 12px 辅助字号 + 默认尺寸控件（此前 search 13px / Select small 12px 三档混排）
    const rowLabel = { fontSize: 'var(--fs-aux)', marginRight: 8 } as const;

    return (
        <Card size="small" className="shadow-sm" styles={{ body: { padding: '10px 12px' } }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div className="flex items-center gap-2">
                    <Input.Search
                        allowClear
                        placeholder="搜索标准号、名称、主题域…"
                        value={filters.query}
                        onChange={e => onChange({ query: e.target.value })}
                        style={{ flex: 1 }}
                    />
                    <Button
                        size="small"
                        type="text"
                        onClick={toggleCollapsed}
                        aria-expanded={!collapsed}
                        aria-label={collapsed ? '展开筛选' : '收起筛选'}
                    >
                        {collapsed ? '筛选' : '收起'} {collapsed ? <DownOutlined /> : <UpOutlined />}
                    </Button>
                </div>

                {!collapsed && (
                    <>
                        <div>
                            <Text type="secondary" style={rowLabel}>
                                层级
                            </Text>
                            <Checkbox.Group
                                options={vocab.levels}
                                value={filters.levels}
                                onChange={v => onChange({ levels: v as string[] })}
                            />
                        </div>

                        <div>
                            <Text type="secondary" style={rowLabel}>
                                主题域
                            </Text>
                            <Select
                                mode="multiple"
                                allowClear
                                placeholder="按主题域横切"
                                style={{ minWidth: 260 }}
                                value={filters.domains}
                                onChange={v => onChange({ domains: v })}
                                options={vocab.domains.map(d => ({ label: d, value: d }))}
                            />
                        </div>

                        <div>
                            <Text type="secondary" style={rowLabel}>
                                状态
                            </Text>
                            <Checkbox.Group
                                options={statusOptions}
                                value={filters.statuses}
                                onChange={v => onChange({ statuses: v as string[] })}
                            />
                        </div>

                        {dirty && (
                            <Text
                                type="secondary"
                                style={{ ...rowLabel, cursor: 'pointer' }}
                                onClick={onReset}
                            >
                                清除筛选
                            </Text>
                        )}
                    </>
                )}
            </Space>
        </Card>
    );
};

export default RegulationFilterPanel;
