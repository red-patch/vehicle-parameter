import React, { type ReactNode } from 'react';
import { Layout as AntLayout, Typography, Menu } from 'antd';
import { CarOutlined, FileSearchOutlined, DiffOutlined } from '@ant-design/icons';

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
];

const MainLayout: React.FC<MainLayoutProps> = ({ children, activeTab = 'diff', onTabChange }) => {
    return (
        <AntLayout className="min-h-screen">
            <Header className="flex items-center justify-between px-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <CarOutlined className="text-2xl text-blue-600" />
                    <Title level={4} style={{ margin: 0, color: '#2563eb' }}>
                        车辆参数工具
                    </Title>
                </div>
                <Menu
                    theme="light"
                    mode="horizontal"
                    selectedKeys={[activeTab]}
                    items={items}
                    className="flex-1 justify-end border-none min-w-[300px]"
                    onClick={(info) => onTabChange && onTabChange(info.key)}
                />
            </Header>
            <Content className="p-6 bg-gray-50">
                <div className="max-w-7xl mx-auto bg-white p-6 rounded-lg shadow-sm min-h-[calc(100vh-160px)]">
                    {children}
                </div>
            </Content>
            <Footer className="text-center text-gray-500 bg-gray-50">
                Vehicle Parameter Manager ©{new Date().getFullYear()} Created by 计皓琛2025.12
            </Footer>
        </AntLayout>
    );
};

export default MainLayout;
