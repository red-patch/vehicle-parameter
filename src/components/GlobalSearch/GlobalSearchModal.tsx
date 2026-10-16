import React from 'react';
import { Input, Modal, Spin, Tag } from 'antd';
import type { InputRef } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useGlobalSearchStore } from '../../store/globalSearchStore';
import { useVehicleStore } from '../../store/vehicleStore';
import { useAnnouncementStore } from '../../store/announcementStore';
import { useRegulationStore } from '../../store/regulationStore';
import { useGlobalSearchHotkey } from './useGlobalSearchHotkey';
import { useAssetLibrarySnapshot } from '../../hooks/useAssetLibrarySnapshot';
import {
    assetToSearchItem,
    announcementToSearchItem,
    regulationToSearchItem,
    buildGlobalSearchIndex,
    searchAllDomains,
    type GlobalSearchIndex,
    type GlobalSearchResults,
    type SearchItem,
} from '../../utils/globalSearch';
import { resolveAssetDisplayName, buildAliasSource } from '../../utils/assetAlias';
import { extractBrandNames, resolveVehicleGroupKey } from '../../utils/assetGovernance';
import { getAssetTagGroupsSync } from '../../utils/assetTagGroups';

/** 每组最多直接展示的条数（组尾「查看全部」承接其余命中） */
const MAX_PER_GROUP = 5;

type DomainKey = 'assets' | 'announcements' | 'regulations';

/** 域 → 目标页 tab 与展示名（跳页 + 预填的目标） */
const DOMAIN_TARGET: Record<DomainKey, { tab: string; label: string }> = {
    assets: { tab: 'pool', label: '车型资产' },
    announcements: { tab: 'announcement', label: '公告中心' },
    regulations: { tab: 'regulation', label: '法规标准' },
};

const DOMAIN_ORDER: DomainKey[] = ['assets', 'announcements', 'regulations'];

/** 结果行：域内单个命中 */
interface ResultRow {
    kind: 'item';
    domain: DomainKey;
    item: SearchItem & { score: number };
}

/** 组尾行：「在 XX 中查看全部 N 条」——Enter 同样跳页+预填 */
interface SeeAllRow {
    kind: 'seeAll';
    domain: DomainKey;
    total: number;
}

type Row = ResultRow | SeeAllRow;

const EMPTY_RESULTS: GlobalSearchResults = {
    assets: { items: [], total: 0 },
    announcements: { items: [], total: 0 },
    regulations: { items: [], total: 0 },
};

/**
 * 全局搜索面板（⌘K）：跨域查询车型资产 / 公告记录 / 法规标准。
 *
 * 架构对齐 SettingsModal：常驻挂载 MainLayout，开合由 globalSearchStore 单点驱动；
 * 三域数据在面板打开时才拉取（复用各 store 既有加载与缓存），关闭不拉。
 * 选中行为 = 跳页 + 预填目标页搜索框（pendingGlobalSearch 一次性信号，App 消费）。
 */
const GlobalSearchModal: React.FC = () => {
    useGlobalSearchHotkey();

    const isOpen = useGlobalSearchStore(s => s.isOpen);
    const close = useGlobalSearchStore(s => s.close);
    const setPendingGlobalSearch = useVehicleStore(s => s.setPendingGlobalSearch);
    const assetLibraryPath = useVehicleStore(s => s.assetLibraryPath);
    const regulationRootPath = useRegulationStore(s => s.rootPath);
    const regulationLoading = useRegulationStore(s => s.loading);
    const snapshot = useAssetLibrarySnapshot();
    const announcementLoading = useAnnouncementStore(s => s.loading);
    const announcementLoadFor = useAnnouncementStore(s => s.loadFor);
    const announcementInfos = useAnnouncementStore(s => s.infos);
    const regulationRecords = useRegulationStore(s => s.sidecar.records);

    const [query, setQuery] = React.useState('');
    const [debouncedQuery, setDebouncedQuery] = React.useState('');
    const [activeIndex, setActiveIndex] = React.useState(0);

    const inputRef = React.useRef<InputRef>(null);
    const listRef = React.useRef<HTMLDivElement>(null);

    // 打开时才拉数据：公告 loadFor（同路径复用缓存）+ 法规 load（自带未加载守卫）。
    // 资产快照走 useAssetLibrarySnapshot（打开才订阅，路径就绪即拉，独立缓存）。
    React.useEffect(() => {
        if (!isOpen) return;
        void announcementLoadFor(assetLibraryPath);
        if (regulationRootPath) void useRegulationStore.getState().load();
    }, [isOpen, assetLibraryPath, regulationRootPath, announcementLoadFor]);

    // 打开即聚焦输入框
    React.useEffect(() => {
        if (isOpen) {
            setQuery('');
            setDebouncedQuery('');
            setActiveIndex(0);
            // Modal 动画后再聚焦，避免 autofocus 抢跑
            const t = setTimeout(() => inputRef.current?.focus(), 50);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    // 输入防抖 150ms（设计 §3.3）
    React.useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedQuery(query);
            setActiveIndex(0);
        }, 150);
        return () => clearTimeout(t);
    }, [query]);

    // 索引构建：三域 → 检索条目。资产域的别名解析与资产池同口径（六路搜索的实质来源）。
    const index = React.useMemo<GlobalSearchIndex | null>(() => {
        if (!isOpen) return null;
        const brandNames = extractBrandNames(getAssetTagGroupsSync().groups);
        const aliasSource = buildAliasSource(
            snapshot.infos,
            snapshot.meta,
            snapshot.latestSet,
            info => resolveVehicleGroupKey(info, snapshot.meta[info.fileName], brandNames),
        );
        const assets = snapshot.infos.map(info => assetToSearchItem(
            info,
            resolveAssetDisplayName(info, aliasSource),
            snapshot.tags[info.fileName] || [],
            info.manufacturerRaw ?? null,
        ));
        const announcements = announcementInfos
            .filter(i => !i.orphan)
            .map(announcementToSearchItem);
        const regulations = regulationRecords.map(regulationToSearchItem);
        return buildGlobalSearchIndex({ assets, announcements, regulations });
    }, [isOpen, snapshot, announcementInfos, regulationRecords]);

    // 搜索结果（防抖后的查询；三域独立降级，单域失败不影响整体——store 层已 catch）
    const results = React.useMemo<GlobalSearchResults>(() => {
        if (!index) return EMPTY_RESULTS;
        return searchAllDomains(index, debouncedQuery);
    }, [index, debouncedQuery]);

    // 扁平化结果行（含组尾「查看全部」行），供键盘导航
    const rows = React.useMemo<Row[]>(() => {
        const out: Row[] = [];
        DOMAIN_ORDER.forEach(domain => {
            const r = results[domain];
            if (r.items.length === 0) return;
            r.items.slice(0, MAX_PER_GROUP).forEach(item => {
                out.push({ kind: 'item', domain, item });
            });
            if (r.total > r.items.length) {
                out.push({ kind: 'seeAll', domain, total: r.total });
            }
        });
        return out;
    }, [results]);

    // 选中行为：跳页 + 预填（一次性信号，App 层消费后清空）
    const commit = React.useCallback((row: Row) => {
        const keyword = debouncedQuery.trim();
        if (!keyword) return;
        setPendingGlobalSearch({ tab: DOMAIN_TARGET[row.domain].tab, keyword });
        close();
    }, [debouncedQuery, setPendingGlobalSearch, close]);

    // 键盘导航：↑↓ 移动、Enter 确认
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => {
                if (rows.length === 0) return 0;
                if (e.key === 'ArrowDown') return (prev + 1) % rows.length;
                return (prev - 1 + rows.length) % rows.length;
            });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const row = rows[activeIndex];
            if (row) commit(row);
        }
    };

    // 滚动跟随选中行
    React.useEffect(() => {
        const el = listRef.current?.querySelectorAll<HTMLElement>('[data-row-index]')[activeIndex];
        el?.scrollIntoView?.({ block: 'nearest' });
    }, [activeIndex]);

    // 空查询：三域数量统计
    const totalCounts = React.useMemo(() => ({
        assets: index?.assets.length ?? 0,
        announcements: index?.announcements.length ?? 0,
        regulations: index?.regulations.length ?? 0,
    }), [index]);

    const hasQuery = debouncedQuery.trim().length > 0;
    const loading = snapshot.loading || announcementLoading || regulationLoading;

    // 空态文案：有查询时永远反馈「无匹配」（当下动作的结果）；配置引导只在空查询时出现
    const emptyHint = hasQuery
        ? '没有匹配的结果'
        : !assetLibraryPath
            ? '资产库未配置——先在设置中指定资产库目录'
            : '输入关键字搜索资产 / 公告 / 法规';

    // 结果行渲染（React.memo 化避免每键全列表重渲——设计 §3.3）
    const renderRow = (row: Row, i: number) => {
        const active = i === activeIndex;
        const rowClass = `flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${
            active ? 'surface-inset' : 'hover:surface-inset'
        }`;
        if (row.kind === 'seeAll') {
            return (
                <div
                    key={`seeAll-${row.domain}`}
                    data-row-index={i}
                    className={rowClass}
                    onClick={() => commit(row)}
                >
                    <span className="text-2 text-caption">
                        在{DOMAIN_TARGET[row.domain].label}中查看全部 {row.total} 条
                    </span>
                </div>
            );
        }
        const { item } = row;
        return (
            <div
                key={`${row.domain}-${item.id}`}
                data-row-index={i}
                className={rowClass}
                onClick={() => commit(row)}
                onMouseEnter={() => setActiveIndex(i)}
            >
                <Tag className="mr-0 shrink-0" color={row.domain === 'assets' ? 'blue' : row.domain === 'announcements' ? 'gold' : 'green'}>
                    {DOMAIN_TARGET[row.domain].label}
                </Tag>
                <span className="min-w-0 flex-1 truncate text-body text-1">{item.primary}</span>
                {item.secondary && (
                    <span className="min-w-0 max-w-[45%] truncate text-caption text-3">{item.secondary}</span>
                )}
            </div>
        );
    };

    return (
        <Modal
            title={null}
            open={isOpen}
            onCancel={close}
            footer={null}
            width={640}
            centered
            styles={{ body: { padding: 0 } }}
            closable={false}
            destroyOnHidden
        >
            <div className="flex flex-col max-h-[70vh]" data-testid="global-search-panel">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-default">
                    <SearchOutlined className="text-2 shrink-0" />
                    <Input
                        ref={inputRef}
                        variant="borderless"
                        placeholder="搜索车型资产 / 公告记录 / 法规标准…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        allowClear
                        data-testid="global-search-input"
                    />
                    <Tag className="mr-0 shrink-0">Esc 关闭</Tag>
                </div>

                <div ref={listRef} className="flex-1 overflow-y-auto">
                    {loading && rows.length === 0 && (
                        <div className="flex justify-center py-8">
                            <Spin />
                        </div>
                    )}

                    {!hasQuery && !loading && (
                        <div className="px-4 py-6 text-center text-caption text-3">
                            <div className="mb-2">{emptyHint}</div>
                            <div className="tabular-nums">
                                车型资产 {totalCounts.assets} · 公告记录 {totalCounts.announcements} · 法规标准 {totalCounts.regulations}
                            </div>
                        </div>
                    )}

                    {hasQuery && !loading && rows.length === 0 && (
                        <div className="px-4 py-8 text-center text-caption text-3">{emptyHint}</div>
                    )}

                    {rows.length > 0 && (
                        <div className="py-1">
                            {rows.map(renderRow)}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default GlobalSearchModal;
