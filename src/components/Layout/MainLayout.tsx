import React, { type ReactNode } from 'react';
import { version } from '../../../package.json';
import { Layout as AntLayout, Menu, Switch, Tooltip, Button } from 'antd';
import { DatabaseOutlined, DiffOutlined, FormOutlined, AppstoreOutlined, SafetyCertificateOutlined, GlobalOutlined, SunOutlined, MoonOutlined, SettingOutlined, DeleteOutlined } from '@ant-design/icons';
import { useThemeStore } from '../../store/themeStore';
import { useVehicleStore } from '../../store/vehicleStore';
import { reloadCustomFields } from '../../utils/fieldLists';
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
        key: 'multi',
        icon: <AppstoreOutlined />,
        label: '多车型管理',
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
        } else {
            void reloadCustomAssetTagGroups('');
        }
    }, [assetLibraryPath]);

    // 保存/恢复窗口位置和大小
    React.useEffect(() => {
        const restore = async () => {
            try {
                const { getCurrentWindow, LogicalPosition, LogicalSize } = await import('@tauri-apps/api/window');
                const { readTextFile, writeTextFile } = await import('@tauri-apps/plugin-fs');
                const { appDataDir } = await import('@tauri-apps/api/path');
                const appWindow = getCurrentWindow();
                const statePath = `${await appDataDir()}window_state.json`;
                try {
                    const saved = JSON.parse(await readTextFile(statePath));
                    if (saved.x !== undefined && saved.y !== undefined) {
                        await appWindow.setPosition(new LogicalPosition(saved.x, saved.y));
                    }
                    if (saved.width && saved.height) {
                        await appWindow.setSize(new LogicalSize(saved.width, saved.height));
                    }
                } catch { /* 首次启动，没有保存的状态 */ }
                // 窗口关闭时保存位置和大小
                appWindow.onCloseRequested(async () => {
                    try {
                        const pos = await appWindow.outerPosition();
                        const size = await appWindow.outerSize();
                        await writeTextFile(statePath, JSON.stringify({
                            x: pos.x, y: pos.y, width: size.width, height: size.height,
                        }));
                    } catch { /* 静默保存失败 */ }
                });
            } catch { /* 非 Tauri 环境 */ }
        };
        restore();
    }, []);

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
            icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
            content: (
                <div className="text-sm">
                    <p>这将执行以下操作：</p>
                    <ul className="list-disc pl-4 mt-2 mb-4">
                        <li>清空所有已上传的临时文件</li>
                        <li>重置已选车型、对比历史及填报配置</li>
                        <li>清除主题及界面状态偏好</li>
                    </ul>
                    <div className="bg-gray-100 p-2 rounded text-xs dark:bg-gray-800 border dark:border-gray-700">
                        <div className="font-bold mb-1">物理数据位置 (用于手动彻底删除):</div>
                        <div className="select-all break-all">
                            {window.navigator.platform.includes('Mac') 
                                ? '~/Library/Application Support/com.vehicle.parameter/' 
                                : '%LOCALAPPDATA%\\com.vehicle.parameter\\'}
                        </div>
                    </div>
                    <p className="mt-4 font-bold text-amber-600">注意：此操作不可恢复，应用将自动重启。</p>
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
            <Header className={`flex items-center gap-3 px-4 h-12 border-b sticky top-0 z-50 ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="min-w-0 shrink flex items-center gap-2">
                    <span
                        data-testid="app-title"
                        className={`max-w-[180px] truncate font-semibold md:max-w-[260px] lg:max-w-none ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
                    >
                        DST车型参数管理工具 v{version}
                    </span>
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                    <div data-testid="top-nav-scroll" className="min-w-0 flex-1 overflow-x-auto">
                        <Menu
                            mode="horizontal"
                            selectedKeys={[activeTab]}
                            items={items}
                            className="min-w-max border-none bg-transparent"
                            onClick={(info) => onTabChange && onTabChange(info.key)}
                        />
                    </div>
                    <Tooltip title={isDarkMode ? '亮色模式' : '暗色模式'}>
                        <Switch
                            size="small"
                            checked={isDarkMode}
                            onChange={toggleDarkMode}
                            checkedChildren={<MoonOutlined />}
                            unCheckedChildren={<SunOutlined />}
                        />
                    </Tooltip>
                    <Tooltip title="清除缓存并重置系统">
                        <Button 
                            type="text" 
                            size="small"
                            icon={<DeleteOutlined className="text-gray-400 hover:text-red-500 transition-colors" />} 
                            onClick={handleClearCache}
                        />
                    </Tooltip>
                </div>
            </Header>
            <Content className="p-4">
                {children}
            </Content>
            <Footer className="text-center text-gray-400 text-xs py-3 bg-transparent">
                DST车型参数管理工具 v{version} © {new Date().getFullYear()} 计皓琛
            </Footer>
        </AntLayout>
    );
};

export default MainLayout;
