import React, { useEffect, useRef, useState } from 'react';
import { Modal, Checkbox, Tooltip, message } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { AssetFileInfo, AssetMetaMap } from '../../../utils/assetManager';
import { buildAliasSuggestions, type AliasSuggestion } from '../../../utils/assetAlias';

/**
 * 批量建议别名（设计 docs/plans/2026-10-13-asset-alias-design.md §D6/§D14）。
 *
 * 存量超长资产一次性派生短名供人工确认：可派生的默认勾选、可逐行改；
 * 派生不出的列出、标黄、默认不勾（建议永不自动生效——与「识别永不自动归档」同源）。
 */

export interface AssetAliasBatchModalProps {
    open: boolean;
    infos: AssetFileInfo[];
    metaMap: AssetMetaMap;
    /** fileName → 车型组显示名（用于派生建议） */
    groupNameOf: (info: AssetFileInfo) => string;
    onCancel: () => void;
    /** 确认写入：返回 [fileName, alias] 列表 */
    onConfirm: (entries: { fileName: string; alias: string }[]) => Promise<void> | void;
}

const AssetAliasBatchModal: React.FC<AssetAliasBatchModalProps> = ({
    open, infos, metaMap, groupNameOf, onCancel, onConfirm,
}) => {
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [edited, setEdited] = useState<Record<string, string>>({});
    const [suggestions, setSuggestions] = useState<AliasSuggestion[]>([]);

    // 每次打开只计算一次建议并初始化勾选/输入框——避免随父组件重渲染，
    // 重新计算把用户已改的输入框内容冲掉（groupNameOf 是内联回调，不能进依赖）。
    const groupNameOfRef = useRef(groupNameOf);
    groupNameOfRef.current = groupNameOf;

    useEffect(() => {
        if (!open) return;
        const next = buildAliasSuggestions(
            infos.map(i => ({ fileName: i.fileName, productName: i.productName, capacityRaw: i.capacityRaw })),
            info => groupNameOfRef.current(infos.find(i => i.fileName === info.fileName)!),
            metaMap,
        );
        setSuggestions(next);
        setChecked(new Set(next.filter(s => s.selected).map(s => s.fileName)));
        setEdited(Object.fromEntries(next.map(s => [s.fileName, s.suggestedAlias])));
        // 仅随 open 变化重算：开弹窗时快照一次
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const valueOf = (fileName: string) => edited[fileName] ?? '';
    const toggle = (fileName: string, next: boolean) => {
        setChecked(prev => {
            const copy = new Set(prev);
            if (next) copy.add(fileName);
            else copy.delete(fileName);
            return copy;
        });
    };

    const handleOk = async () => {
        const entries = Array.from(checked)
            .map(fileName => ({ fileName, alias: valueOf(fileName).trim() }))
            .filter(e => e.alias);
        if (entries.length === 0) {
            message.info('没有勾选任何别名');
            return;
        }
        await onConfirm(entries);
    };

    return (
        <Modal
            title="批量建议别名"
            open={open}
            onOk={() => void handleOk()}
            onCancel={onCancel}
            okText={`保存 ${checked.size} 条`}
            cancelText="取消"
            width={720}
            destroyOnClose
        >
            <div className="text-[13px] text-2 mb-3">
                按「车型组 + 电量」派生短名，勾选后一次性写入。别名<b>只改显示</b>，不影响文件名与归组。
                <br />
                派生不出的（电量缺失等）已列出但默认不勾选，可手工补一个。
            </div>
            <div className="max-h-[420px] overflow-y-auto custom-scrollbar border border-[var(--border)] rounded-lg">
                <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-[var(--bg)] text-3">
                        <tr>
                            <th className="w-10 py-2"></th>
                            <th className="text-left py-2 px-2">原名</th>
                            <th className="text-left py-2 px-2 w-[200px]">建议别名</th>
                        </tr>
                    </thead>
                    <tbody>
                        {suggestions.map(s => (
                            <tr key={s.fileName} className="border-t border-[var(--border)]">
                                <td className="py-1.5 text-center">
                                    <Checkbox
                                        checked={checked.has(s.fileName)}
                                        onChange={e => toggle(s.fileName, e.target.checked)}
                                    />
                                </td>
                                <td className="py-1.5 px-2 text-2">
                                    <div className="truncate max-w-[380px]" title={s.productName}>{s.productName}</div>
                                </td>
                                <td className="py-1.5 px-2">
                                    <div className="flex items-center gap-1">
                                        <input
                                            className="ant-input"
                                            style={{ height: 26 }}
                                            value={valueOf(s.fileName)}
                                            placeholder="派生不出，请手工填写"
                                            onChange={e => setEdited(prev => ({ ...prev, [s.fileName]: e.target.value }))}
                                        />
                                        {!s.derivable && !valueOf(s.fileName) && (
                                            <Tooltip title="无法从车型组+电量派生（电量缺失或名称过长）">
                                                <WarningOutlined className="text-[#d97706]" />
                                            </Tooltip>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Modal>
    );
};

export default AssetAliasBatchModal;
