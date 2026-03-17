import React, { type ReactNode } from 'react';
import { version } from '../../../package.json';
import { Layout as AntLayout, Menu, Switch, Tooltip, Button, message } from 'antd';
import { DatabaseOutlined, DiffOutlined, FormOutlined, AppstoreOutlined, SafetyCertificateOutlined, GlobalOutlined, SunOutlined, MoonOutlined, SettingOutlined, DeleteOutlined } from '@ant-design/icons';
import { useThemeStore } from '../../store/themeStore';
import { useVehicleStore } from '../../store/vehicleStore';
import { open } from '@tauri-apps/plugin-dialog';
import { reloadCustomFields } from '../../utils/fieldLists';
import { preloadEnumData } from '../../utils/attributeEnums';
import { reloadCustomAssetTagGroups } from '../../utils/assetTagGroups';
import { Modal } from 'antd';
import { useShallow } from 'zustand/react/shallow';

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
        label: '数据池',
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
    const { assetLibraryPath, setAssetLibraryPath } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        setAssetLibraryPath: state.setAssetLibraryPath
    })));

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

    const handleSetAssetLibrary = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: '选择资产库目录'
            });
            if (selected && typeof selected === 'string') {
                setAssetLibraryPath(selected);
                message.success(`已设置资产库目录: ${selected}`);
            }
        } catch (err) {
            console.error('Failed to select directory', err);
            message.error('选择目录失败');
        }
    };

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
                    <Tooltip title={assetLibraryPath ? `资产库: ${assetLibraryPath}` : '设置资产库目录'}>
                        <Button 
                            type="text" 
                            size="small"
                            icon={<SettingOutlined className={assetLibraryPath ? (isDarkMode ? "text-blue-400" : "text-blue-500") : "text-gray-400"} />} 
                            onClick={handleSetAssetLibrary}
                            className="ml-2"
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
