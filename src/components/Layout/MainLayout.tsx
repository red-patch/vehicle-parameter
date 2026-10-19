import React, { type ReactNode } from 'react';
import { version } from '../../../package.json';
import { Layout as AntLayout, Menu, Tooltip, Button } from 'antd';
import { DatabaseOutlined, DiffOutlined, FormOutlined, SafetyCertificateOutlined, GlobalOutlined, BookOutlined, SunOutlined, MoonOutlined, SettingOutlined, CarOutlined, SearchOutlined } from '@ant-design/icons';
import { useThemeStore } from '../../store/themeStore';
import { useVehicleStore } from '../../store/vehicleStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useGlobalSearchStore } from '../../store/globalSearchStore';
import { formatShortcut } from '../../constants/shortcuts';
import { reloadCustomFields } from '../../utils/fieldLists';
import { reloadBidMappings } from '../../utils/bidFieldMapping';
import { preloadEnumData } from '../../utils/attributeEnums';
import { reloadCustomAssetTagGroups } from '../../utils/assetTagGroups';
import SettingsModal from '../Settings/SettingsModal';
import GlobalSearchModal from '../GlobalSearch/GlobalSearchModal';
import { APP_NAME } from '../../constants/app';
import { findSaveButton, findSearchInput, findTopmostCloseButton, isInsideOverlay } from '../../utils/hotkeyScope';

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
        label: '车型资产',
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
        label: '公告中心',
    },
    {
        key: 'regulation',
        icon: <BookOutlined />,
        label: '法规标准',
    },
    {
        key: 'dict',
        icon: <SettingOutlined />,
        label: '字段与词表',
    },
    {
        key: 'designer',
        icon: <CarOutlined />,
        label: '整车设计',
    },
];

const MainLayout: React.FC<MainLayoutProps> = ({ children, activeTab = 'workbench', onTabChange }) => {
    const { isDarkMode, toggleDarkMode } = useThemeStore();
    const assetLibraryPath = useVehicleStore(state => state.assetLibraryPath);
    const openSettings = useSettingsStore(state => state.open);

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

    // 全局键盘快捷键（注册表：constants/shortcuts.ts 的 global.*）
    // 所有模块常驻挂载、display:none 切换，所以目标一律走 hotkeyScope：
    // 只认可见元素，有弹层时只在最顶层弹层内找（见 utils/hotkeyScope.ts 文件头）。
    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const isCmd = e.metaKey || e.ctrlKey;
            const key = e.key.toLowerCase();
            // Cmd/Ctrl + S：点当前可见的「保存」按钮
            // （始终 preventDefault：避免 webview 弹「保存网页」）
            if (isCmd && !e.shiftKey && key === 's') {
                e.preventDefault();
                findSaveButton()?.click();
                return;
            }
            // Cmd/Ctrl + F：聚焦当前页面（或最顶层弹层）的搜索框
            if (isCmd && !e.shiftKey && key === 'f') {
                e.preventDefault();
                const searchInput = findSearchInput();
                searchInput?.focus();
                searchInput?.select();
                return;
            }
            // Cmd/Ctrl + W：关闭最顶层的 Modal/Drawer（macOS 上由系统菜单关窗，此绑定不生效）
            if (isCmd && key === 'w') {
                e.preventDefault();
                findTopmostCloseButton()?.click();
                return;
            }
            // Escape：焦点在弹层内时 antd 自己会关，这里只兜底「焦点不在弹层里」的情况，
            // 且只关最顶层一层——否则叠两层弹层时一次 Esc 会关掉两层。
            if (e.key === 'Escape') {
                if (e.defaultPrevented || isInsideOverlay(e.target)) return;
                findTopmostCloseButton()?.click();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    return (
        <AntLayout className="min-h-screen">
            <Header data-tauri-drag-region className={`app-header flex items-center gap-3 px-4 h-12 border-b sticky top-0 z-50 surface-container border-default`}>
                <div data-tauri-drag-region className="min-w-0 shrink flex items-center gap-2">
                    <span
                        data-testid="app-title"
                        data-tauri-drag-region
                        className={`max-w-[180px] truncate font-semibold text-sm md:max-w-[260px] lg:max-w-none text-1`}
                    >
                        {APP_NAME}
                    </span>
                    {/* 窄窗口让位给导航（版本号在设置面板里也能看到） */}
                    <span data-tauri-drag-region className="hidden xl:inline font-mono text-xs text-3 tabular-nums whitespace-nowrap">v{version}</span>
                </div>
                <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center justify-end gap-2">
                    <div data-testid="top-nav-scroll" data-tauri-drag-region className="top-nav-scroll min-w-0 flex-1 overflow-x-auto">
                        <Menu
                            data-tauri-drag-region
                            mode="horizontal"
                            selectedKeys={[activeTab]}
                            items={items}
                            className="min-w-max border-none bg-transparent"
                            onClick={(info) => onTabChange && onTabChange(info.key)}
                        />
                    </div>
                    {/* ⌘K 全局搜索此前只有快捷键、没有可见入口 */}
                    <Tooltip title={`全局搜索（${formatShortcut('mod+k')}）`}>
                        <Button
                            type="text"
                            size="small"
                            data-testid="open-global-search"
                            aria-label="全局搜索"
                            onClick={() => useGlobalSearchStore.getState().open()}
                            icon={<SearchOutlined className="text-2" />}
                        />
                    </Tooltip>
                    <Tooltip title={isDarkMode ? '亮色模式' : '暗色模式'}>
                        <Button
                            type="text"
                            size="small"
                            onClick={toggleDarkMode}
                            icon={isDarkMode ? <SunOutlined className="text-2" /> : <MoonOutlined className="text-2" />}
                        />
                    </Tooltip>
                    <Tooltip title="设置">
                        <Button
                            type="text"
                            size="small"
                            data-testid="open-settings"
                            aria-label="设置"
                            onClick={() => openSettings()}
                            icon={<SettingOutlined className="text-2" />}
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
            {/* 设置面板常驻挂载：开合由 settingsStore.isOpen 单点驱动，
                快捷键监听也随其生命周期驻留（见 useSettingsHotkey）。 */}
            <SettingsModal />
            {/* 全局搜索面板（⌘K）同模式常驻挂载：开合由 globalSearchStore 单点驱动。 */}
            <GlobalSearchModal />
        </AntLayout>
    );
};

export default MainLayout;
