import React from 'react';
import { Alert, Empty, Tag, Typography } from 'antd';
import SearchInput from '../../common/SearchInput';
import {
    combosOf,
    formatCombos,
    SHORTCUT_SCOPES,
    SHORTCUTS,
    type ShortcutEntry,
} from '../../../constants/shortcuts';
import { conflictingIds, findShortcutConflicts, scopeLabel } from '../../../utils/shortcutConflicts';

const { Text } = Typography;

/**
 * 快捷键 —— 全量总览 + 冲突检测（设计：docs/plans/2026-10-15-快捷键管理-design.md §4）。
 *
 * 全部从 `SHORTCUTS` 注册表渲染，**不手写任何一行按键**——这正是本页存在的理由：
 * 此前速查表是第三份手写副本，已与实现漂移过。冲突同样是算出来的（`findShortcutConflicts`），
 * 不是写死的清单，绑定一变，徽标自动跟着变。
 *
 * 本页只**展示与诊断**，不提供改键（用户已定：重绑留待独立设计）。
 */
const ShortcutsSection: React.FC = () => {
    const [query, setQuery] = React.useState('');

    const conflicts = React.useMemo(() => findShortcutConflicts(SHORTCUTS), []);
    const conflictIds = React.useMemo(() => conflictingIds(conflicts), [conflicts]);

    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return SHORTCUTS;
        return SHORTCUTS.filter(e => {
            const hay = [e.description, formatCombos(e.combo), scopeLabel(e.scope), e.note ?? '']
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [query]);

    const byScope = React.useMemo(() => {
        return SHORTCUT_SCOPES
            .map(scope => ({ scope, entries: filtered.filter(e => e.scope === scope.key) }))
            .filter(group => group.entries.length > 0);
    }, [filtered]);

    const renderEntry = (entry: ShortcutEntry) => {
        const hasConflict = conflictIds.has(entry.id);
        return (
            <div key={entry.id} className="flex items-start justify-between gap-4 py-1.5">
                <div className="min-w-0">
                    <span className="text-2">{entry.description}</span>
                    {hasConflict && <Tag color="warning" className="ml-2 !mr-0">冲突</Tag>}
                    {entry.note && <div className="text-caption text-3 mt-0.5">{entry.note}</div>}
                </div>
                <div className="flex-none flex gap-1">
                    {combosOf(entry).map(combo => (
                        <kbd
                            key={combo}
                            className="px-2 py-0.5 rounded surface-inset border border-default text-caption text-1 tabular-nums whitespace-nowrap"
                        >
                            {formatCombos(combo)}
                        </kbd>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-5">
            <div>
                <Text type="secondary" className="block mb-3">
                    应用内的全部键盘快捷键。带「冲突」标的是被多个功能占用的按键，同一次按键可能触发多个动作。
                </Text>
                <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="搜索快捷键或功能"
                    width="lg"
                />
            </div>

            {conflicts.length > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    message={`检测到 ${conflicts.length} 组按键冲突`}
                    description={
                        <ul className="list-disc pl-4 space-y-0.5 text-xs">
                            {conflicts.map(c => (
                                <li key={c.combo}>
                                    <span className="font-mono">{formatCombos(c.combo)}</span>
                                    {' '}被 {c.scopes.map(scopeLabel).join(' 与 ')} 同时占用
                                </li>
                            ))}
                        </ul>
                    }
                />
            )}

            {byScope.length === 0 ? (
                <Empty description="没有匹配的快捷键" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
                byScope.map(({ scope, entries }) => (
                    <section key={scope.key}>
                        <div className="text-title font-medium text-1 mb-1">{scope.label}</div>
                        <div className="divide-y divide-[var(--border-default)]">
                            {entries.map(renderEntry)}
                        </div>
                    </section>
                ))
            )}
        </div>
    );
};

export default ShortcutsSection;
