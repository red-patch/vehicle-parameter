import React from 'react';
import { Alert, Button, Descriptions, Input, Modal, Space, Switch, Tag, Typography, message } from 'antd';
import { useVehicleStore } from '../../../store/vehicleStore';

const { Text, Title } = Typography;

const isTauri = (): boolean =>
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 与 `mobile.rs` 的 `MobileStatus`（serde camelCase）对应 */
interface MobileStatus {
    running: boolean;
    port: number | null;
    /** true = 已关断（手机会看到离线页） */
    paused: boolean;
    deviceCount: number;
    publicUrl: string | null;
}

interface PairingCodeInfo {
    code: string;
    expiresInSec: number;
    pairUrl: string | null;
}

/**
 * 手机查看 —— `mobile.rs` 六个命令的前端入口（设计文档 §4.3）。
 *
 * 此前 P1（服务 + 令牌 + 配对）已在 Rust 侧实施，但前端零调用，用户摸不到；
 * 本组件把那套能力暴露出来。三条不可动摇（只绑 127.0.0.1 / 只读 / 每设备 token，
 * ADR-0004）不在前端改动范围——这里只是调用面。
 */
const MobileSection: React.FC = () => {
    const assetLibraryPath = useVehicleStore(s => s.assetLibraryPath);
    const [status, setStatus] = React.useState<MobileStatus | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [pairing, setPairing] = React.useState<PairingCodeInfo | null>(null);
    const [urlDraft, setUrlDraft] = React.useState('');

    const refresh = React.useCallback(async () => {
        if (!isTauri()) return;
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const s = await invoke<MobileStatus>('mobile_server_status');
            setStatus(s);
            setUrlDraft(s.publicUrl ?? '');
        } catch (e) {
            console.error('读取手机服务状态失败', e);
        }
    }, []);

    React.useEffect(() => {
        void refresh();
    }, [refresh]);

    const startServer = async () => {
        if (!assetLibraryPath) {
            message.warning('请先在「路径与位置」中设置资产库目录');
            return;
        }
        setBusy(true);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const port = await invoke<number>('start_mobile_server', { libraryPath: assetLibraryPath });
            message.success(`服务已启动，端口 ${port}`);
            await refresh();
        } catch (e) {
            message.error(`启动失败：${e}`);
        } finally {
            setBusy(false);
        }
    };

    const setEnabled = async (enabled: boolean) => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('set_mobile_server_enabled', { enabled });
            await refresh();
        } catch (e) {
            message.error(`操作失败：${e}`);
        }
    };

    const generateCode = async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const info = await invoke<PairingCodeInfo>('create_mobile_pairing_code');
            setPairing(info);
        } catch (e) {
            message.error(`生成配对码失败：${e}`);
        }
    };

    const savePublicUrl = async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('set_mobile_public_url', { url: urlDraft.trim() || null });
            message.success(urlDraft.trim() ? '已保存公网地址' : '已清除公网地址');
            await refresh();
        } catch (e) {
            message.error(`保存失败：${e}`);
        }
    };

    const revokeAll = () => {
        Modal.confirm({
            title: '撤销全部已配对设备？',
            content: '所有手机需重新配对才能继续查看。',
            okText: '撤销',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const n = await invoke<number>('revoke_all_mobile_devices');
                    message.success(`已撤销 ${n} 台设备`);
                    await refresh();
                } catch (e) {
                    message.error(`撤销失败：${e}`);
                }
            },
        });
    };

    if (!isTauri()) {
        return <Text type="secondary">手机查看仅桌面端可用。</Text>;
    }

    return (
        <div className="space-y-5">
            <section>
                <Title level={5} className="!mb-3">服务状态</Title>
                <Descriptions column={1} size="small" bordered>
                    <Descriptions.Item label="服务">
                        {status?.running
                            ? <Tag color="success">运行中（端口 {status.port}）</Tag>
                            : <Tag>未启动</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="对手机开放">
                        <Switch
                            checked={status ? !status.paused : false}
                            disabled={!status?.running}
                            onChange={setEnabled}
                        />
                    </Descriptions.Item>
                    <Descriptions.Item label="已配对设备">
                        {status?.deviceCount ?? 0} 台
                    </Descriptions.Item>
                    <Descriptions.Item label="公网地址">
                        {status?.publicUrl || <Text type="secondary">未设置</Text>}
                    </Descriptions.Item>
                </Descriptions>
                <Space className="mt-3" size="small">
                    <Button size="small" type="primary" loading={busy} onClick={startServer}>
                        {status?.running ? '重启服务' : '启动服务'}
                    </Button>
                    <Button size="small" onClick={() => void refresh()}>刷新</Button>
                    <Button
                        size="small"
                        danger
                        type="text"
                        disabled={!status?.deviceCount}
                        onClick={revokeAll}
                    >
                        撤销全部设备
                    </Button>
                </Space>
            </section>

            <section>
                <Title level={5} className="!mb-1">公网地址</Title>
                <Text type="secondary" className="block mb-2">
                    隧道对外地址（如 https://xxx.example.com）。设置后配对链接才能直达。
                </Text>
                <Space.Compact style={{ width: '100%' }}>
                    <Input
                        placeholder="https://..."
                        value={urlDraft}
                        onChange={e => setUrlDraft(e.target.value)}
                    />
                    <Button onClick={savePublicUrl}>保存</Button>
                </Space.Compact>
            </section>

            <section>
                <Title level={5} className="!mb-1">配对手机</Title>
                <Text type="secondary" className="block mb-2">
                    生成一次性配对码（10 分钟内有效），在手机浏览器打开配对链接输入。
                </Text>
                <Button size="small" onClick={generateCode}>生成配对码</Button>
                {pairing && (
                    <Alert
                        className="mt-3"
                        type="info"
                        showIcon
                        message={<span className="font-mono text-lg tracking-widest">{pairing.code}</span>}
                        description={
                            pairing.pairUrl
                                ? <Text copyable={{ text: pairing.pairUrl }} className="text-xs break-all">{pairing.pairUrl}</Text>
                                : <Text type="secondary" className="text-xs">未设置公网地址，请手动在手机输入配对码</Text>
                        }
                    />
                )}
            </section>
        </div>
    );
};

export default MobileSection;
