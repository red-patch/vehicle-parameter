import React, { useEffect, useState } from 'react';
import { Modal, AutoComplete } from 'antd';
import type { FacetVocab, GroupFacetValue } from '../../utils/assetFacets';

interface GroupFacetEditorProps {
    open: boolean;
    /** 组显示名 */
    groupName: string;
    /** 归组键（作用域） */
    groupKey: string;
    value: GroupFacetValue;
    vocab: FacetVocab;
    onConfirm: (value: GroupFacetValue) => void;
    onCancel: () => void;
}

/**
 * 组级属性编辑：主机厂、车型族群——一组一值，组内资产继承（ADR-0001）。
 * 下拉给出词表建议，也接受自由输入：词表外新值在保存时就地收词（进 _facet_vocab.json）。
 */
const GroupFacetEditor: React.FC<GroupFacetEditorProps> = ({
    open, groupName, value, vocab, onConfirm, onCancel,
}) => {
    const [manufacturer, setManufacturer] = useState<string>('');
    const [family, setFamily] = useState<string>('');

    useEffect(() => {
        if (open) {
            setManufacturer(value.manufacturer || '');
            setFamily(value.vehicleFamily || '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const manufacturerOptions = vocab.manufacturer.map(e => ({
        value: e.name,
        label: e.group && e.group !== e.name ? `${e.group}·${e.name}` : e.name,
    }));
    const familyOptions = vocab.vehicleFamily.map(f => ({ value: f, label: f }));

    return (
        <Modal
            open={open}
            title={`组属性：${groupName}`}
            width={480}
            onOk={() => onConfirm({
                manufacturer: manufacturer.trim() || undefined,
                vehicleFamily: family.trim() || undefined,
            })}
            onCancel={onCancel}
            okText="保存（应用到整组）"
            cancelText="取消"
            destroyOnHidden
        >
            <div className="space-y-3 py-1">
                <div className="flex items-center gap-2">
                    <span className="text-[13px] text-2 w-16 flex-shrink-0">主机厂</span>
                    <AutoComplete
                        className="flex-1"
                        placeholder="选择或直接输入新主机厂"
                        value={manufacturer}
                        onChange={v => setManufacturer(v)}
                        options={manufacturerOptions}
                        filterOption={(input, option) =>
                            String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                        allowClear
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[13px] text-2 w-16 flex-shrink-0">车型族群</span>
                    <AutoComplete
                        className="flex-1"
                        placeholder="选择或直接输入新族群（如 重卡）"
                        value={family}
                        onChange={v => setFamily(v)}
                        options={familyOptions}
                        filterOption={(input, option) =>
                            String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                        allowClear
                    />
                </div>
                <div className="text-[11px] text-3">
                    词表外的新值可直接输入，保存后自动收进词表、全库通用。
                </div>
            </div>
        </Modal>
    );
};

export default GroupFacetEditor;
