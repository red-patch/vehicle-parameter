import React, { useState } from 'react';
import { Input, Button, Card, Typography, Space, Alert, message, notification, Steps, Drawer } from 'antd';
import { warnLibraryPathMissing } from '../../utils/libraryPathPrompt';
import { SearchOutlined, ImportOutlined, CheckCircleOutlined, CopyOutlined, DownloadOutlined, SaveOutlined, CarOutlined, FilePdfOutlined, GlobalOutlined, FileTextOutlined, ToolOutlined, DownOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { useAnnouncementStore } from '../../store/announcementStore';
import { useShallow } from 'zustand/react/shallow';
import ParametersTable from '../DiffViewer/ParametersTable';
import type { SheetData, VehicleParameter } from '../../types';
import {
    batchSeq,
    buildAnnouncementBaseName,
    extractAnnounceNo,
    extractBatch,
    extractProductName,
    matchAnnouncementsByNos,
    normalizeAnnounceNo,
    readAnnouncementRecord,
    uniquifyBaseName,
    writeAnnouncementRecord,
    type AnnouncementInfo,
} from '../../utils/announcementRecord';
import {
    OTHER_PARAM_GROUP,
    OTHER_PARAM_NAMES,
    splitOtherParamValue,
} from '../../utils/announcementParamParse';
import { probeNewPdfs } from '../../utils/announcementScan';
import AnnouncementArchiveList from './AnnouncementArchiveList';
import { useScrollCollapse } from '../../hooks/useScrollCollapse';
import AnnouncementImportModal from './AnnouncementImportModal';
import AnnouncementPickupPrompt from './AnnouncementPickupPrompt';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

/** 书签解析出的参数行（比 VehicleParameter 多带 row/col 原始表位） */
type MiitParam = VehicleParameter & { row?: number; col?: number };

/** 回应检查「忽略」名单（localStorage，上限 200 条防膨胀） */
const PROMPT_DISMISSED_KEY = 'announcement-prompt-dismissed';

const readDismissedPaths = (): string[] => {
    try { return JSON.parse(localStorage.getItem(PROMPT_DISMISSED_KEY) ?? '[]') as string[]; } catch { return []; }
};

const addDismissedPaths = (paths: string[]): void => {
    try {
        const set = new Set(readDismissedPaths());
        paths.forEach(p => set.add(p));
        localStorage.setItem(PROMPT_DISMISSED_KEY, JSON.stringify([...set].slice(-200)));
    } catch { /* 忽略 */ }
};

/**
 * 工信部公告查询URL
 */
const MIIT_QUERY_URL = 'https://service.miit-eidc.org.cn/miitxxgk/gonggao/xxgk/index';

/**
 * 构建查询URL
 */
const buildMiitQueryUrl = (announcementNo: string): string => {
    return `${MIIT_QUERY_URL}?querylb=cp&querydata=${encodeURIComponent(announcementNo)}`;
};

/**
 * 书签脚本代码
 */
const BOOKMARKLET_CODE = `javascript:(function(){try{const table=document.querySelector('table.query_result_table');if(!table){alert('未找到参数表，请确保在参数详情页使用此书签。');return;}const results=[];const rows=Array.from(table.querySelectorAll('tr'));rows.forEach(row=>{const cells=Array.from(row.querySelectorAll('td'));if(cells.length>=4){const k1=cells[0].innerText.trim();const v1=cells[1].innerText.trim();const k2=cells[2].innerText.trim();const v2=cells[3].innerText.trim();if(k1)results.push({name:k1,value:v1,group:'工信部数据'});if(k2)results.push({name:k2,value:v2,group:'工信部数据'});}else if(cells.length>=2){const k=cells[0].innerText.trim();const v=cells[1].innerText.trim();if(k)results.push({name:k,value:v,group:'工信部数据'});}});const data={source:'miit-helper',parameters:results};const json=JSON.stringify(data);navigator.clipboard.writeText(json).then(()=>{alert('已成功复制 '+results.length+' 条参数到剪贴板！\\n请返回车辆参数工具粘贴导入。');}).catch(err=>{const i=document.createElement('textarea');i.value=json;document.body.appendChild(i);i.select();document.execCommand('copy');document.body.removeChild(i);alert('已成功复制 '+results.length+' 条参数到剪贴板！');});}catch(e){alert('发生错误: '+e.message);}})();`;

interface AnnouncementQueryProps {
    /** 「查看关联资产」跳转工作台（App 传入 tab 切换） */
    onOpenWorkbench?: () => void;
}

const AnnouncementQuery: React.FC<AnnouncementQueryProps> = ({ onOpenWorkbench }) => {
    const [announcementNo, setAnnouncementNo] = useState<string>('');
    const [importJson, setImportJson] = useState<string>('');
    const { setMiitData, miitData, setTargetFile, setCompareMode, addFile, assetLibraryPath, pendingGlobalSearch, setPendingGlobalSearch } = useVehicleStore(useShallow(state => ({
        setMiitData: state.setMiitData,
        miitData: state.miitData,
        setTargetFile: state.setTargetFile,
        setCompareMode: state.setCompareMode,
        addFile: state.addFile,
        assetLibraryPath: state.assetLibraryPath,
        pendingGlobalSearch: state.pendingGlobalSearch,
        setPendingGlobalSearch: state.setPendingGlobalSearch,
    })));
    const { loadFor, refresh: refreshAnnouncements, infos: announcementInfos } = useAnnouncementStore(useShallow(state => ({
        loadFor: state.loadFor,
        refresh: state.refresh,
        infos: state.infos,
    })));

    const bookmarkLinkRef = React.useRef<HTMLAnchorElement>(null);

    // 本地优先（Q11）：查询命中公告中心记录时不跳浏览器
    const [localHits, setLocalHits] = useState<AnnouncementInfo[] | null>(null);
    // PDF 归档弹窗（Q1/Q10）
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importPrefill, setImportPrefill] = useState<{ vehicleName?: string; announceNo?: string; batch?: string } | null>(null);
    const [importParams, setImportParams] = useState<SheetData['data'] | null>(null);
    // 拾取提示（Q10）：粘贴导入成功后出现
    const [pickupVisible, setPickupVisible] = useState(false);
    const [savingRecord, setSavingRecord] = useState(false);
    // 回应检查「立即归档」：源文件为下载目录里的那份（跳过文件选择）
    const [importInitialPath, setImportInitialPath] = useState<string | null>(null);
    const lastProbeRef = React.useRef(0);
    // 数据预览抽屉：无数据时不占版面，粘贴导入后自动弹出（布局裁定 2026-10-01）
    const [previewOpen, setPreviewOpen] = useState(false);
    // 提取工具（书签安装）抽屉：装一次就不再需要，降级为按需打开
    const [bookmarkOpen, setBookmarkOpen] = useState(false);
    // 顶部查询/导入区：主体是下方公告归档，滚过它即收起（布局优化 2026-10-15）
    const headerRef = React.useRef<HTMLDivElement>(null);
    const scrolledCollapsed = useScrollCollapse(headerRef);
    // 收起态下手动展开：用户主动要看就留住，滚回顶部时自然复位
    const [manualOpen, setManualOpen] = useState(false);
    React.useEffect(() => {
        if (!scrolledCollapsed) setManualOpen(false);
    }, [scrolledCollapsed]);
    const headerCollapsed = scrolledCollapsed && !manualOpen;

    React.useEffect(() => {
        if (bookmarkLinkRef.current) {
            bookmarkLinkRef.current.href = BOOKMARKLET_CODE;
        }
    }, []);

    // 资产库路径就绪后加载公告归档（供查询本地优先与归档列表使用）
    React.useEffect(() => {
        loadFor(assetLibraryPath);
    }, [assetLibraryPath, loadFor]);

    // 全局搜索面板（⌘K）跳转：预填公告号查询框（一次性信号，见 docs/plans/2026-10-15-全局搜索面板-design.md §3.4）
    React.useEffect(() => {
        if (pendingGlobalSearch && pendingGlobalSearch.tab === 'announcement') {
            setAnnouncementNo(pendingGlobalSearch.keyword);
            setPendingGlobalSearch(null);
        }
    }, [pendingGlobalSearch, setPendingGlobalSearch]);

    // 回应用时增量检查（grilling 定稿：无常驻监听）——切回应用时 stat 下载目录，
    // Rust 侧缓存命中零解析、名字预筛不像公告的文件不打扰；发现新的公告 PDF 才弹通知。
    React.useEffect(() => {
        let disposed = false;
        let unlisten: (() => void) | undefined;
        const runCheck = async () => {
            if (!assetLibraryPath) return;
            const now = Date.now();
            if (now - lastProbeRef.current < 15_000) return;
            lastProbeRef.current = now;
            try {
                const pathApi = await import('@tauri-apps/api/path');
                const dir = await pathApi.downloadDir();
                const found = await probeNewPdfs(dir);
                if (disposed || found.length === 0) return;
                const dismissed = new Set(readDismissedPaths());
                const archivedKeys = new Set(
                    announcementInfos.filter(i => !i.orphan).map(i => `${normalizeAnnounceNo(i.announceNo)}|${i.batch ?? ''}`),
                );
                const fresh = found.filter(c => {
                    if (dismissed.has(c.path)) return false;
                    const no = (c.announceNo ?? '').trim();
                    if (no && archivedKeys.has(`${normalizeAnnounceNo(no)}|${(c.batch ?? '').trim()}`)) return false;
                    return true;
                });
                if (fresh.length === 0) return;
                const newest = fresh[0];
                const key = `announcement-pickup-${newest.path}`;
                notification.info({
                    key,
                    message: fresh.length > 1 ? `发现 ${fresh.length} 份新的公告 PDF` : '刚下载了公告 PDF？',
                    description: (
                        <div className="text-xs space-y-0.5">
                            {fresh.slice(0, 3).map(c => <div key={c.path} className="truncate">{c.fileName}</div>)}
                            {fresh.length > 3 && <div className="text-3">…其余 {fresh.length - 3} 份可在「批量导入 PDF」中秒出</div>}
                        </div>
                    ),
                    duration: 0,
                    btn: (
                        <Space>
                            <Button size="small" onClick={() => { addDismissedPaths(fresh.map(c => c.path)); notification.destroy(key); }}>
                                忽略
                            </Button>
                            <Button
                                type="primary"
                                size="small"
                                onClick={() => {
                                    notification.destroy(key);
                                    addDismissedPaths([newest.path]);
                                    setImportPrefill({ announceNo: newest.announceNo ?? '', batch: newest.batch ?? '' });
                                    setImportParams(null);
                                    setImportInitialPath(newest.path);
                                    setImportModalOpen(true);
                                }}
                            >
                                立即归档
                            </Button>
                        </Space>
                    ),
                });
            } catch { /* 静默：检查失败不影响使用 */ }
        };
        import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
            getCurrentWindow().listen('tauri://focus', () => { void runCheck(); }),
        ).then(fn => {
            if (disposed) fn();
            else unlisten = fn;
        });
        void runCheck();
        return () => {
            disposed = true;
            unlisten?.();
        };
    }, [assetLibraryPath, announcementInfos]);

    const openMiitUrl = async (no: string) => {
        const url = buildMiitQueryUrl(no);
        try {
            const { openUrl } = await import('@tauri-apps/plugin-opener');
            await openUrl(url);
        } catch {
            window.open(url, '_blank');
        }
    };

    const handleQuery = async () => {
        const no = announcementNo.trim();
        if (!no) return;
        await loadFor(assetLibraryPath);
        const hits = matchAnnouncementsByNos(useAnnouncementStore.getState().infos, [no]);
        if (hits.length > 0) {
            setLocalHits(hits);
            return;
        }
        setLocalHits(null);
        await openMiitUrl(no);
    };

    const handleLoadLocalParams = async (hit: AnnouncementInfo) => {
        if (!assetLibraryPath || !hit.jsonFile) return;
        const record = await readAnnouncementRecord(assetLibraryPath, hit.jsonFile);
        if (!record) {
            message.error('读取公告记录失败');
            return;
        }
        const sheetData: SheetData = {
            fileName: record.announceNo,
            rawHeaders: ['参数名', '值'],
            data: record.parameters,
        };
        setMiitData(sheetData);
        addFile(sheetData);
        setLocalHits(null);
        setPreviewOpen(true);
        message.success(`已载入本地公告参数（${record.parameters.length} 条）`);
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleQuery();
    };

    const handleImport = () => {
        try {
            if (!importJson.trim()) return;
            const data = JSON.parse(importJson);

            if (data.source !== 'miit-helper' || !Array.isArray(data.parameters)) {
                message.error('数据格式不正确，请确保复制的是书签脚本生成的数据');
                return;
            }

            const sheetData: SheetData = {
                fileName: announcementNo.trim() || `工信部数据导入_${new Date().toLocaleTimeString()}`,
                rawHeaders: ['参数名', '值'],
                data: []
            };

            const parsedData: MiitParam[] = [];

            data.parameters.forEach((p: { name: string; value: string; group?: string }, index: number) => {
                // 「其它」格：保留原文整格 + 拆出编号明细（解析规则见 utils/announcementParamParse）
                if (OTHER_PARAM_NAMES.includes(String(p.name ?? '').trim()) && p.value) {
                    parsedData.push({
                        id: `miit-${index}-origin`,
                        name: p.name,
                        value: p.value,
                        group: p.group || '基础信息',
                        row: index + 1,
                        col: 1,
                        originSheet: '工信部官网'
                    });

                    splitOtherParamValue(p.value).forEach((sub, subIndex) => {
                        parsedData.push({
                            id: `miit-${index}-sub-${subIndex}`,
                            name: sub.name,
                            value: sub.value,
                            group: OTHER_PARAM_GROUP,
                            row: index + 1,
                            col: 1,
                            originSheet: '工信部官网'
                        });
                    });
                } else {
                    // 普通字段
                    parsedData.push({
                        id: `miit-${index}`,
                        name: p.name,
                        value: p.value || '',
                        group: p.group || '基础信息',
                        row: index + 1,
                        col: 1,
                        originSheet: '工信部官网'
                    });
                }
            });

            sheetData.data = parsedData;

            setMiitData(sheetData);

            // 同时送入数据池，使其可被各业务模块使用
            addFile(sheetData);

            message.success(`成功导入 ${sheetData.data.length} 条参数`);
            setImportJson('');
            // 引导 PDF 归档（Q10）：参数与 PDF 是两个独立动作；预览随导入自动展开
            setPickupVisible(true);
            setPreviewOpen(true);
        } catch {
            message.error('解析JSON失败，请检查粘贴内容');
        }
    };

    /** 保存到公告中心（替代旧「保存至资产库」：公告数据撤出资产库，Q14 架构裁定） */
    const handleSaveToCenter = async () => {
        if (!miitData) return;
        if (!assetLibraryPath) {
            warnLibraryPathMissing();
            return;
        }
        const announceNo = (announcementNo.trim() || miitData.fileName).trim();
        if (!announceNo) {
            message.warning('缺少公告号，请先在上方输入');
            return;
        }
        setSavingRecord(true);
        try {
            const batch = extractBatch(miitData.data);
            const vehicleName = extractProductName(miitData.data) || announceNo;
            const existingSame = announcementInfos.find(
                i => !i.orphan
                    && normalizeAnnounceNo(i.announceNo) === normalizeAnnounceNo(announceNo)
                    && (i.batch || '') === batch,
            );
            let baseName: string;
            if (existingSame?.jsonFile) {
                // 更新既有记录：原地覆写，保留 PDF 关联
                baseName = existingSame.jsonFile.replace(/\.json$/i, '');
            } else {
                const taken = new Set<string>();
                announcementInfos.forEach(i => {
                    if (i.jsonFile) taken.add(i.jsonFile.replace(/\.json$/i, ''));
                    if (i.pdfFile) taken.add(i.pdfFile.replace(/\.pdf$/i, ''));
                });
                baseName = uniquifyBaseName(
                    buildAnnouncementBaseName({ vehicleName, announceNo, batch }),
                    taken,
                );
            }
            await writeAnnouncementRecord(assetLibraryPath, `${baseName}.json`, {
                version: '1.0',
                announceNo,
                batch,
                vehicleName,
                sourceUrl: buildMiitQueryUrl(announceNo),
                importedAt: new Date().toISOString(),
                pdfFile: existingSame?.pdfFile ?? null,
                parameters: miitData.data,
            });
            await refreshAnnouncements();
            message.success('已保存到公告中心');
            setPickupVisible(true);
        } catch (e) {
            console.error('保存公告记录失败', e);
            message.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setSavingRecord(false);
        }
    };

    /** 用当前解析参数预填 PDF 归档弹窗 */
    const openImportWithCurrentParams = () => {
        const params = miitData?.data ?? null;
        setImportPrefill({
            vehicleName: params ? extractProductName(params) : '',
            announceNo: announcementNo.trim() || (params ? extractAnnounceNo(params) : ''),
            batch: params ? extractBatch(params) : '',
        });
        setImportParams(params);
        setImportModalOpen(true);
    };

    const handleSetAsTarget = () => {
        if (miitData) {
            setTargetFile(miitData);
            setCompareMode('miit');
            message.success('已将工信部数据设置为新版本用于比对，并切换至公告对比模式');
        }
    };

    // 生成CSV内容
    const generateCsvContent = () => {
        if (!miitData || miitData.data.length === 0) return '';

        // CSV Header
        const header = ['参数名', '值', '分组'].join(',');

        // CSV Rows - 过滤掉空值的行
        const rows = miitData.data
            .filter(item => item.value !== null && item.value !== undefined && String(item.value).trim() !== '')
            .map(item => {
                // 处理包含逗号、换行符的值，用双引号包裹，并转义内部双引号
                const escapeCsv = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;
                return [
                    escapeCsv(item.name),
                    escapeCsv(String(item.value)),
                    escapeCsv(item.group)
                ].join(',');
            });

        return [header, ...rows].join('\n');
    };

    const handleCopyCsv = () => {
        const content = generateCsvContent();
        if (!content) return;

        navigator.clipboard.writeText(content).then(() => {
            message.success('已复制 CSV 数据到剪贴板');
        }).catch(() => {
            message.error('复制失败');
        });
    };

    const handleDownloadCsv = async () => {
        const content = generateCsvContent();
        if (!content) return;

        const { downloadCsv } = await import('../../utils/downloadCsv');
        await downloadCsv(content, `${miitData?.fileName || '工信部数据'}.csv`);
    };

    const copyBookmarkCode = () => {
        navigator.clipboard.writeText(BOOKMARKLET_CODE).then(() => {
            message.success('书签代码已复制，您可以手动新建书签并粘贴代码');
        });
    };

    // 示例公告号
    const exampleNumbers = [
        { label: 'DNC5037XXYBEVP1', desc: '吉利四川商用车（远程牌）' },
        { label: 'CA5037XXYPEV82', desc: '一汽解放（解放牌）' },
    ];

    return (
        <div className="space-y-4">
            {/* 顶部操作区：可滚动的两块——它们是工作台入口，主体是下方公告归档。
                下滑浏览归档时收起成一条摘要，把版面让给列表（布局优化 2026-10-15 Q1）。 */}
            <div ref={headerRef} className="space-y-4">
                {headerCollapsed ? (
                    <div className="flex items-center gap-2 flex-wrap">
                        <Steps
                            size="small"
                            current={miitData ? 3 : 0}
                            items={[
                                { title: '查询公告号' },
                                { title: '提取数据' },
                                { title: '导入数据' },
                            ]}
                            style={{ flex: 1, minWidth: 280 }}
                        />
                        <Button size="small" type="text" onClick={() => setManualOpen(true)}>
                            展开操作区 <DownOutlined />
                        </Button>
                    </div>
                ) : (
                    <>
                        <Steps
                            size="small"
                            current={miitData ? 3 : 0}
                            items={[
                                { title: '查询公告号', description: '输入公告号，本地优先' },
                                { title: '提取数据', description: '在详情页使用书签脚本' },
                                { title: '导入数据', description: '粘贴JSON并解析' },
                            ]}
                            className="mb-2"
                        />

            {/* 顶部紧凑操作区：查询 + 粘贴导入（主体是下方公告归档） */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title="查询公告号" size="small">
                    <Space.Compact style={{ width: '100%' }}>
                        <Input
                            placeholder="请输入车辆公告号"
                            value={announcementNo}
                            onChange={(e) => setAnnouncementNo(e.target.value)}
                            onKeyPress={handleKeyPress}
                            suffix={<SearchOutlined className="text-3" />}
                        />
                        <Button
                            type="primary"
                            onClick={handleQuery}
                            disabled={!announcementNo.trim()}
                        >
                            查询
                        </Button>
                    </Space.Compact>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        <Text type="secondary" className="text-aux">示例：</Text>
                        {exampleNumbers.map((item) => (
                            <Button
                                key={item.label}
                                size="small"
                                type="dashed"
                                title={item.desc}
                                onClick={() => setAnnouncementNo(item.label)}
                            >
                                {item.label}
                            </Button>
                        ))}
                    </div>
                </Card>

                <Card
                    title="粘贴导入"
                    size="small"
                    extra={
                        <Space size={4}>
                            {miitData && (
                                <Button size="small" icon={<FileTextOutlined />} onClick={() => setPreviewOpen(true)}>
                                    数据预览（{miitData.data.length}）
                                </Button>
                            )}
                            <Button size="small" icon={<ToolOutlined />} onClick={() => setBookmarkOpen(true)}>
                                提取工具
                            </Button>
                        </Space>
                    }
                >
                    <TextArea
                        rows={3}
                        placeholder="粘贴书签脚本复制的JSON数据..."
                        value={importJson}
                        onChange={(e) => setImportJson(e.target.value)}
                        className="mb-3"
                    />
                    <Button
                        type="primary"
                        block
                        icon={<ImportOutlined />}
                        onClick={handleImport}
                        disabled={!importJson.trim()}
                    >
                        解析并导入
                    </Button>
                </Card>
            </div>
                    </>
                )}
            </div>

            {/* 查询本地命中：不跳浏览器，原地给出本地归档出口（Q11） */}
            {localHits && (
                <Alert
                    type="success"
                    showIcon
                    closable
                    onClose={() => setLocalHits(null)}
                    message={`本地已归档 ${localHits.length} 条「${announcementNo.trim()}」的公告记录`}
                    description={
                        <div className="space-y-2">
                            {[...localHits]
                                .sort((a, b) => batchSeq(b.batch) - batchSeq(a.batch))
                                .map(hit => {
                                    const label = [hit.vehicleName, hit.batch].filter(Boolean).join(' · ') || hit.announceNo;
                                    return (
                                        <div key={hit.jsonFile || hit.pdfFile} className="flex items-center justify-between gap-3 flex-wrap">
                                            <Space size={6} wrap>
                                                <Text>{label}</Text>
                                                <Text type="secondary" className="text-xs">{hit.paramCount} 参数</Text>
                                                {!hit.hasPdf && <Text type="secondary" className="text-xs">（无 PDF）</Text>}
                                                {hit.orphan && <Text type="warning" className="text-xs">待认领</Text>}
                                            </Space>
                                            <Space size={4}>
                                                <Button
                                                    size="small"
                                                    type="primary"
                                                    ghost
                                                    disabled={hit.orphan || hit.paramCount === 0}
                                                    onClick={() => handleLoadLocalParams(hit)}
                                                >
                                                    载入参数
                                                </Button>
                                                <Button
                                                    size="small"
                                                    icon={<FilePdfOutlined />}
                                                    disabled={!hit.hasPdf}
                                                    onClick={() => {
                                                        if (!assetLibraryPath || !hit.pdfFile) return;
                                                        import('@tauri-apps/api/path').then(async ({ join }) => {
                                                            const { openPath } = await import('@tauri-apps/plugin-opener');
                                                            await openPath(await join(assetLibraryPath, '公告PDF', hit.pdfFile!));
                                                        });
                                                    }}
                                                >
                                                    打开 PDF
                                                </Button>
                                            </Space>
                                        </div>
                                    );
                                })}
                            <div>
                                <Button size="small" icon={<GlobalOutlined />} onClick={() => openMiitUrl(announcementNo.trim())}>
                                    仍要跳网页查询
                                </Button>
                            </div>
                        </div>
                    }
                />
            )}

            {/* 主体：公告归档（公告中心的核心工作面） */}
            <AnnouncementArchiveList onOpenWorkbench={onOpenWorkbench} />

            {/* 数据预览抽屉：仅在解析出数据时打开，不再长期占版面 */}
            <Drawer
                title={`数据预览（${miitData?.data.length ?? 0} 参数）`}
                open={previewOpen && !!miitData}
                onClose={() => setPreviewOpen(false)}
                width={560}
                destroyOnHidden
            >
                {miitData && (
                    <div className="space-y-3">
                        <AnnouncementPickupPrompt
                            visible={pickupVisible}
                            onPick={() => {
                                setPickupVisible(false);
                                openImportWithCurrentParams();
                            }}
                            onDismiss={() => setPickupVisible(false)}
                        />
                        <Space wrap size={4}>
                            <Button
                                type="primary"
                                size="small"
                                icon={<SaveOutlined />}
                                disabled={!assetLibraryPath || savingRecord}
                                loading={savingRecord}
                                onClick={handleSaveToCenter}
                            >
                                保存到公告中心
                            </Button>
                            <Button
                                size="small"
                                icon={<CheckCircleOutlined />}
                                onClick={handleSetAsTarget}
                            >
                                设为新版本比对
                            </Button>
                            <Button size="small" icon={<CopyOutlined />} onClick={handleCopyCsv}>
                                复制CSV
                            </Button>
                            <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadCsv}>
                                下载CSV
                            </Button>
                        </Space>
                        <ParametersTable data={miitData.data} />
                    </div>
                )}
            </Drawer>

            {/* 提取工具抽屉：书签安装是一次性动作，按需打开 */}
            <Drawer
                title="安装提取工具（书签脚本）"
                open={bookmarkOpen}
                onClose={() => setBookmarkOpen(false)}
                width={480}
                destroyOnHidden
            >
                <Alert
                    message="方法一：拖拽安装"
                    description="将下方蓝色按钮直接拖拽到浏览器书签栏。"
                    type="info"
                    showIcon
                    className="mb-4"
                />
                <div className="flex justify-center py-6 bg-surface-3 rounded border border-dashed border-strong">
                    <a
                        ref={bookmarkLinkRef}
                        className="ant-btn ant-btn-primary ant-btn-lg cursor-grab"
                        title="拖拽我看书签栏"
                        onClick={() => {
                            message.info('请将此按钮拖动到书签栏，而不是直接点击哦');
                        }}
                    >
                        <CarOutlined /> 提取车辆参数
                    </a>
                </div>

                <div className="mt-4">
                    <Alert
                        message="方法二：手动创建"
                        description={
                            <div className="mt-2">
                                <p>如果拖拽无效，请点击复制下方代码，手动新建一个书签并将代码粘贴到“网址”栏中。</p>
                                <Button
                                    size="small"
                                    icon={<CopyOutlined />}
                                    onClick={copyBookmarkCode}
                                    className="mt-2"
                                >
                                    复制代码
                                </Button>
                            </div>
                        }
                        type="warning"
                        showIcon
                    />
                </div>

                <Paragraph className="mt-3 text-xs text-3 text-center">
                    (支持 Chrome, Edge, Safari, Firefox)
                </Paragraph>
            </Drawer>

            <AnnouncementImportModal
                open={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                prefill={importPrefill}
                params={importParams}
                initialPdfPath={importInitialPath}
            />
        </div>
    );
};

export default AnnouncementQuery;
