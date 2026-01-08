import React, { type ReactNode } from 'react';
import { Layout as AntLayout, Typography, Menu, Switch, Tooltip } from 'antd';
import { FileSearchOutlined, DiffOutlined, GlobalOutlined, SunOutlined, MoonOutlined, FilterOutlined } from '@ant-design/icons';
import { useThemeStore } from '../../store/themeStore';

const { Header, Content, Footer } = AntLayout;
const { Title } = Typography;

interface MainLayoutProps {
    children: ReactNode;
    activeTab?: string;
    onTabChange?: (key: string) => void;
}

const items = [
    {
        key: 'diff',
        icon: <DiffOutlined />,
        label: '版本比对',
    },
    {
        key: 'search',
        icon: <FileSearchOutlined />,
        label: '智能检索与填充',
    },
    {
        key: 'announcement',
        icon: <GlobalOutlined />,
        label: '公告号查询',
    },
    {
        key: 'dedup',
        icon: <FilterOutlined />,
        label: '属性去重',
    },
];

const MainLayout: React.FC<MainLayoutProps> = ({ children, activeTab = 'diff', onTabChange }) => {
    const { isDarkMode, toggleDarkMode } = useThemeStore();

    return (
        <AntLayout className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
            <Header className={`flex items-center justify-between px-6 border-b ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-2">
                    <img src="/app-icon.png" alt="logo" className="w-8 h-8 rounded" />
                    <Title level={4} style={{ margin: 0, color: isDarkMode ? '#60a5fa' : '#2563eb' }}>
                        车辆参数工具
                    </Title>
                    <span className={`text-xs px-2 py-0.5 rounded ${isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>
                        v2.0.0
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <Menu
                        theme={isDarkMode ? 'dark' : 'light'}
                        mode="horizontal"
                        selectedKeys={[activeTab]}
                        items={items}
                        className={`flex-1 justify-end border-none min-w-[300px] ${isDarkMode ? 'bg-gray-900' : ''}`}
                        onClick={(info) => onTabChange && onTabChange(info.key)}
                    />
                    <Tooltip title={isDarkMode ? '切换亮色模式' : '切换暗色模式'}>
                        <Switch
                            checked={isDarkMode}
                            onChange={toggleDarkMode}
                            checkedChildren={<MoonOutlined />}
                            unCheckedChildren={<SunOutlined />}
                        />
                    </Tooltip>
                </div>
            </Header>
            <Content className={`p-6 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <div className={`max-w-7xl mx-auto p-6 rounded-lg shadow-sm min-h-[calc(100vh-160px)] ${isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-white'}`}>
                    {children}
                </div>
            </Content>
            <Footer className={`text-center ${isDarkMode ? 'text-gray-400 bg-gray-800' : 'text-gray-500 bg-gray-50'}`}>
                Vehicle Parameter Manager v2.0.0 ©{new Date().getFullYear()} Created by 计皓琛
            </Footer>
        </AntLayout>
    );
};

export default MainLayout;
