import React from 'react';
import { Alert, Button, Descriptions, Input, Modal, Space, Switch, Tag, Typography, message } from 'antd';
import { useVehicleStore } from '../../../store/vehicleStore';

const { Text, Title } = Typography;

const isTauri = (): boolean =>
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 与 `mobile_relay.rs` 的 `RelayStatus`（serde camelCase）对应 */
interface RelayStatus {
    configured: boolean;
    enabled: boolean;
    url: string | null;
    /** 中继对外地址（配置后替代手填的公网地址） */
    publicUrl: string | null;
    /** idle / connecting / connected / error / disabled */
    state: string;
    message: string | null;
}

/** 与 `mobile.rs` 的 `MobileStatus`（serde camelCase）对应 */
interface MobileStatus {
    running: boolean;
    port: number | null;
    /** true = 已关断（手机会看到离线页） */
    paused: boolean;
    deviceCount: number;
    publicUrl: string | null;
    relay: RelayStatus;
}

const RELAY_STATE_LABEL: Record<string, { text: string; color?: string }> = {
    connected: { text: '已连接', color: 'success' },
    connecting: { text: '正在连接', color: 'processing' },
    error: { text: '连不上', color: 'error' },
    idle: { text: '未连接' },
    disabled: { text: '未连接' },
};

interface PairingCodeInfo {
    code: string;
    expiresInSec: number;
    pairUrl: string | null;
}

/**
 * 手机查看 —— `mobile.rs` / `mobile_relay.rs` 命令的前端入口（设计文档 §4.3）。
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
    const [relayDraft, setRelayDraft] = React.useState('');
    const [relayBusy, setRelayBusy] = React.useState(false);

    const refresh = React.useCallback(async () => {
        if (!isTauri()) return;
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const s = await invoke<MobileStatus>('mobile_server_status', {
                libraryPath: assetLibraryPath ?? null,
            });
            setStatus(s);
            setUrlDraft(s.publicUrl ?? '');
            setRelayDraft(s.relay?.url ?? '');
        } catch (e) {
            console.error('读取手机服务状态失败', e);
        }
    }, [assetLibraryPath]);

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

    const connectRelay = async () => {
        const url = relayDraft.trim();
        if (!url) {
            message.warning('请填写中继地址');
            return;
        }
        if (!assetLibraryPath) {
            message.warning('请先在「路径与位置」中设置资产库目录');
            return;
        }
        setRelayBusy(true);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('set_mobile_relay', { url, libraryPath: assetLibraryPath });
            message.success('已保存，正在连接中继');
            await refresh();
        } catch (e) {
            message.error(`连接失败：${e}`);
        } finally {
            setRelayBusy(false);
        }
    };

    const disconnectRelay = async () => {
        setRelayBusy(true);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('set_mobile_relay', { url: null, libraryPath: assetLibraryPath ?? null });
            await refresh();
        } catch (e) {
            message.error(`断开失败：${e}`);
        } finally {
            setRelayBusy(false);
        }
    };

    const rotateRelayToken = () => {
        Modal.confirm({
            title: '更换中继令牌？',
            content: '手机上的访问地址会失效，所有设备需重新扫码配对。',
            okText: '更换',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    await invoke('regenerate_mobile_relay_token', {
                        libraryPath: assetLibraryPath ?? null,
                    });
                    message.success('已更换，请重新扫码');
                    await refresh();
                } catch (e) {
                    message.error(`更换失败：${e}`);
                }
            },
        });
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
                <Title level={5} className="!mb-1">自建中继</Title>
                <Text type="secondary" className="block mb-2">
                    接到你自己的服务器。桌面主动连出，不需要公网端口；手机打开中继上的地址即可访问。
                </Text>
                <Space.Compact style={{ width: '100%' }}>
                    <Input
                        placeholder="https://relay.example.com"
                        value={relayDraft}
                        disabled={status?.relay?.enabled}
                        onChange={e => setRelayDraft(e.target.value)}
                    />
                    {status?.relay?.enabled
                        ? <Button loading={relayBusy} onClick={disconnectRelay}>断开</Button>
                        : <Button type="primary" loading={relayBusy} onClick={connectRelay}>连接</Button>}
                </Space.Compact>
                {status?.relay?.configured && (
                    <div className="mt-2 flex items-center gap-2">
                        <Tag color={RELAY_STATE_LABEL[status.relay.state]?.color}>
                            {RELAY_STATE_LABEL[status.relay.state]?.text ?? status.relay.state}
                        </Tag>
                        {status.relay.message && (
                            <Text type="secondary" className="text-xs">{status.relay.message}</Text>
                        )}
                    </div>
                )}
                {status?.relay?.enabled && status?.publicUrl && (
                    <div className="mt-2">
                        <Text type="secondary" className="text-xs block">手机访问地址</Text>
                        <Text copyable={{ text: status.publicUrl }} className="text-xs break-all">
                            {status.publicUrl}
                        </Text>
                        <div>
                            <Button size="small" danger type="text" className="!px-0" onClick={rotateRelayToken}>
                                更换令牌
                            </Button>
                        </div>
                    </div>
                )}
            </section>

            <section>
                <Title level={5} className="!mb-1">公网地址</Title>
                {status?.relay?.enabled
                    ? (
                        <Text type="secondary">
                            公网地址由中继提供；断开中继后可在这里填写其它隧道地址。
                        </Text>
                    )
                    : (
                        <>
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
                        </>
                    )}
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
