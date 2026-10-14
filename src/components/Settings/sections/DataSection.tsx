import React from 'react';
import { Button, Descriptions, Modal, Space, Typography, message } from 'antd';
import { DeleteOutlined, FolderOpenOutlined, ReloadOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

const isTauri = (): boolean =>
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 物理数据位置（用于提示用户手动彻底删除、以及「打开数据目录」的兜底展示） */
function physicalDataPath(): string {
    const mac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
    return mac
        ? '~/Library/Application Support/com.vehicle.parameter/'
        : '%LOCALAPPDATA%\\com.vehicle.parameter\\';
}

/** localStorage 序列化后的近似字节数——供用户判断重置的必要性（粗算，不追求精确） */
function estimateStorageBytes(): number {
    if (typeof localStorage === 'undefined') return 0;
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key == null) continue;
        const value = localStorage.getItem(key) ?? '';
        // UTF-16，每字符 2 字节
        total += (key.length + value.length) * 2;
    }
    return total;
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * 数据与危险操作（设计文档 §4.4）。
 *
 * 「重置本地数据」由 `MainLayout.handleClearCache` 迁入——它此前是 header 上一个
 * 无文字的裸图标，与暗色切换并排，且不可逆。放进设置面板后有了标签与分组。
 */
const DataSection: React.FC = () => {
    const [bytes, setBytes] = React.useState(() => estimateStorageBytes());

    const refreshUsage = () => setBytes(estimateStorageBytes());

    const openDataDir = async () => {
        try {
            const pathApi = await import('@tauri-apps/api/path');
            const opener = await import('@tauri-apps/plugin-opener');
            await opener.openPath(await pathApi.appDataDir());
        } catch (e) {
            message.error(`无法打开数据目录：${e}`);
        }
    };

    const handleClearCache = () => {
        Modal.confirm({
            title: '确认重置本地数据？',
            icon: <DeleteOutlined style={{ color: 'var(--danger)' }} />,
            content: (
                <div className="text-sm">
                    <p>这将执行以下操作：</p>
                    <ul className="list-disc pl-4 mt-2 mb-4">
                        <li>清空所有已上传的临时文件</li>
                        <li>重置已选车型、对比历史及填报配置</li>
                        <li>清除主题及界面状态偏好</li>
                    </ul>
                    <div className="surface-inset p-2 rounded border-default">
                        <div className="font-bold mb-1">物理数据位置 (用于手动彻底删除):</div>
                        <div className="select-all break-all">{physicalDataPath()}</div>
                    </div>
                    <p className="mt-4 font-bold text-warning-text">注意：此操作不可恢复，应用将自动重启。</p>
                </div>
            ),
            okText: '立即重置',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => {
                localStorage.clear();
                window.location.reload();
            },
        });
    };

    return (
        <div className="space-y-6">
            <section>
                <Title level={5} className="!mb-1">本地存储</Title>
                <Text type="secondary" className="block mb-2">
                    应用偏好与本机设置的占用（不含资产文件本身）。
                </Text>
                <Descriptions column={1} size="small" bordered>
                    <Descriptions.Item label="占用">{formatBytes(bytes)}</Descriptions.Item>
                    {isTauri() && (
                        <Descriptions.Item label="数据目录">
                            <Text className="font-mono text-xs">{physicalDataPath()}</Text>
                        </Descriptions.Item>
                    )}
                </Descriptions>
            </section>

            <section>
                <Title level={5} className="!mb-1">维护</Title>
                <Space size="small" className="mt-2">
                    {isTauri() && (
                        <Button size="small" icon={<FolderOpenOutlined />} onClick={() => void openDataDir()}>
                            打开数据目录
                        </Button>
                    )}
                    <Button size="small" icon={<ReloadOutlined />} onClick={refreshUsage}>
                        重新计算占用
                    </Button>
                </Space>
            </section>

            <section>
                <Title level={5} className="!mb-1">危险操作</Title>
                <Text type="secondary" className="block mb-2">
                    重置将清空本机的全部应用数据与偏好，且不可恢复。
                </Text>
                <Button danger size="small" icon={<DeleteOutlined />} onClick={handleClearCache}>
                    重置本地数据
                </Button>
            </section>
        </div>
    );
};

export default DataSection;
