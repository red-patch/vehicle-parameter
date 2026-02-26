import React, { type ReactNode } from 'react';
import { Layout as AntLayout, Menu, Switch, Tooltip } from 'antd';
import { FileSearchOutlined, GlobalOutlined, SunOutlined, MoonOutlined, FilterOutlined, ReadOutlined } from '@ant-design/icons';
import { useThemeStore } from '../../store/themeStore';

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
        icon: <ReadOutlined />,
        label: '枚举字典',
    },
    {
        key: 'dedup',
        icon: <FilterOutlined />,
        label: '属性去重',
    },
];

const MainLayout: React.FC<MainLayoutProps> = ({ children, activeTab = 'workbench', onTabChange }) => {
    const { isDarkMode, toggleDarkMode } = useThemeStore();

    return (
        <AntLayout className="min-h-screen">
            <Header className={`flex items-center justify-between px-4 h-12 border-b sticky top-0 z-50 ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-2">
                    <span className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>智行参数管理系统 v4.0</span>
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
                </div>
            </Header>
            <Content className="p-4">
                {children}
            </Content>
            <Footer className="text-center text-gray-400 text-xs py-3 bg-transparent">
                智行参数管理系统 v4.0 © {new Date().getFullYear()}
            </Footer>
        </AntLayout>
    );
};

export default MainLayout;
