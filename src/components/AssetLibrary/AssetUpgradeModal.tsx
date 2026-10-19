import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Collapse, Descriptions, Empty, Modal, Space, Spin, Statistic, Table, Tag, Typography, Upload, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, CloudUploadOutlined, ExclamationCircleOutlined, HistoryOutlined, SaveOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import type { AssetUpgradeCategory, AssetUpgradeItem, SheetData, SheetParseConfig, SheetPreview, UpgradeDecision } from '../../types';
import { useVehicleStore } from '../../store/vehicleStore';
import { loadAssetFile, saveAssetFile, setAssetFileTags, type AssetFileInfo } from '../../utils/assetManager';
import { applyAssetUpgradeDraft, buildAssetUpgradeDraft, buildAssetUpgradePreview } from '../../utils/assetUpgrade';
import { parseExcelAsync } from '../../utils/excelParserAsync';
import { openWorkbookAsync, parseHandleAsync, releaseWorkbookHandle } from '../../utils/excelParserAsync';
import { exportAssetUpgradeReviewReport } from '../../utils/assetUpgradeReport';
import ReportExportDropdown from '../common/ReportExportDropdown';
import type { ReportFormat } from '../../utils/reportExport';
import SaveAssetModal from './SaveAssetModal';
import ExcelPreviewDialog from '../ParameterWorkbench/ExcelPreviewDialog';
import { compactPagination } from '../common/tablePresets';

const { Text } = Typography;

type ReviewFilter = 'all' | AssetUpgradeCategory;

const CATEGORY_META: Record<AssetUpgradeCategory, { label: string; color: string }> = {
    same: { label: '一致', color: 'default' },
    new_field: { label: '新增字段', color: 'blue' },
    fill_empty: { label: '空值补全', color: 'cyan' },
    conflict: { label: '冲突字段', color: 'red' },
    old_only: { label: '仅旧资产存在', color: 'gold' },
};

const DECISION_LABELS: Record<UpgradeDecision, string> = {
    keep_old: '保留旧值',
    use_new: '使用新版',
    pending: '稍后处理',
};

const UPGRADE_TAGS = ['资产升级', '厂商更新'];

interface AssetUpgradeModalProps {
    open: boolean;
    assetInfo: AssetFileInfo | null;
    assetTags: string[];
    onClose: () => void;
    onSaved: () => void | Promise<void>;
}

const getDistinctProductNames = (sheetData: SheetData) =>
    Array.from(
        new Set(
            sheetData.data
                .map((parameter) => (parameter.productName || sheetData.fileName).trim())
                .filter(Boolean)
        )
    );

const getMergedTags = (existingTags: string[]) =>
    Array.from(new Set([...existingTags.filter((tag) => tag.trim()), ...UPGRADE_TAGS]));

const getUpgradeDefaultName = (fileName: string) => fileName.replace(/\.json$/iu, '') + '_升级版';

const AssetUpgradeModal: React.FC<AssetUpgradeModalProps> = ({
    open,
    assetInfo,
    assetTags,
    onClose,
    onSaved,
}) => {
    const {
        assetLibraryPath,
        assetUpgradeDraft,
        setAssetUpgradeDraft,
    } = useVehicleStore(useShallow((state) => ({
        assetLibraryPath: state.assetLibraryPath,
        assetUpgradeDraft: state.assetUpgradeDraft,
        setAssetUpgradeDraft: state.setAssetUpgradeDraft,
    })));

    const [baselineData, setBaselineData] = useState<SheetData | null>(null);
    const [importedData, setImportedData] = useState<SheetData | null>(null);
    const [loadingBaseline, setLoadingBaseline] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
    const [saveAsVisible, setSaveAsVisible] = useState(false);

    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState<SheetPreview[]>([]);
    const [pendingFileName, setPendingFileName] = useState('');
    const pendingHandleIdRef = useRef<number | null>(null);

    /** 释放解析侧的 workbook handle（幂等）。所有离开预览的路径共用，避免漏放整个 workbook。 */
    const releasePendingHandle = useCallback(() => {
        if (pendingHandleIdRef.current !== null) {
            releaseWorkbookHandle(pendingHandleIdRef.current);
            pendingHandleIdRef.current = null;
        }
    }, []);

    const resetSession = useCallback(() => {
        setBaselineData(null);
        setImportedData(null);
        setAssetUpgradeDraft(null);
        setLoadingBaseline(false);
        setUploading(false);
        setReviewFilter('all');
        setSaveAsVisible(false);
        setPreviewOpen(false);
        setPreviewData([]);
        setPendingFileName('');
        releasePendingHandle();
    }, [releasePendingHandle, setAssetUpgradeDraft]);

    const handleClose = useCallback(() => {
        resetSession();
        onClose();
    }, [onClose, resetSession]);

    // 防御：正常关闭走 handleClose → resetSession 释放。此处兜底「父层改为条件卸载」这类
    // 未来改动——否则预览中的 handle 要等 worker 内 LRU 才回收，等于漏放整个 workbook。
    useEffect(() => () => releasePendingHandle(), [releasePendingHandle]);

    useEffect(() => {
        // 关闭态不跑 resetSession：挂载即写一次空草稿没有意义，且会触发持久化存储写
        // （测试环境的存储适配器不完整时直接抛错；关闭清理由 handleClose 负责）
        if (!open) return;
        if (!assetInfo || !assetLibraryPath) return;

        let alive = true;

        const loadBaseline = async () => {
            setLoadingBaseline(true);
            setImportedData(null);
            setAssetUpgradeDraft(null);

            try {
                const loaded = await loadAssetFile(assetLibraryPath, assetInfo.fileName);
                if (!alive) {
                    return;
                }

                if (!loaded) {
                    message.error('未能读取基线资产，请检查资产库路径或文件是否存在');
                    return;
                }

                setBaselineData(loaded);
            } catch (error) {
                console.error('Failed to load baseline asset for upgrade', error);
                message.error('加载基线资产失败');
            } finally {
                if (alive) {
                    setLoadingBaseline(false);
                }
            }
        };

        loadBaseline();

        return () => {
            alive = false;
        };
    }, [open, assetInfo, assetLibraryPath, resetSession, setAssetUpgradeDraft]);

    const applyImportedSheet = useCallback((sheetData: SheetData) => {
        if (!baselineData) {
            message.warning('请先等待基线资产加载完成');
            return;
        }

        const productNames = getDistinctProductNames(sheetData);
        if (productNames.length !== 1) {
            message.error(
                productNames.length === 0
                    ? '导入结果未识别到任何车型，无法生成升级草稿'
                    : `升级导入暂仅支持单车型文件，当前识别到 ${productNames.length} 个车型`
            );
            return;
        }

        const draft = buildAssetUpgradeDraft(baselineData, sheetData);
        setImportedData(sheetData);
        setAssetUpgradeDraft(draft);
        setReviewFilter(draft.summary.conflict > 0 ? 'conflict' : 'all');
        message.success(`已生成升级清单：${sheetData.fileName}`);
    }, [baselineData, setAssetUpgradeDraft]);

    const openPreviewDialog = useCallback(async (file: File) => {
        releasePendingHandle(); // 防御：替换 ref 前先放掉上一个 handle，避免二次上传残留整个 workbook
        try {
            const info = await openWorkbookAsync(file);
            setPendingFileName(info.fileName);
            pendingHandleIdRef.current = info.handleId;
            setPreviewData(info.previews);
            setPreviewOpen(true);
        } catch (error) {
            console.error('Failed to preview workbook for upgrade import', error);
            message.error(`无法读取文件：${(error as Error).message}`);
        } finally {
            setUploading(false);
        }
    }, [releasePendingHandle]);

    const handleUpload = useCallback(async (file: File) => {
        setUploading(true);

        try {
            const parsed = await parseExcelAsync(file);
            if (!parsed.data || parsed.data.length === 0) {
                await openPreviewDialog(file);
                return false;
            }

            applyImportedSheet(parsed);
        } catch (error) {
            console.warn('Automatic upgrade import parse failed, falling back to preview dialog', error);
            await openPreviewDialog(file);
            return false;
        } finally {
            setUploading(false);
        }

        return false;
    }, [applyImportedSheet, openPreviewDialog]);

    const handlePreviewConfirm = useCallback(async (configs: SheetParseConfig[]) => {
        const handleId = pendingHandleIdRef.current;
        if (handleId === null) {
            message.error('文件缓存已过期，请重新上传');
            setPreviewOpen(false);
            return;
        }

        try {
            const parsed = await parseHandleAsync(handleId, configs);
            applyImportedSheet(parsed);
            setPreviewOpen(false);
            setPendingFileName('');
            setPreviewData([]);
            releasePendingHandle();
        } catch (error) {
            console.error('Failed to parse configured workbook for upgrade import', error);
            message.error(`解析失败：${(error as Error).message}`);
        }
    }, [applyImportedSheet, releasePendingHandle]);

    const pendingConflictCount = useMemo(
        () => assetUpgradeDraft?.items.filter((item) => item.category === 'conflict' && item.decision === 'pending').length ?? 0,
        [assetUpgradeDraft]
    );

    const filteredItems = useMemo(() => {
        if (!assetUpgradeDraft) {
            return [];
        }

        return reviewFilter === 'all'
            ? assetUpgradeDraft.items
            : assetUpgradeDraft.items.filter((item) => item.category === reviewFilter);
    }, [assetUpgradeDraft, reviewFilter]);

    const preview = useMemo(
        () => (assetUpgradeDraft ? buildAssetUpgradePreview(assetUpgradeDraft) : null),
        [assetUpgradeDraft]
    );

    const updateDecision = useCallback((key: string, decision: UpgradeDecision) => {
        if (!assetUpgradeDraft) {
            return;
        }

        setAssetUpgradeDraft({
            ...assetUpgradeDraft,
            items: assetUpgradeDraft.items.map((item) => (
                item.key === key
                    ? { ...item, decision }
                    : item
            )),
        });
    }, [assetUpgradeDraft, setAssetUpgradeDraft]);

    const handleExportReview = useCallback(async (format: ReportFormat) => {
        if (!assetUpgradeDraft || !preview) {
            message.warning('请先导入新版文件并生成升级清单');
            return;
        }

        const hide = message.loading('正在生成升级审查单...', 0);
        try {
            const fileName = await exportAssetUpgradeReviewReport(assetUpgradeDraft, preview, format);
            hide();
            message.success(`审查单已导出：${fileName}`);
        } catch (error) {
            hide();
            console.error('Failed to export asset upgrade review report', error);
            message.error(`审查单导出失败：${(error as Error).message}`);
        }
    }, [assetUpgradeDraft, preview]);

    const saveMergedAsset = useCallback(async (fileName: string) => {
        if (!assetLibraryPath || !assetUpgradeDraft || !assetInfo) {
            throw new Error('升级会话尚未准备完成');
        }

        if (pendingConflictCount > 0) {
            throw new Error('仍有冲突字段未处理，无法保存');
        }

        const mergedParameters = applyAssetUpgradeDraft(assetUpgradeDraft);
        await saveAssetFile(assetLibraryPath, fileName, assetUpgradeDraft.assetProductName, mergedParameters);
        await setAssetFileTags(
            assetLibraryPath,
            fileName.endsWith('.json') ? fileName : `${fileName}.json`,
            getMergedTags(assetTags)
        );

        const latest = await loadAssetFile(
            assetLibraryPath,
            fileName.endsWith('.json') ? fileName : `${fileName}.json`
        );
        if (latest) {
            const store = useVehicleStore.getState();
            if (store.activeAssets.includes(latest.fileName)) {
                const nextAssetFiles = store.assetFiles.some((assetFile) => assetFile.fileName === latest.fileName)
                    ? store.assetFiles.map((assetFile) => assetFile.fileName === latest.fileName ? latest : assetFile)
                    : [...store.assetFiles, latest];
                store.setAssetFiles(nextAssetFiles);
            }
        }

        message.success(
            fileName.replace(/\.json$/iu, '') === assetInfo.fileName.replace(/\.json$/iu, '')
                ? '资产升级已覆盖保存'
                : '资产升级已另存为新版本'
        );
        await onSaved();
        handleClose();
    }, [assetLibraryPath, assetInfo, assetTags, assetUpgradeDraft, handleClose, onSaved, pendingConflictCount]);

    const handleOverwrite = useCallback(() => {
        if (!assetInfo) {
            return;
        }

        Modal.confirm({
            title: '确认覆盖原资产？',
            icon: <ExclamationCircleOutlined className="text-danger" />,
            content: '覆盖后将直接更新原资产文件。建议仅在所有冲突都确认完成后执行。',
            okText: '确认覆盖',
            cancelText: '取消',
            okButtonProps: { danger: true },
            onOk: async () => {
                await saveMergedAsset(assetInfo.fileName);
            },
        });
    }, [assetInfo, saveMergedAsset]);

    const reviewColumns = useMemo<ColumnsType<AssetUpgradeItem>>(() => ([
        {
            title: '分组',
            dataIndex: 'group',
            key: 'group',
            width: 120,
            ellipsis: true,
        },
        {
            title: '字段',
            dataIndex: 'fieldName',
            key: 'fieldName',
            width: 180,
            ellipsis: true,
        },
        {
            title: '旧值',
            dataIndex: 'oldValue',
            key: 'oldValue',
            render: (value: string) => value || <Text type="secondary">空值</Text>,
        },
        {
            title: '新值',
            dataIndex: 'newValue',
            key: 'newValue',
            render: (value: string) => value || <Text type="secondary">空值</Text>,
        },
        {
            title: '分类',
            dataIndex: 'category',
            key: 'category',
            width: 120,
            render: (category: AssetUpgradeCategory) => (
                <Tag color={CATEGORY_META[category].color}>{CATEGORY_META[category].label}</Tag>
            ),
        },
        {
            title: '决策',
            dataIndex: 'decision',
            key: 'decision',
            width: 220,
            render: (_decision: UpgradeDecision, item) => (
                item.category === 'conflict' ? (
                    <Space size={4} wrap>
                        <Button
                            size="small"
                            type={item.decision === 'keep_old' ? 'primary' : 'default'}
                            onClick={() => updateDecision(item.key, 'keep_old')}
                        >
                            保留旧值
                        </Button>
                        <Button
                            size="small"
                            type={item.decision === 'use_new' ? 'primary' : 'default'}
                            onClick={() => updateDecision(item.key, 'use_new')}
                        >
                            使用新版
                        </Button>
                        <Button
                            size="small"
                            danger={item.decision === 'pending'}
                            type={item.decision === 'pending' ? 'primary' : 'default'}
                            onClick={() => updateDecision(item.key, 'pending')}
                        >
                            稍后处理
                        </Button>
                    </Space>
                ) : (
                    <Tag bordered={false}>{DECISION_LABELS[item.decision]}</Tag>
                )
            ),
        },
    ]), [updateDecision]);

    const importedProductName = useMemo(
        () => importedData ? getDistinctProductNames(importedData)[0] || '-' : null,
        [importedData]
    );

    const previewColumns = useMemo<ColumnsType<NonNullable<typeof preview>['items'][number]>>(() => ([
        {
            title: '分组',
            dataIndex: 'group',
            key: 'group',
            width: 120,
            ellipsis: true,
        },
        {
            title: '字段',
            dataIndex: 'fieldName',
            key: 'fieldName',
            width: 160,
            ellipsis: true,
        },
        {
            title: '旧值',
            dataIndex: 'oldValue',
            key: 'oldValue',
            render: (value: string) => value || <Text type="secondary">空值</Text>,
        },
        {
            title: '新值',
            dataIndex: 'newValue',
            key: 'newValue',
            render: (value: string) => value || <Text type="secondary">空值</Text>,
        },
        {
            title: '最终值',
            dataIndex: 'finalValue',
            key: 'finalValue',
            render: (value: string, item) => (
                <span className={item.changed ? 'text-emerald-700 font-medium' : ''}>
                    {value || '空值'}
                </span>
            ),
        },
        {
            title: '分类',
            dataIndex: 'category',
            key: 'category',
            width: 120,
            render: (category: AssetUpgradeCategory) => (
                <Tag color={CATEGORY_META[category].color}>{CATEGORY_META[category].label}</Tag>
            ),
        },
        {
            title: '决策',
            dataIndex: 'decision',
            key: 'decision',
            width: 120,
            render: (decision: UpgradeDecision) => <Tag bordered={false}>{DECISION_LABELS[decision]}</Tag>,
        },
    ]), []);

    return (
        <>
            <Modal
                open={open}
                title="资产升级导入"
                onCancel={handleClose}
                footer={null}
                width={1200}
                destroyOnHidden
            >
                <div className="space-y-4">
                    {loadingBaseline ? (
                        <div className="py-16 flex justify-center">
                            <Spin tip="正在加载基线资产..." />
                        </div>
                    ) : !baselineData || !assetInfo ? (
                        <Empty description="未找到可升级的基线资产" />
                    ) : (
                        <>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="rounded-xl border border-default bg-surface-3 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <HistoryOutlined className="text-3" />
                                        <span className="font-semibold text-1">基线资产摘要</span>
                                    </div>
                                    <Descriptions column={1} size="small" items={[
                                        { key: 'file', label: '资产文件', children: assetInfo.fileName },
                                        { key: 'product', label: '车型名称', children: assetInfo.productName },
                                        { key: 'updated', label: '最近更新', children: assetInfo.updatedAt || '未知' },
                                        { key: 'fields', label: '字段数量', children: baselineData.data.length },
                                        {
                                            key: 'tags',
                                            label: '现有标签',
                                            children: assetTags.length > 0
                                                ? <Space size={[4, 4]} wrap>{assetTags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</Space>
                                                : <Text type="secondary">暂无标签</Text>,
                                        },
                                    ]} />
                                </div>

                                <div className="rounded-xl border border-line bg-brand-weak/60 p-4">
                                    <div className="flex items-center justify-between gap-3 mb-3">
                                        <div className="flex items-center gap-2">
                                            <CloudUploadOutlined className="text-brand" />
                                            <span className="font-semibold text-1">新版文件导入</span>
                                        </div>
                                        <Upload beforeUpload={handleUpload} showUploadList={false} accept=".xlsx,.xls">
                                            <Button type="primary" loading={uploading} icon={<CloudUploadOutlined />}>
                                                导入新版 Excel
                                            </Button>
                                        </Upload>
                                    </div>

                                    {importedData ? (
                                        <Descriptions column={1} size="small" items={[
                                            { key: 'file', label: '导入文件', children: importedData.fileName },
                                            { key: 'product', label: '识别车型', children: importedProductName || '-' },
                                            { key: 'count', label: '字段数量', children: importedData.data.length },
                                        ]} />
                                    ) : (
                                        <Text type="secondary">尚未导入新版文件。</Text>
                                    )}

                                    {importedProductName && importedProductName !== assetInfo.productName && (
                                        <Alert
                                            className="mt-3"
                                            type="warning"
                                            showIcon
                                            message="导入车型名与基线资产不同"
                                            description={`基线车型为「${assetInfo.productName}」，导入文件识别为「${importedProductName}」。将按字段结构生成升级草稿，不按车型名自动匹配。`}
                                        />
                                    )}
                                </div>
                            </div>

                            {assetUpgradeDraft ? (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                        <Statistic title="一致" value={assetUpgradeDraft.summary.same} />
                                        <Statistic title="新增字段" value={assetUpgradeDraft.summary.newField} />
                                        <Statistic title="空值补全" value={assetUpgradeDraft.summary.fillEmpty} />
                                        <Statistic title="冲突字段" value={assetUpgradeDraft.summary.conflict} valueStyle={{ color: pendingConflictCount > 0 ? 'var(--danger)' : undefined }} />
                                        <Statistic title="仅旧资产存在" value={assetUpgradeDraft.summary.oldOnly} />
                                    </div>

                                    {pendingConflictCount > 0 ? (
                                        <Alert
                                            type="warning"
                                            showIcon
                                            message={`还有 ${pendingConflictCount} 个冲突字段待决策`}
                                            description="请逐项为冲突字段选择保留旧值或使用新版，再保存。"
                                        />
                                    ) : (
                                        <Alert
                                            type="success"
                                            showIcon
                                            message="升级清单已完成决策，可以保存"
                                        />
                                    )}

                                    <div className="rounded-xl border border-default bg-surface-2 p-4">
                                        <div className="flex flex-wrap items-center gap-2 mb-3">
                                            <span className="font-semibold text-1">升级差异清单</span>
                                            {(['all', 'conflict', 'new_field', 'fill_empty', 'old_only', 'same'] as ReviewFilter[]).map((filter) => (
                                                <Tag
                                                    key={filter}
                                                    color={reviewFilter === filter ? 'blue' : undefined}
                                                    className="select-none"
                                                    onClick={() => setReviewFilter(filter)}
                                                >
                                                    {filter === 'all' ? '全部' : CATEGORY_META[filter].label}
                                                </Tag>
                                            ))}
                                        </div>

                                        <Table
                                            rowKey="key"
                                            columns={reviewColumns}
                                            dataSource={filteredItems}
                                            pagination={compactPagination()}
                                            scroll={{ x: 1000 }}
                                            locale={{ emptyText: '当前筛选下没有差异项' }}
                                        />
                                    </div>

                                    {preview && (
                                        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4">
                                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                                <div>
                                                    <div className="font-semibold text-1">最终覆盖预览</div>
                                                    <div className="text-sm text-3 mt-1">
                                                        先看摘要，再按需展开明细。这里展示的是当前决策下最终会形成的结果。
                                                    </div>
                                                </div>
                                                {preview.summary.pendingCount > 0 ? (
                                                    <Tag color="warning">仍有 {preview.summary.pendingCount} 项未决策</Tag>
                                                ) : (
                                                    <Tag color="success">已形成可保存的最终结果</Tag>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                                <Statistic title="使用新版" value={preview.summary.useNewCount} />
                                                <Statistic title="保留旧值" value={preview.summary.keepOldCount} />
                                                <Statistic title="实际变更" value={preview.summary.changedCount} valueStyle={{ color: preview.summary.changedCount > 0 ? 'var(--brand)' : undefined }} />
                                                <Statistic title="已解决冲突" value={preview.summary.conflictResolvedCount} />
                                                <Statistic title="待决策" value={preview.summary.pendingCount} valueStyle={{ color: preview.summary.pendingCount > 0 ? 'var(--warning)' : undefined }} />
                                            </div>

                                            <Collapse
                                                items={[
                                                    {
                                                        key: 'preview-detail',
                                                        label: `展开变更明细 (${preview.items.length})`,
                                                        children: (
                                                            <Table
                                                                rowKey="key"
                                                                columns={previewColumns}
                                                                dataSource={preview.items}
                                                                pagination={compactPagination()}
                                                                scroll={{ x: 1000 }}
                                                                locale={{ emptyText: '当前没有需要审查的变更项' }}
                                                            />
                                                        ),
                                                    },
                                                ]}
                                            />
                                        </div>
                                    )}

                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <div>
                                                <div className="font-semibold text-1">保存策略</div>
                                                <div className="text-sm text-3 mt-1">
                                                    默认推荐另存为新版本；覆盖原资产需要二次确认。
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {getMergedTags(assetTags).map((tag) => (
                                                        <Tag key={tag} color={UPGRADE_TAGS.includes(tag) ? 'green' : 'default'}>
                                                            {tag}
                                                        </Tag>
                                                    ))}
                                                </div>
                                            </div>
                                            <Space wrap>
                                                <ReportExportDropdown onExport={handleExportReview} label="导出审查单" />
                                                <Button
                                                    icon={<SaveOutlined />}
                                                    onClick={() => setSaveAsVisible(true)}
                                                    disabled={pendingConflictCount > 0}
                                                >
                                                    另存为新版本
                                                </Button>
                                                <Button
                                                    type="primary"
                                                    danger
                                                    icon={<CheckCircleOutlined />}
                                                    onClick={handleOverwrite}
                                                    disabled={pendingConflictCount > 0}
                                                >
                                                    覆盖原资产
                                                </Button>
                                            </Space>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="rounded-xl border border-dashed border-default bg-surface-3 p-8 text-center text-3">
                                    导入新版文件后，这里会生成“升级清单”，并按风险分类展示字段差异。
                                </div>
                            )}
                        </>
                    )}
                </div>
            </Modal>

            <SaveAssetModal
                visible={saveAsVisible}
                onClose={() => setSaveAsVisible(false)}
                onSave={saveMergedAsset}
                defaultName={assetInfo ? getUpgradeDefaultName(assetInfo.fileName) : '资产升级版'}
                defaultTags={getMergedTags(assetTags)}
            />

            <ExcelPreviewDialog
                open={previewOpen}
                previews={previewData}
                fileName={pendingFileName}
                onConfirm={handlePreviewConfirm}
                onCancel={() => {
                    setPreviewOpen(false);
                    setPendingFileName('');
                    setPreviewData([]);
                    releasePendingHandle();
                }}
            />
        </>
    );
};

export default AssetUpgradeModal;
