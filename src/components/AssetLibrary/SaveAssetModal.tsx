import React, { useState, useEffect } from 'react';
import { Modal, Input, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { checkAssetExists, loadAssetTags, setAssetFileTags } from '../../utils/assetManager';
import { useVehicleStore } from '../../store/vehicleStore';

// 标签颜色池（与 DataSourcePanel 保持一致）
const TAG_COLORS = ['blue', 'green', 'orange', 'purple', 'cyan', 'magenta', 'geekblue', 'gold', 'lime', 'volcano'];
const getTagColor = (tag: string) => TAG_COLORS[Math.abs([...tag].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % TAG_COLORS.length];

interface SaveAssetModalProps {
    visible: boolean;
    onClose: () => void;
    onSave: (fileName: string) => Promise<void>;
    onSaved?: () => void;
    defaultName: string;
    defaultTags?: string[];
}

const SaveAssetModal: React.FC<SaveAssetModalProps> = ({ visible, onClose, onSave, onSaved, defaultName, defaultTags = [] }) => {
    const [fileName, setFileName] = useState(defaultName);
    const [loading, setLoading] = useState(false);
    const { assetLibraryPath } = useVehicleStore();

    // 标签相关
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [allTags, setAllTags] = useState<string[]>([]);
    const [newTagInput, setNewTagInput] = useState('');

    useEffect(() => {
        if (visible) {
            setFileName(defaultName);
            setLoading(false);
            setSelectedTags(defaultTags.filter(tag => tag.trim()));
            setNewTagInput('');
            // 加载全局已有标签
            if (assetLibraryPath) {
                loadAssetTags(assetLibraryPath).then(tagsMap => {
                    const tagSet = new Set<string>();
                    Object.values(tagsMap).forEach(tags => tags.forEach(t => tagSet.add(t)));
                    setAllTags(Array.from(tagSet).sort());
                });
            }
        }
    }, [visible, defaultName, defaultTags, assetLibraryPath]);

    const toggleTag = (tag: string) => {
        setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    };

    const handleAddNewTag = () => {
        const trimmed = newTagInput.trim();
        if (!trimmed) return;
        if (!selectedTags.includes(trimmed)) {
            setSelectedTags(prev => [...prev, trimmed]);
        }
        if (!allTags.includes(trimmed)) {
            setAllTags(prev => [...prev, trimmed].sort());
        }
        setNewTagInput('');
    };

    const handleSave = async () => {
        if (!fileName.trim()) {
            message.warning('请输入文件名');
            return;
        }
        
        if (!assetLibraryPath) {
            message.error('请先在应用右上角"⚙️"设置资产库持久保存路径！');
            return;
        }

        try {
            setLoading(true);
            const exists = await checkAssetExists(assetLibraryPath, fileName.trim());
            if (exists) {
                Modal.confirm({
                    title: '覆盖警告',
                    content: `资产库中已存在同名数据文件，是否强制覆盖更新？`,
                    okText: '确认覆盖',
                    cancelText: '取消',
                    okButtonProps: { danger: true },
                    onOk: async () => { await performSave(); },
                    onCancel: () => { setLoading(false); }
                });
            } else {
                await performSave();
            }
        } catch (error) {
            console.error('Error checking file existence:', error);
            message.error('保存前检查失败');
            setLoading(false);
        }
    };

    const performSave = async () => {
        try {
            await onSave(fileName.trim());
            // 保存成功后写入标签
            if (assetLibraryPath && selectedTags.length > 0) {
                await setAssetFileTags(assetLibraryPath, fileName.trim() + '.json', selectedTags);
            }
            // 标签已落盘，通知父级刷新
            onSaved?.();
            onClose();
        } catch (error) {
            console.error("Save failed:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title="📥 保存至数据资产库"
            open={visible}
            onCancel={onClose}
            onOk={handleSave}
            confirmLoading={loading}
            okText="确定保存"
            cancelText="取消"
            destroyOnClose
            width={480}
        >
            <div className="py-4 space-y-5">
                <p className="text-gray-500 text-sm m-0">
                    系统会自动将其以 JSON 格式极速归档至您指定的本地资产库目录。
                    再次加载时，将秒开无需任何解析与转化等待。
                </p>

                {/* 文件名 */}
                <div className="flex flex-col gap-1.5">
                    <label className="font-medium text-gray-700 text-sm">资产文件名</label>
                    <Input 
                        value={fileName} 
                        onChange={(e) => setFileName(e.target.value)} 
                        placeholder="例如: 红旗EH7_长续航版_2026定稿"
                        addonAfter=".json"
                        onPressEnter={handleSave}
                        autoFocus
                    />
                </div>

                {/* 标签选择 */}
                <div className="flex flex-col gap-1.5">
                    <label className="font-medium text-gray-700 text-sm">资产标签 <span className="text-gray-400 font-normal">(可选)</span></label>
                    
                    {/* 已有标签：点击切换选中 */}
                    {allTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 p-2.5 bg-gray-50 rounded-lg border border-gray-100 min-h-[36px]">
                            {allTags.map(tag => (
                                <Tag
                                    key={tag}
                                    color={selectedTags.includes(tag) ? getTagColor(tag) : undefined}
                                    onClick={() => toggleTag(tag)}
                                    className={`cursor-pointer text-[11px] m-0 px-2 py-0 leading-[22px] rounded-md border transition-all select-none ${
                                        selectedTags.includes(tag)
                                            ? 'font-bold shadow-sm'
                                            : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-500'
                                    }`}
                                >
                                    {tag}
                                </Tag>
                            ))}
                        </div>
                    )}

                    {/* 新增标签输入 */}
                    <Input
                        size="small"
                        placeholder="输入新标签后回车添加"
                        value={newTagInput}
                        onChange={e => setNewTagInput(e.target.value)}
                        onPressEnter={handleAddNewTag}
                        suffix={
                            <PlusOutlined
                                className="text-gray-400 hover:text-blue-500 cursor-pointer"
                                onClick={handleAddNewTag}
                            />
                        }
                    />

                    {/* 已选标签预览 */}
                    {selectedTags.length > 0 && (
                        <div className="text-[11px] text-gray-400">
                            已选: {selectedTags.map(t => (
                                <Tag key={t} color={getTagColor(t)} closable onClose={() => toggleTag(t)} className="text-[10px] m-0 mr-1">{t}</Tag>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default SaveAssetModal;
