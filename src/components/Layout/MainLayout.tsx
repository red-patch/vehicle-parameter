import React, { type ReactNode } from 'react';
import { Layout as AntLayout, Menu, Switch, Tooltip, Button, message } from 'antd';
import { FileSearchOutlined, GlobalOutlined, SunOutlined, MoonOutlined, FilterOutlined, SettingOutlined } from '@ant-design/icons';
import { useThemeStore } from '../../store/themeStore';
import { useVehicleStore } from '../../store/vehicleStore';
import { open } from '@tauri-apps/plugin-dialog';
import { reloadCustomFields } from '../../utils/fieldLists';
import { preloadEnumData } from '../../utils/attributeEnums';

const { Header, Content, Footer } = AntLayout;

interface MainLayoutProps {
    children: ReactNode;
    activeTab?: string;
    onTabChange?: (key: string) => void;
}

const items = [
    {
        key: 'workbench',
        icon: <FileSearchOutlined />,
        label: '参数工作台',
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
    {
        key: 'dedup',
        icon: <FilterOutlined />,
        label: '属性去重',
    },
];

const MainLayout: React.FC<MainLayoutProps> = ({ children, activeTab = 'workbench', onTabChange }) => {
    const { isDarkMode, toggleDarkMode } = useThemeStore();
    const { assetLibraryPath, setAssetLibraryPath } = useVehicleStore();

    // 监听本地资产路径挂载事件，触发字典与标准的超级同化机制
    React.useEffect(() => {
        if (assetLibraryPath) {
            void reloadCustomFields(assetLibraryPath);
            void preloadEnumData(assetLibraryPath);
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

    return (
        <AntLayout className="min-h-screen">
            <Header className={`flex items-center justify-between px-4 h-12 border-b sticky top-0 z-50 ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-2">
                    <span className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>DST车型参数管理工具 v4.1</span>
                </div>
                <div className="flex items-center gap-2">
                    <Menu
                        mode="horizontal"
                        selectedKeys={[activeTab]}
                        items={items}
                        className="border-none bg-transparent min-w-[480px]"
                        onClick={(info) => onTabChange && onTabChange(info.key)}
                    />
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
                </div>
            </Header>
            <Content className="p-4">
                {children}
            </Content>
            <Footer className="text-center text-gray-400 text-xs py-3 bg-transparent">
                DST车型参数管理工具 v4.1 © {new Date().getFullYear()} 计皓琛
            </Footer>
        </AntLayout>
    );
};

export default MainLayout;
