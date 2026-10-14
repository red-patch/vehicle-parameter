import React from 'react';
import { Button, Space, Tag, Typography, message } from 'antd';
import { FolderOpenOutlined, SelectOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../../store/vehicleStore';
import { useRegulationStore } from '../../../store/regulationStore';

const { Text, Title } = Typography;

const isTauri = (): boolean =>
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 选目录（两处共用），返回选中的绝对路径或 null */
async function pickDirectory(title: string): Promise<string | null> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const picked = await open({ directory: true, multiple: false, title });
    return picked && typeof picked === 'string' ? picked : null;
}

/** 在系统文件管理器中定位该路径 */
async function revealPath(path: string) {
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
    await revealItemInDir(path);
}

interface PathRowProps {
    label: string;
    hint: string;
    path: string | null;
    onPick: () => void;
}

const PathRow: React.FC<PathRowProps> = ({ label, hint, path, onPick }) => (
    <section>
        <Title level={5} className="!mb-1">{label}</Title>
        <Text type="secondary" className="block mb-2">{hint}</Text>
        <div className="flex items-center gap-2 mb-2">
            {path ? (
                <Tag className="max-w-[360px] truncate !mr-0 font-mono text-xs" title={path}>
                    {path}
                </Tag>
            ) : (
                <Tag color="warning" className="!mr-0">未设置</Tag>
            )}
        </div>
        <Space size="small">
            <Button size="small" icon={<SelectOutlined />} onClick={onPick}>
                {path ? '更换目录' : '选择目录'}
            </Button>
            {path && (
                <Button
                    size="small"
                    type="text"
                    icon={<FolderOpenOutlined />}
                    onClick={() => void revealPath(path)}
                >
                    在访达中显示
                </Button>
            )}
        </Space>
    </section>
);

/**
 * 路径与位置 —— 资产库目录 / 法规标准库目录的汇总入口（设计文档 §4.2）。
 *
 * 页内原有入口（车型资产页 / 法规页）保留；这里是**汇总**而非唯一入口：
 * 修复了手册与两处弹窗文案里「去右上角设置」承诺的按钮。
 * 路径仍归各自 store，本组件不复制状态。
 */
const PathsSection: React.FC = () => {
    const assetLibraryPath = useVehicleStore(s => s.assetLibraryPath);
    const setAssetLibraryPath = useVehicleStore(s => s.setAssetLibraryPath);
    const regulationRootPath = useRegulationStore(s => s.rootPath);
    const setRootPath = useRegulationStore(s => s.setRootPath);
    const loadRegulations = useRegulationStore(s => s.load);

    const pickAssetLibrary = async () => {
        try {
            const picked = await pickDirectory('选择资产库目录');
            if (picked) {
                setAssetLibraryPath(picked);
                message.success(`已设置资产库目录：${picked}`);
            }
        } catch (e) {
            console.error('选择目录失败', e);
            message.error('选择目录失败');
        }
    };

    const pickRegulationLibrary = async () => {
        try {
            const picked = await pickDirectory('选择法规标准库目录');
            if (picked) {
                setRootPath(picked);
                await loadRegulations(picked);
            }
        } catch (e) {
            console.error('选择目录失败', e);
            message.error('选择目录失败');
        }
    };

    if (!isTauri()) {
        return <Text type="secondary">路径设置仅桌面端可用。</Text>;
    }

    return (
        <div className="space-y-6">
            <PathRow
                label="资产库目录"
                hint="车型资产的持久保存位置。导入资产前需先设置。"
                path={assetLibraryPath}
                onPick={pickAssetLibrary}
            />
            <PathRow
                label="法规标准库目录"
                hint="法规标准 PDF 与登记信息的存放位置。"
                path={regulationRootPath || null}
                onPick={pickRegulationLibrary}
            />
        </div>
    );
};

export default PathsSection;
