import React, { useState, useEffect, useRef } from 'react';
import { Modal, Input, message } from 'antd';
import TagSelector from '../common/TagSelector';
import { checkAssetExists, setAssetFileTags } from '../../utils/assetManager';
import { ensureTagsInDefaultGroup, getAssetTagGroupsSync } from '../../utils/assetTagGroups';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';

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
    const { assetLibraryPath, bumpAssetTagGroupsVersion } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        bumpAssetTagGroupsVersion: state.bumpAssetTagGroupsVersion,
    })));

    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [allAvailableTags, setAllAvailableTags] = useState<string[]>([]);
    const inputRef = useRef<any>(null);

    // 弹窗打开时聚焦输入框
    useEffect(() => {
        if (visible && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [visible]);

    useEffect(() => {
        if (visible) {
            setFileName(defaultName);
            setLoading(false);
            setSelectedTags(defaultTags.filter(tag => tag.trim()));
            // 加载系统中所有已有标签
            import('../../utils/assetManager').then(({ loadAssetTags }) => {
                if (assetLibraryPath) {
                    loadAssetTags(assetLibraryPath).then(tagsMap => {
                        const set = new Set<string>();
                        Object.values(tagsMap).forEach(tags => tags.forEach(t => set.add(t)));
                        getAssetTagGroupsSync().groups.forEach(g => g.tags.forEach(t => set.add(t)));
                        setAllAvailableTags(Array.from(set).sort());
                    }).catch(() => {});
                }
            });
        }
    }, [visible, defaultName, defaultTags, assetLibraryPath]);

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
            // 保存成功后写入标签并同步到分组配置
            if (assetLibraryPath && selectedTags.length > 0) {
                await setAssetFileTags(assetLibraryPath, fileName.trim() + '.json', selectedTags);
                const groupsUpdated = await ensureTagsInDefaultGroup(assetLibraryPath, selectedTags);
                if (groupsUpdated) bumpAssetTagGroupsVersion();
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
            title="📥 保存车型至资产库"
            open={visible}
            onCancel={onClose}
            onOk={handleSave}
            confirmLoading={loading}
            okText="保存并加入待分析"
            cancelText="取消"
            destroyOnClose
            width={480}
        >
            <div className="py-4 space-y-5">
                <p className="text-3 text-sm m-0">
                    系统会自动将其以 JSON 格式极速归档至您指定的本地资产库目录。
                    再次加载时，将秒开无需任何解析与转化等待。
                </p>

                {/* 文件名 */}
                <div className="flex flex-col gap-1.5">
                    <label className="font-medium text-2 text-sm">资产文件名</label>
                    <Input 
                        ref={inputRef}
                        value={fileName} 
                        onChange={(e) => setFileName(e.target.value)} 
                        placeholder="例如: 红旗EH7_长续航版_2026定稿"
                        addonAfter=".json"
                        onPressEnter={handleSave}
                    />
                </div>

                {/* 标签选择 */}
                <div className="flex flex-col gap-1.5">
                    <label className="font-medium text-2 text-sm">资产标签 <span className="text-3 font-normal">(可选)</span></label>
                    <TagSelector
                        selected={selectedTags}
                        availableTags={allAvailableTags}
                        onChange={setSelectedTags}
                    />
                </div>
            </div>
        </Modal>
    );
};

export default SaveAssetModal;
