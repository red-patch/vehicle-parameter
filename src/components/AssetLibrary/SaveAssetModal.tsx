import React, { useState, useEffect } from 'react';
import { Modal, Input, message } from 'antd';
import { checkAssetExists } from '../../utils/assetManager';
import { useVehicleStore } from '../../store/vehicleStore';

interface SaveAssetModalProps {
    visible: boolean;
    onClose: () => void;
    onSave: (fileName: string) => Promise<void>;
    defaultName: string;
}

const SaveAssetModal: React.FC<SaveAssetModalProps> = ({ visible, onClose, onSave, defaultName }) => {
    const [fileName, setFileName] = useState(defaultName);
    const [loading, setLoading] = useState(false);
    const { assetLibraryPath } = useVehicleStore();

    useEffect(() => {
        if (visible) {
            setFileName(defaultName);
            setLoading(false);
        }
    }, [visible, defaultName]);

    const handleSave = async () => {
        if (!fileName.trim()) {
            message.warning('请输入文件名');
            return;
        }
        
        if (!assetLibraryPath) {
            message.error('请先在应用右上角“⚙️”设置资产库持久保存路径！');
            return;
        }

        try {
            setLoading(true);
            const exists = await checkAssetExists(assetLibraryPath, fileName.trim());
            if (exists) {
                // Secondary confirmation if file exists
                Modal.confirm({
                    title: '覆盖警告',
                    content: `资产库中已存在同名数据文件，是否强制覆盖更新？`,
                    okText: '确认覆盖',
                    cancelText: '取消',
                    okButtonProps: { danger: true },
                    onOk: async () => {
                        await performSave();
                    },
                    onCancel: () => {
                        setLoading(false);
                    }
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
            onClose();
        } catch (error) {
            console.error("Save failed:", error);
            // message handled by parent
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
        >
            <div className="py-4">
                <p className="text-gray-500 mb-4 text-sm">
                    系统会自动将其以 JSON 格式极速归档至您指定的本地资产库目录。
                    再次加载时，将秒开无需任何解析与转化等待。
                </p>
                <div className="flex flex-col gap-2">
                    <label className="font-medium text-gray-700">资产文件名 (可自定义):</label>
                    <Input 
                        value={fileName} 
                        onChange={(e) => setFileName(e.target.value)} 
                        placeholder="请输入存储文件名，例如: 红旗EH7_长续航版_2026定稿"
                        addonAfter=".json"
                        onPressEnter={handleSave}
                        autoFocus
                    />
                </div>
            </div>
        </Modal>
    );
};

export default SaveAssetModal;
