import React from 'react';
import { Alert, Button, Dropdown, Input, Modal, Space, Tag, Tooltip, Typography, message } from 'antd';
import {
    FolderOpenOutlined,
    ReloadOutlined,
    SaveOutlined,
    MoreOutlined,
    SettingOutlined,
} from '@ant-design/icons';
import { useRegulationStore } from '../../store/regulationStore';
import { useVehicleStore } from '../../store/vehicleStore';
import { extractHints } from '../../utils/regulationIO';
import {
    STATUS_VALUES,
    applyHints,
    deriveStatus,
    filterRecords,
    statusLabel,
    type RegulationRecord,
} from '../../utils/regulationTypes';
import RegulationFilterPanel from './RegulationFilterPanel';
import ListToolbar from '../common/ListToolbar';
import SearchInput from '../common/SearchInput';
import GuideEmpty from '../common/GuideEmpty';
import RegulationTable from './RegulationTable';
import RegulationImportModal from './RegulationImportModal';
import RegulationDetailDrawer from './RegulationDetailDrawer';

const { Text } = Typography;

/**
 * 法规标准库主视图（设计文档 §2）。
 *
 * 独立记录域，与资产库/公告中心并列；库路径独立（Q11），元数据写在库根
 * `_regulations.json`（iCloud 同步，跨机器自带）。P0 只做元数据索引——
 * 全文检索与权威核验在 P1（设计 §7）。
 */
const RegulationLibrary: React.FC = () => {
    const rootPath = useRegulationStore(s => s.rootPath);
    const sidecar = useRegulationStore(s => s.sidecar);
    const scan = useRegulationStore(s => s.scan);
    const filters = useRegulationStore(s => s.filters);
    const loading = useRegulationStore(s => s.loading);
    const saving = useRegulationStore(s => s.saving);
    const error = useRegulationStore(s => s.error);

    const setRootPath = useRegulationStore(s => s.setRootPath);
    const setFilters = useRegulationStore(s => s.setFilters);
    const resetFilters = useRegulationStore(s => s.resetFilters);
    const load = useRegulationStore(s => s.load);
    const rescan = useRegulationStore(s => s.rescan);
    const persistSidecar = useRegulationStore(s => s.persistSidecar);
    const registerFiles = useRegulationStore(s => s.registerFiles);
    const upsertRecord = useRegulationStore(s => s.upsertRecord);
    const removeRecord = useRegulationStore(s => s.removeRecord);
    const setVocab = useRegulationStore(s => s.setVocab);

    const [importOpen, setImportOpen] = React.useState(false);
    const [selected, setSelected] = React.useState<RegulationRecord | null>(null);
    const [vocabOpen, setVocabOpen] = React.useState(false);
    const [newDomain, setNewDomain] = React.useState('');

    // 记录被删除/编辑后，抽屉里那份是旧对象——按身份+版本回查当前值
    const selectedLive = React.useMemo(() => {
        if (!selected) return null;
        return (
            sidecar.records.find(
                r => r.standardNo === selected.standardNo && (r.year ?? null) === (selected.year ?? null),
            ) ?? null
        );
    }, [selected, sidecar.records]);

    // 进页面即载入（有库路径时）；换路径后由 handlePick 显式触发
    React.useEffect(() => {
        if (rootPath && !scan && !loading) void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在 rootPath 首次就绪时拉一次
    }, [rootPath]);

    // 全局搜索面板（⌘K）跳转：预填法规关键词（一次性信号，见 docs/plans/2026-10-15-全局搜索面板-design.md §3.4）
    const pendingGlobalSearch = useVehicleStore(s => s.pendingGlobalSearch);
    const setPendingGlobalSearch = useVehicleStore(s => s.setPendingGlobalSearch);
    React.useEffect(() => {
        if (pendingGlobalSearch && pendingGlobalSearch.tab === 'regulation') {
            setFilters({ query: pendingGlobalSearch.keyword });
            setPendingGlobalSearch(null);
        }
    }, [pendingGlobalSearch, setPendingGlobalSearch, setFilters]);

    const handlePick = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const picked = await open({
                directory: true,
                multiple: false,
                title: '选择法规标准库目录',
            });
            if (picked && typeof picked === 'string') {
                setRootPath(picked);
                await load(picked);
            }
        } catch (e) {
            console.error('选择目录失败', e);
            message.error('选择目录失败');
        }
    };

    const handleRegister = async (
        entries: Array<{ file: Parameters<typeof registerFiles>[0][number]['file']; overrides: Partial<RegulationRecord> }>,
    ) => {
        try {
            registerFiles(entries);
            await persistSidecar();
            setImportOpen(false);
            await rescan();
            message.success(`已登记 ${entries.length} 条`);

            // 登记后立刻抓首页日期/代替关系补进元数据（Q16）。
            // 放在后台做：预填是锦上添花，不该让用户等——抽到就静默写回。
            void enrichWithHints(entries.map(e => e.file.fileName));
        } catch (e) {
            message.error(e instanceof Error ? e.message : '写入失败');
        }
    };

    /** 对刚登记的文件抓首页线索并补进记录（抽不到就跳过） */
    const enrichWithHints = async (fileNames: string[]) => {
        if (!rootPath) return;
        let changed = false;
        for (const fileName of fileNames) {
            const rec = useRegulationStore
                .getState()
                .sidecar.records.find(r => r.fileName === fileName);
            if (!rec) continue;
            try {
                const { join } = await import('@tauri-apps/api/path');
                const full = await join(rootPath, fileName);
                const hints = await extractHints(full);
                if (!hints) continue;
                const next = applyHints(rec, hints);
                if (
                    next.publishedAt !== rec.publishedAt ||
                    next.effectiveAt !== rec.effectiveAt ||
                    next.status !== rec.status ||
                    next.textLayer !== rec.textLayer ||
                    next.replaces.join() !== rec.replaces.join()
                ) {
                    upsertRecord(next);
                    changed = true;
                }
            } catch {
                // 单份失败不影响其余
            }
        }
        if (changed) {
            try {
                await persistSidecar();
                await rescan();
            } catch (e) {
                console.error('写回首页预填失败', e);
            }
        }
    };

    const handleSaveRecord = async (next: RegulationRecord) => {
        upsertRecord(next);
        await persistSidecar();
        await rescan();
        // 身份+版本可能变了，重新指向新键
        setSelected(next);
    };

    const handleDeleteRecord = async (rec: RegulationRecord) => {
        removeRecord(rec.standardNo, rec.year);
        await persistSidecar();
        await rescan();
    };

    const handleAddDomain = () => {
        const d = newDomain.trim();
        if (!d) return;
        if (sidecar.vocab.domains.includes(d)) {
            message.info('该主题域已存在');
            return;
        }
        setVocab({ domains: [...sidecar.vocab.domains, d] });
        setNewDomain('');
    };

    const handleOpenFile = async (rec: RegulationRecord) => {
        if (!rec.fileName || !rootPath) return;
        try {
            const { join } = await import('@tauri-apps/api/path');
            const full = await join(rootPath, rec.fileName);
            const { openPath } = await import('@tauri-apps/plugin-opener');
            await openPath(full);
        } catch (e) {
            console.error('打开文件失败', e);
            message.error('打开文件失败');
        }
    };

    // 列表展示：同身份只留最新版为主行（版本链在详情里展开）
    const filtered = React.useMemo(
        () => filterRecords(sidecar.records, filters),
        [sidecar.records, filters],
    );

    const statusCounts = React.useMemo(() => {
        const counts: Record<string, number> = {};
        for (const s of STATUS_VALUES) counts[s] = 0;
        for (const r of sidecar.records) {
            const s = statusLabel(deriveStatus(r));
            counts[s] = (counts[s] ?? 0) + 1;
        }
        // 只保留有值的状态，避免空状态占位
        return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
    }, [sidecar.records]);

    const unregistered = scan?.unregistered ?? [];

    /** 筛选是否处于激活态（决定「清除筛选」是否出现） */
    const filtersDirty =
        filters.levels.length > 0 ||
        filters.domains.length > 0 ||
        filters.statuses.length > 0 ||
        filters.query.trim() !== '';

    return (
        <div className="p-4" style={{ height: '100%', overflow: 'auto' }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {error && (
                    <Alert
                        type={error.includes('桌面端') ? 'info' : 'error'}
                        showIcon
                        closable
                        message={error}
                    />
                )}

                {!rootPath ? (
                    // 前置条件未满足 → GuideEmpty（与公告归档 / 资产池同一构件；动作按钮 default，
                    // primary 只留给产出/终点动作）
                    <ListToolbar title="法规标准">
                        <GuideEmpty
                            title="还没有指定法规标准库目录"
                            description="选一个放着标准 PDF 的目录即可开始。文件仍留在原处，本工具只登记元数据。"
                            action={<Button onClick={() => void handlePick()}>选择法规标准库目录</Button>}
                        />
                    </ListToolbar>
                ) : (
                    <>
                        {unregistered.length > 0 && (
                            <Alert
                                type="warning"
                                showIcon
                                message={`发现 ${unregistered.length} 个未登记文件`}
                                description={
                                    <Space size={8} wrap>
                                        <Text style={{ fontSize: 'var(--fs-aux)' }}>
                                            盘上有、库里还没有的文件。登记后才会进入列表。
                                        </Text>
                                        <Button size="small" type="primary" onClick={() => setImportOpen(true)}>
                                            查看并登记
                                        </Button>
                                    </Space>
                                }
                            />
                        )}

                        {/* 列表页外壳统一走 ListToolbar 三段（设计语言 §4.1/§4.3）：
                            此前是「无标题操作行 + 筛选 Card + 记录 Card」三块并列。 */}
                        <ListToolbar
                            padded={false}
                            title="法规标准"
                            count={{ shown: filtered.length, total: sidecar.records.length }}
                            subtitle={rootPath ? <span title={rootPath}>{rootPath}</span> : undefined}
                            actions={
                                <>
                                    {/* §5.1：primary 只给产出/终点动作；本页主任务是浏览与治理，
                                        选择目录/刷新/保存/设置都是过程动作，一律 default */}
                                    <Tooltip title="把当前记录写回库目录下的 _regulations.json">
                                        <Button
                                            icon={<SaveOutlined />}
                                            loading={saving}
                                            onClick={() => void persistSidecar()}
                                        >
                                            保存
                                        </Button>
                                    </Tooltip>
                                    {/* §5.1：≥3 个过程动作时低频项收进「更多」（换目录、词表设置都不常用） */}
                                    <Dropdown
                                        trigger={['click']}
                                        menu={{
                                            items: [
                                                { key: 'pick', icon: <FolderOpenOutlined />, label: '更换库目录' },
                                                { key: 'vocab', icon: <SettingOutlined />, label: '主题域词表设置' },
                                            ],
                                            onClick: ({ key }) => {
                                                if (key === 'pick') void handlePick();
                                                else setVocabOpen(true);
                                            },
                                        }}
                                    >
                                        <Button icon={<MoreOutlined />} aria-label="更多操作" />
                                    </Dropdown>
                                    <Tooltip title="重新扫描库目录">
                                        <Button
                                            icon={<ReloadOutlined />}
                                            aria-label="重新扫描库目录"
                                            disabled={!rootPath}
                                            loading={loading}
                                            onClick={() => void rescan()}
                                        />
                                    </Tooltip>
                                </>
                            }
                            filters={
                                <>
                                    {/* 筛选行顺序（列表区设计语言 §5.3）：维度筛选在左，搜索靠右、不带标签 */}
                                    <RegulationFilterPanel
                                        filters={filters}
                                        vocab={sidecar.vocab}
                                        statusCounts={statusCounts}
                                        onChange={setFilters}
                                    />
                                    {filtersDirty && (
                                        <Button type="link" size="small" className="px-0" onClick={resetFilters}>
                                            清除筛选
                                        </Button>
                                    )}
                                    <span className="ml-auto" />
                                    <SearchInput
                                        width="md"
                                        placeholder="搜索标准号、名称、主题域"
                                        value={filters.query}
                                        onChange={q => setFilters({ query: q })}
                                    />
                                </>
                            }
                        >
                            <RegulationTable
                                records={filtered}
                                loading={loading}
                                onOpen={rec => setSelected(rec)}
                            />
                        </ListToolbar>
                    </>
                )}
            </Space>

            <RegulationImportModal
                open={importOpen}
                files={unregistered}
                vocab={sidecar.vocab}
                existing={sidecar.records}
                onCancel={() => setImportOpen(false)}
                onConfirm={handleRegister}
            />

            <RegulationDetailDrawer
                open={!!selected}
                record={selectedLive}
                allRecords={sidecar.records}
                sites={sidecar.sites}
                vocab={sidecar.vocab}
                onOpenFile={rec => void handleOpenFile(rec)}
                onSelectVersion={rec => setSelected(rec)}
                onSave={handleSaveRecord}
                onDelete={handleDeleteRecord}
                onClose={() => setSelected(null)}
            />

            {/* 主题域词表：种子值来自设计 §4.3，用户可增补；写入旁路文件随库同步 */}
            <Modal
                open={vocabOpen}
                title="主题域词表"
                onCancel={() => setVocabOpen(false)}
                onOk={async () => {
                    try {
                        await persistSidecar();
                        setVocabOpen(false);
                        message.success('已保存词表');
                    } catch (e) {
                        message.error(e instanceof Error ? e.message : '保存失败');
                    }
                }}
                okText="保存"
                cancelText="关闭"
            >
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <Text type="secondary" style={{ fontSize: 'var(--fs-aux)' }}>
                        主题域是受控词表主题（不是受控属性——层级才是），可多值。词表跟着库走（写在库目录的旁路文件里），换机器也生效。
                    </Text>
                    <Space wrap>
                        {sidecar.vocab.domains.map(d => (
                            <Tag
                                key={d}
                                closable
                                color="geekblue"
                                onClose={e => {
                                    e.preventDefault();
                                    setVocab({ domains: sidecar.vocab.domains.filter(x => x !== d) });
                                }}
                            >
                                {d}
                            </Tag>
                        ))}
                    </Space>
                    <Space.Compact style={{ width: '100%' }}>
                        <Input
                            placeholder="新增主题域"
                            value={newDomain}
                            onChange={e => setNewDomain(e.target.value)}
                            onPressEnter={handleAddDomain}
                        />
                        <Button onClick={handleAddDomain}>添加</Button>
                    </Space.Compact>
                    <Text type="secondary" style={{ fontSize: 'var(--fs-aux)' }}>
                        层级（{sidecar.vocab.levels.join(' / ')}）由标准号前缀自动判定，不可编辑。
                    </Text>
                </Space>
            </Modal>
        </div>
    );
};

export default RegulationLibrary;
