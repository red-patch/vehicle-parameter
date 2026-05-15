import React, { useState, useMemo } from 'react';
import { Tag, Popover, Input, Button } from 'antd';
import { getAssetTagGroupsSync } from '../../utils/assetTagGroups';

interface TagSelectorProps {
    selected: string[];
    onChange: (tags: string[]) => void;
    /** 可选可用标签列表，为空时从系统标签分组自动获取 */
    availableTags?: string[];
    color?: string;
    trigger?: 'click' | 'hover';
}

const TAG_COLORS = ['blue', 'green', 'orange', 'purple', 'cyan', 'magenta', 'geekblue', 'gold', 'lime'];

const TagSelector: React.FC<TagSelectorProps> = ({
    selected,
    onChange,
    availableTags,
    color,
    trigger = 'click',
}) => {
    const [open, setOpen] = useState(false);
    const [newTag, setNewTag] = useState('');

    const groupedTags = useMemo(() => {
        const groups = getAssetTagGroupsSync();
        if (availableTags) {
            // 如果有外部传入的可用标签，按系统分组归类
            const tagSet = new Set(availableTags);
            return groups.groups
                .map(g => ({ ...g, tags: g.tags.filter(t => tagSet.has(t)) }))
                .filter(g => g.tags.length > 0);
        }
        return groups.groups.filter(g => g.tags.length > 0);
    }, [availableTags]);

    const toggleTag = (tag: string) => {
        if (selected.includes(tag)) {
            onChange(selected.filter(t => t !== tag));
            return;
        }
        // 检查互斥：如果该标签属于某个互斥组，取消同组其他标签
        const config = getAssetTagGroupsSync();
        const containingGroup = config.groups.find(g => g.tags.includes(tag));
        if (containingGroup && config.exclusiveGroups.includes(containingGroup.id)) {
            // 互斥组：只保留选中这一个
            onChange([...selected.filter(t => !containingGroup.tags.includes(t)), tag]);
        } else {
            onChange([...selected, tag]);
        }
    };

    const addNewTag = () => {
        const t = newTag.trim();
        if (t && !selected.includes(t)) {
            onChange([...selected, t]);
        }
        setNewTag('');
    };

    const getColor = (idx: number) => TAG_COLORS[idx % TAG_COLORS.length];

    return (
        <Popover
            open={open}
            onOpenChange={setOpen}
            trigger={trigger}
            placement="bottomRight"
            content={
                <div className="max-h-[300px] overflow-y-auto" style={{ width: 260 }}>
                    <div className="text-xs text-slate-500 mb-1.5">选择或新建标签</div>
                    {groupedTags.map((g, gi) => (
                        <div key={g.id} className="mb-1.5">
                            <div className="text-[11px] text-slate-400 mb-0.5">{g.name}</div>
                            <div className="flex flex-wrap gap-1">
                                {g.tags.map((tag) => (
                                    <Tag
                                        key={tag}
                                        color={selected.includes(tag) ? (color || getColor(gi)) : undefined}
                                        className="cursor-pointer !m-0"
                                        style={{ fontSize: 11 }}
                                        onClick={() => toggleTag(tag)}
                                    >
                                        {tag}
                                    </Tag>
                                ))}
                            </div>
                        </div>
                    ))}
                    {groupedTags.length === 0 && (
                        <div className="text-xs text-slate-300 mb-2">暂无标签分组，请在系统配置中创建</div>
                    )}
                    <div className="flex items-center gap-1 pt-1.5 border-t border-slate-100">
                        <Input
                            size="small"
                            value={newTag}
                            onChange={e => setNewTag(e.target.value)}
                            onPressEnter={addNewTag}
                            placeholder="新建标签"
                            className="flex-1"
                        />
                        <Button size="small" type="primary" onClick={addNewTag} disabled={!newTag.trim()}>添加</Button>
                    </div>
                </div>
            }
        >
            <Tag
                color={selected.length > 0 ? (color || 'blue') : undefined}
                className="cursor-pointer shrink-0"
                onClick={e => e.stopPropagation()}
            >
                {selected.length > 0 ? `${selected.length} 标签` : '+标签'}
            </Tag>
        </Popover>
    );
};

export default TagSelector;
