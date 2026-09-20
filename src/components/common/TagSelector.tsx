import React, { useState, useMemo } from 'react';
import { Tag, Popover, Input, Button } from 'antd';
import { getAssetTagGroupsSync } from '../../utils/assetTagGroups';

interface TagSelectorProps {
    selected: string[];
    onChange: (tags: string[]) => void;
    /** 可选可用标签列表，为空时从系统标签分组自动获取 */
    availableTags?: string[];
    trigger?: 'click' | 'hover';
}

/**
 * 分组标签选择器。
 * 标签全中性（分类靠文字区分，不靠颜色，见视觉方案 §3.4）；
 * 唯一着色是"已选"控制态（brand-weak 弱底 + 蓝字）。
 */
const TagSelector: React.FC<TagSelectorProps> = ({
    selected,
    onChange,
    availableTags,
    trigger = 'click',
}) => {
    const [open, setOpen] = useState(false);
    const [newTag, setNewTag] = useState('');

    const groupedTags = useMemo(() => {
        const groups = getAssetTagGroupsSync();
        // 合并可用标签和已选标签（新标签也能显示）
        const allKnownTags = new Set(availableTags ?? []);
        selected.forEach(t => allKnownTags.add(t));

        // 按系统分组归类
        const grouped = groups.groups
            .map(g => ({ ...g, tags: g.tags.filter(t => allKnownTags.has(t)) }))
            .filter(g => g.tags.length > 0);

        // 未分组的标签兜底：在 allKnownTags 但不在任何系统分组的
        const systemTags = new Set(groups.groups.flatMap(g => g.tags));
        const ungrouped = Array.from(allKnownTags).filter(t => !systemTags.has(t));

        if (ungrouped.length > 0) {
            grouped.push({ id: '_ungrouped', name: '未分组', tags: ungrouped });
        }

        return grouped;
    }, [availableTags, selected]);

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

    return (
        <Popover
            open={open}
            onOpenChange={setOpen}
            trigger={trigger}
            placement="bottomRight"
            content={
                <div className="max-h-[300px] overflow-y-auto" style={{ width: 260 }}>
                    <div className="text-xs text-3 mb-1.5">选择或新建标签</div>
                    {groupedTags.map((g) => (
                        <div key={g.id} className="mb-1.5">
                            <div className="text-[11px] text-3 mb-0.5">{g.name}</div>
                            <div className="flex flex-wrap gap-1">
                                {g.tags.map((tag) => (
                                    <Tag
                                        key={tag}
                                        className={`!m-0 cursor-pointer ${selected.includes(tag) ? 'tag-checked' : ''}`}
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
                        <div className="text-xs text-4 mb-2">暂无标签分组，请在系统配置中创建</div>
                    )}
                    <div className="flex items-center gap-1 pt-1.5 border-t border-default">
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
            <Tag className="shrink-0 cursor-pointer" onClick={e => e.stopPropagation()}>
                {selected.length > 0 ? `${selected.length} 标签` : '+标签'}
            </Tag>
        </Popover>
    );
};

export default TagSelector;
