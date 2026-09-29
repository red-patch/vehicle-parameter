import React from 'react';
import { Button, Dropdown } from 'antd';
import { DownOutlined, ExportOutlined, FileMarkdownOutlined, FileTextOutlined } from '@ant-design/icons';
import type { ReportFormat } from '../../utils/reportExport';

interface ReportExportDropdownProps {
    onExport: (format: ReportFormat) => void;
    disabled?: boolean;
    /** 按钮文案，默认「导出报告」 */
    label?: string;
}

/** 报告导出入口：HTML（自包含单文件，浏览器里可直接打印为 PDF）/ Markdown（适合 AI 阅读） */
const ReportExportDropdown: React.FC<ReportExportDropdownProps> = ({ onExport, disabled, label = '导出报告' }) => (
    <Dropdown
        menu={{
            items: [
                { key: 'html', icon: <FileTextOutlined />, label: 'HTML 报告' },
                { key: 'md', icon: <FileMarkdownOutlined />, label: 'Markdown（适合 AI）' },
            ],
            onClick: ({ key }) => onExport(key as ReportFormat),
        }}
        trigger={['click']}
    >
        <Button icon={<ExportOutlined />} disabled={disabled}>
            {label} <DownOutlined style={{ fontSize: 10 }} />
        </Button>
    </Dropdown>
);

export default ReportExportDropdown;
