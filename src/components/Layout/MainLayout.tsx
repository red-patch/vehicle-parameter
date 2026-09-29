import React, { type ReactNode } from 'react';
import { version } from '../../../package.json';
import { Layout as AntLayout, Menu, Tooltip, Button } from 'antd';
import { DatabaseOutlined, DiffOutlined, FormOutlined, SafetyCertificateOutlined, GlobalOutlined, SunOutlined, MoonOutlined, SettingOutlined, DeleteOutlined } from '@ant-design/icons';
import { useThemeStore } from '../../store/themeStore';
import { useVehicleStore } from '../../store/vehicleStore';
import { reloadCustomFields } from '../../utils/fieldLists';
import { reloadBidMappings } from '../../utils/bidFieldMapping';
import { preloadEnumData } from '../../utils/attributeEnums';
import { reloadCustomAssetTagGroups } from '../../utils/assetTagGroups';
import { Modal } from 'antd';

const { Header, Content, Footer } = AntLayout;

interface MainLayoutProps {
    children: ReactNode;
    activeTab?: string;
    onTabChange?: (key: string) => void;
}

const items = [
    {
        key: 'pool',
        icon: <DatabaseOutlined />,
        label: '资产管理',
    },
    {
        key: 'compare',
        icon: <DiffOutlined />,
        label: '版本对比',
    },
    {
        key: 'fill',
        icon: <FormOutlined />,
        label: '智能填报',
    },
    {
        key: 'purify',
        icon: <SafetyCertificateOutlined />,
        label: '数据体检与修复',
    },
    {
        key: 'announcement',
        icon: <GlobalOutlined />,
        label: '公告号查询',
    },
    {
        key: 'dict',
        icon: <SettingOutlined />,
        label: '系统配置',
    },
];

const MainLayout: React.FC<MainLayoutProps> = ({ children, activeTab = 'workbench', onTabChange }) => {
    const { isDarkMode, toggleDarkMode } = useThemeStore();
    const assetLibraryPath = useVehicleStore(state => state.assetLibraryPath);

    // 监听本地资产路径挂载事件，触发字典与标准的超级同化机制
    React.useEffect(() => {
        if (assetLibraryPath) {
            void reloadCustomFields(assetLibraryPath);
            void preloadEnumData(assetLibraryPath);
            void reloadCustomAssetTagGroups(assetLibraryPath);
            void reloadBidMappings(assetLibraryPath);
        } else {
            void reloadCustomAssetTagGroups('');
        }
    }, [assetLibraryPath]);

    // 窗口尺寸/位置记忆由 tauri-plugin-window-state 在 Rust 侧自动处理

    // 全局键盘快捷键
    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const isCmd = e.metaKey || e.ctrlKey;
            // Cmd/Ctrl + S: 触发保存（冒泡到当前激活的 save 按钮）
            if (isCmd && e.key === 's') {
                e.preventDefault();
                // 寻找页面上第一个 type="primary" 且文本含"保存"的按钮并点击
                const saveBtn = document.querySelector<HTMLButtonElement>(
                    'button.ant-btn-primary:not(.ant-btn-background-ghost)'
                );
                saveBtn?.click();
            }
            // Cmd/Ctrl + F: 聚焦搜索框
            if (isCmd && e.key === 'f') {
                e.preventDefault();
                const searchInput = document.querySelector<HTMLInputElement>(
                    'input[placeholder*="搜索"], input[placeholder*="Search"]'
                );
                searchInput?.focus();
                searchInput?.select();
            }
            // Cmd/Ctrl + W: 关闭最顶层的 Modal/Drawer
            if (isCmd && e.key === 'w') {
                e.preventDefault();
                const closeBtn = document.querySelector<HTMLButtonElement>(
                    '.ant-modal-close, .ant-drawer-close'
                );
                if (closeBtn) { closeBtn.click(); return; }
                // 如果没有 Modal，回到上一个 tab（就是之前的 pool tab）
                // 在 macOS 上 Cmd+W 关标签页是标准行为
            }
            // Escape: 关闭最顶层的 Modal/Drawer
            if (e.key === 'Escape') {
                const closeBtn = document.querySelector<HTMLButtonElement>(
                    '.ant-modal-close, .ant-drawer-close'
                );
                closeBtn?.click();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    const handleClearCache = () => {
        Modal.confirm({
            title: '确认清除系统缓存？',
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
                        <div className="select-all break-all">
                            {window.navigator.platform.includes('Mac')
                                ? '~/Library/Application Support/com.vehicle.parameter/'
                                : '%LOCALAPPDATA%\\com.vehicle.parameter\\'}
                        </div>
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
            }
        });
    };

    return (
        <AntLayout className="min-h-screen">
            <Header data-tauri-drag-region className={`app-header flex items-center gap-3 px-4 h-12 border-b sticky top-0 z-50 surface-container border-default`}>
                <div data-tauri-drag-region className="min-w-0 shrink flex items-center gap-2">
                    <span
                        data-testid="app-title"
                        data-tauri-drag-region
                        className={`max-w-[180px] truncate font-semibold text-sm md:max-w-[260px] lg:max-w-none text-1`}
                    >
                        DST车型参数管理工具
                    </span>
                    <span data-tauri-drag-region className="font-mono text-xs text-3 tabular-nums whitespace-nowrap">v{version}</span>
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                    <div data-testid="top-nav-scroll" className="top-nav-scroll min-w-0 flex-1 overflow-x-auto">
                        <Menu
                            mode="horizontal"
                            selectedKeys={[activeTab]}
                            items={items}
                            className="min-w-max border-none bg-transparent"
                            onClick={(info) => onTabChange && onTabChange(info.key)}
                        />
                    </div>
                    <Tooltip title={isDarkMode ? '亮色模式' : '暗色模式'}>
                        <Button
                            type="text"
                            size="small"
                            onClick={toggleDarkMode}
                            icon={isDarkMode ? <SunOutlined className="text-2" /> : <MoonOutlined className="text-2" />}
                        />
                    </Tooltip>
                    <Tooltip title="清除缓存并重置系统">
                        <Button
                            type="text"
                            size="small"
                            icon={<DeleteOutlined className="text-3 hover:text-danger" />}
                            onClick={handleClearCache}
                        />
                    </Tooltip>
                </div>
            </Header>
            <Content className="p-4">
                {children}
            </Content>
            <Footer className="text-center text-xs py-2.5 border-t border-default text-3 bg-transparent">
                © {new Date().getFullYear()} 计皓琛
            </Footer>
        </AntLayout>
    );
};

export default MainLayout;
