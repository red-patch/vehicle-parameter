// 投标字段关联方案编辑抽屉（智能填报 · 多车取数）
// 方案 = 命名的规则列表；规则 = 投标目标字段 → 1..N 个系统来源字段 + 组合模板
// 保存到资产库目录 custom_bid_field_mappings.json，供跨会话复用
import React, { useMemo, useState } from 'react';
import { AutoComplete, Button, Drawer, Empty, Input, message, Popconfirm, Select, Space } from 'antd';
import {
    CopyOutlined, DeleteOutlined, DownOutlined, PlusOutlined, ThunderboltOutlined, UpOutlined,
    VerticalAlignTopOutlined,
} from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../store/vehicleStore';
import { buildFieldSearchResults, parseFieldBatchInput } from '../SmartFiller/coreFieldRules';
import { findBestMatch } from '../../utils/matchingEngine';
import {
    createBidRuleId, defaultTemplateFor, getBidSchemesSync, moveRuleToFront, reloadBidMappings,
    saveBidMappingsConfig,
} from '../../utils/bidFieldMapping';
import type { BidFieldRule, BidMappingScheme } from '../../utils/bidFieldMapping';
import type { VehicleParameter } from '../../types';

const { TextArea } = Input;

interface BidMappingDrawerProps {
    open: boolean;
    onClose: () => void;
    /** 保存成功后回调（外部刷新方案列表并聚焦指定方案） */
    onSaved?: (focusedSchemeId: string | null) => void;
}

const createSchemeId = (): string => `bid-scheme-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const cloneSchemes = (schemes: BidMappingScheme[]): BidMappingScheme[] =>
    schemes.map((scheme) => ({
        ...scheme,
        rules: scheme.rules.map((rule) => ({ ...rule, sources: [...rule.sources] })),
    }));

/**
 * 方案编辑器：每次抽屉打开时随组件挂载初始化草稿（深拷贝，保存前不影响外部）
 */
const SchemeEditor: React.FC<{ onClose: () => void; onSaved?: (focusedSchemeId: string | null) => void }> = ({
    onClose,
    onSaved,
}) => {
    const {
        uploadedFiles, assetFiles, activeAssets, assetLibraryPath, bumpBidMappingsVersion,
        bidPullSchemeId, setBidPullSchemeId,
    } = useVehicleStore(useShallow((state) => ({
        uploadedFiles: state.uploadedFiles,
        assetFiles: state.assetFiles,
        activeAssets: state.activeAssets,
        assetLibraryPath: state.assetLibraryPath,
        bumpBidMappingsVersion: state.bumpBidMappingsVersion,
        bidPullSchemeId: state.bidPullSchemeId,
        setBidPullSchemeId: state.setBidPullSchemeId,
    })));

    const [schemes, setSchemes] = useState<BidMappingScheme[]>(() => cloneSchemes(getBidSchemesSync()));
    const [batchInput, setBatchInput] = useState('');

    // 当前方案与外部取数面板共用 store 状态（双向联动）：外面选好 → 这里直接落在该方案；
    // 这里切换 → 外部取数矩阵同步跟随。为空（首次使用 / 原方案已删）时读取时回退首个，
    // 不回写 store——回写交给 BidPullView 的兜底 effect，避免两处同时回写。
    const activeSchemeId = bidPullSchemeId ?? schemes[0]?.id ?? null;

    // 系统字段候选全集：Excel 池 + 已激活资产，Map 保证同名去重并携带示例值
    const unionParams = useMemo(() => {
        const map = new Map<string, VehicleParameter>();
        const addAll = (params: VehicleParameter[]) =>
            params.forEach((p) => {
                if (p.name && !map.has(p.name)) map.set(p.name, p);
            });
        uploadedFiles.forEach((file) => addAll(file.data));
        activeAssets.forEach((fileName) => {
            const asset = assetFiles.find((a) => a.fileName === fileName);
            if (asset) addAll(asset.data);
        });
        return map;
    }, [uploadedFiles, assetFiles, activeAssets]);

    const unionNames = useMemo(() => Array.from(unionParams.keys()), [unionParams]);

    const sourceOptions = (input: string) =>
        buildFieldSearchResults(input, unionNames, [])
            .slice(0, 20)
            .map((result) => {
                const sample = unionParams.get(result.name)?.value;
                return {
                    value: result.name,
                    label: sample !== undefined && sample !== '' ? `${result.name} = ${sample}` : result.name,
                };
            });

    const activeScheme = schemes.find((s) => s.id === activeSchemeId) ?? null;

    // ---- 方案级操作 --------------------------------------------------------
    const updateSchemes = (updater: (scheme: BidMappingScheme) => BidMappingScheme) =>
        setSchemes((prev) => prev.map((s) => (s.id === activeSchemeId ? updater(s) : s)));

    const handleAddScheme = () => {
        const scheme: BidMappingScheme = {
            id: createSchemeId(),
            name: `投标方案 ${schemes.length + 1}`,
            createdAt: new Date().toISOString(),
            rules: [],
        };
        setSchemes((prev) => [...prev, scheme]);
        setBidPullSchemeId(scheme.id);
    };

    const handleDuplicateScheme = () => {
        if (!activeScheme) return;
        const copy: BidMappingScheme = {
            ...activeScheme,
            id: createSchemeId(),
            name: `${activeScheme.name} 副本`,
            createdAt: new Date().toISOString(),
            rules: activeScheme.rules.map((rule) => ({ ...rule, id: createBidRuleId(), sources: [...rule.sources] })),
        };
        setSchemes((prev) => [...prev, copy]);
        setBidPullSchemeId(copy.id);
    };

    const handleRemoveScheme = () => {
        if (schemes.length <= 1) {
            message.warning('至少保留一个方案');
            return;
        }
        // 副作用放在 setSchemes 之外：严格模式下 updater 会被调用两次
        const next = schemes.filter((s) => s.id !== activeSchemeId);
        setSchemes(next);
        setBidPullSchemeId(next[0]?.id ?? null);
    };

    // ---- 规则级操作 --------------------------------------------------------
    const updateRule = (ruleId: string, patch: Partial<BidFieldRule>) =>
        updateSchemes((scheme) => ({
            ...scheme,
            rules: scheme.rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
        }));

    const removeRule = (ruleId: string) =>
        updateSchemes((scheme) => ({ ...scheme, rules: scheme.rules.filter((rule) => rule.id !== ruleId) }));

    const moveRule = (ruleId: string, offset: -1 | 1) =>
        updateSchemes((scheme) => {
            const index = scheme.rules.findIndex((rule) => rule.id === ruleId);
            const target = index + offset;
            if (index < 0 || target < 0 || target >= scheme.rules.length) return scheme;
            const rules = [...scheme.rules];
            [rules[index], rules[target]] = [rules[target], rules[index]];
            return { ...scheme, rules };
        });

    const setRuleSources = (ruleId: string, sources: string[]) => updateRule(ruleId, { sources });

    /** 一键置顶：字段多时逐格上移太慢（规则顺序即取数矩阵与导出文件的行序） */
    const moveRuleToTop = (ruleId: string) =>
        updateSchemes((scheme) => ({ ...scheme, rules: moveRuleToFront(scheme.rules, ruleId) }));

    const handleAutoSuggest = (rule: BidFieldRule) => {
        if (!rule.target.trim()) {
            message.warning('请先填写目标字段名');
            return;
        }
        const match = findBestMatch(rule.target, Array.from(unionParams.values()));
        if (match.matchType === 'none' || !match.matchedParam) {
            message.info(`未找到与「${rule.target}」相近的系统字段，请手动添加来源`);
            return;
        }
        setRuleSources(rule.id, [match.matchedParam.name]);
        message.success(`已建议来源：${match.matchedParam.name}（可继续添加来源组合）`);
    };

    const handleBatchAdd = () => {
        const names = parseFieldBatchInput(batchInput);
        if (names.length === 0) return;
        updateSchemes((scheme) => {
            const existing = new Set(scheme.rules.map((rule) => rule.target.trim()));
            const additions = names
                .filter((name) => !existing.has(name))
                .map((name) => ({ id: createBidRuleId(), target: name, sources: [] as string[] }));
            if (additions.length === 0) return scheme;
            return { ...scheme, rules: [...scheme.rules, ...additions] };
        });
        message.success(`已添加 ${names.length} 个目标字段（重名已跳过）`);
        setBatchInput('');
    };

    // ---- 保存 --------------------------------------------------------------
    const handleSave = async () => {
        if (!assetLibraryPath) {
            message.warning('请先在「车型资产」中选择资产库目录，方案将保存在该目录下');
            return;
        }
        const now = new Date().toISOString();
        const cleaned: BidMappingScheme[] = schemes.map((scheme) => ({
            ...scheme,
            name: scheme.name.trim() || '未命名方案',
            updatedAt: now,
            rules: scheme.rules
                .filter((rule) => rule.target.trim())
                .map((rule) => ({
                    ...rule,
                    target: rule.target.trim(),
                    sources: Array.from(new Set(rule.sources.map((s) => s.trim()).filter(Boolean))),
                    template: rule.template?.trim() || undefined,
                    note: rule.note?.trim() || undefined,
                })),
        }));
        const ok = await saveBidMappingsConfig(assetLibraryPath, cleaned);
        if (!ok) {
            message.error('保存失败，请检查资产库目录权限');
            return;
        }
        await reloadBidMappings(assetLibraryPath);
        bumpBidMappingsVersion();
        message.success(`已保存 ${cleaned.length} 个方案到 ${assetLibraryPath}`);
        onSaved?.(activeSchemeId);
        onClose();
    };

    // ---- 渲染 --------------------------------------------------------------
    const renderRule = (rule: BidFieldRule, index: number, total: number) => {
        const boundSourceCount = rule.sources.filter((s) => s.trim()).length;
        return (
            <div key={rule.id} className="surface-inset border border-default rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-3 w-5 text-right">{index + 1}</span>
                    <Input
                        size="small"
                        className="flex-1"
                        placeholder="投标字段名，如：外扩尺寸"
                        value={rule.target}
                        onChange={(e) => updateRule(rule.id, { target: e.target.value })}
                    />
                    {boundSourceCount > 1 && (
                        <Input
                            size="small"
                            className="w-52"
                            addonBefore="模板"
                            placeholder={defaultTemplateFor(boundSourceCount)}
                            value={rule.template ?? ''}
                            onChange={(e) => updateRule(rule.id, { template: e.target.value })}
                        />
                    )}
                    <Button
                        size="small"
                        type="text"
                        title="置顶"
                        icon={<VerticalAlignTopOutlined />}
                        disabled={index === 0}
                        onClick={() => moveRuleToTop(rule.id)}
                    />
                    <Button size="small" type="text" icon={<UpOutlined />} disabled={index === 0} onClick={() => moveRule(rule.id, -1)} />
                    <Button size="small" type="text" icon={<DownOutlined />} disabled={index === total - 1} onClick={() => moveRule(rule.id, 1)} />
                    <Popconfirm title="删除该字段规则？" onConfirm={() => removeRule(rule.id)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </div>
                <div className="pl-7 flex flex-col gap-1.5">
                    {rule.sources.map((source, sourceIndex) => (
                        <div key={sourceIndex} className="flex items-center gap-2">
                            <span className="text-xs text-3 w-6 text-right font-mono">{`{${sourceIndex}}`}</span>
                            <AutoComplete
                                size="small"
                                className="flex-1"
                                value={source}
                                options={sourceOptions(source)}
                                onChange={(value) => {
                                    const next = [...rule.sources];
                                    next[sourceIndex] = value;
                                    setRuleSources(rule.id, next);
                                }}
                                placeholder="系统来源字段名（输入搜索，如：外形尺寸长）"
                            />
                            <Button
                                size="small"
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => setRuleSources(rule.id, rule.sources.filter((_, i) => i !== sourceIndex))}
                            />
                        </div>
                    ))}
                    <div className="flex items-center gap-4">
                        <a className="text-xs" onClick={() => setRuleSources(rule.id, [...rule.sources, ''])}>
                            <PlusOutlined /> 添加来源
                        </a>
                        {rule.sources.length === 0 && (
                            <a className="text-xs" onClick={() => handleAutoSuggest(rule)}>
                                <ThunderboltOutlined /> 智能匹配来源
                            </a>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex items-center gap-2">
                <Select
                    className="flex-1"
                    value={activeSchemeId}
                    onChange={setBidPullSchemeId}
                    options={schemes.map((scheme) => ({
                        value: scheme.id,
                        label: `${scheme.name}（${scheme.rules.length} 项）`,
                    }))}
                    placeholder="选择方案"
                />
                <Button size="small" onClick={handleAddScheme}><PlusOutlined /> 新建</Button>
                <Button size="small" onClick={handleDuplicateScheme} disabled={!activeScheme}><CopyOutlined /> 复制</Button>
                <Popconfirm title={`删除方案「${activeScheme?.name ?? ''}」？`} onConfirm={handleRemoveScheme}>
                    <Button size="small" danger disabled={!activeScheme}><DeleteOutlined /> 删除</Button>
                </Popconfirm>
            </div>

            {activeScheme && (
                <div className="flex items-center gap-2">
                    <span className="text-sm text-3 whitespace-nowrap">方案名称</span>
                    <Input
                        className="flex-1"
                        value={activeScheme.name}
                        onChange={(e) =>
                            setSchemes((prev) =>
                                prev.map((s) => (s.id === activeScheme.id ? { ...s, name: e.target.value } : s))
                            )
                        }
                        placeholder="如：物流车投标 2026 / 冷链项目常用字段"
                    />
                </div>
            )}

            {activeScheme && activeScheme.rules.length > 0 ? (
                activeScheme.rules.map((rule, index) => renderRule(rule, index, activeScheme.rules.length))
            ) : (
                <Empty description="暂无字段规则，可批量添加或在下方逐条新增" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}

            {activeScheme && (
                <div className="surface-inset border border-default rounded-lg p-3">
                    <div className="mb-2 text-sm font-medium">批量添加目标字段（支持换行、分号分隔，括号内的分隔符不拆分）</div>
                    <div className="flex items-start gap-2">
                        <TextArea
                            rows={3}
                            className="flex-1"
                            value={batchInput}
                            onChange={(e) => setBatchInput(e.target.value)}
                            placeholder={'每行一个投标字段名，例如：\n外扩尺寸\n车辆重量（kg）\n电机额定功率(kw)'}
                        />
                        <Button onClick={handleBatchAdd}>添加</Button>
                    </div>
                </div>
            )}

            <div className="mt-auto pt-3 border-t border-default flex justify-end items-center">
                <Space>
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" onClick={handleSave}>保存方案</Button>
                </Space>
            </div>
        </div>
    );
};

const BidMappingDrawer: React.FC<BidMappingDrawerProps> = ({ open, onClose, onSaved }) => (
    <Drawer
        title="字段关联方案管理"
        width={720}
        open={open}
        onClose={onClose}
        destroyOnClose
        styles={{ body: { display: 'flex', flexDirection: 'column' } }}
    >
        {/* 内容保持挂载到退场动画播完，由 destroyOnClose 在动画后卸载——
            包 {open && …} 会让抽屉滑出时只剩空壳 */}
        <SchemeEditor onClose={onClose} onSaved={onSaved} />
    </Drawer>
);

export default BidMappingDrawer;
