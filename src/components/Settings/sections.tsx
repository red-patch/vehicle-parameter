import { FolderOutlined, BarChartOutlined, MobileOutlined, BgColorsOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { SettingsSection } from '../../store/settingsStore';

/**
 * 设置面板的分类（设计文档 §4；2026-10-15 增「快捷键」）。
 *
 * 边界卡在「系统 / 环境相关」：字段与词表属业务域，已有顶级导航位，不在此列。
 */
export interface SectionMeta {
    key: SettingsSection;
    label: string;
    icon: React.ReactNode;
}

export const SETTINGS_SECTIONS: SectionMeta[] = [
    { key: 'appearance', label: '外观', icon: <BgColorsOutlined /> },
    { key: 'paths', label: '路径与位置', icon: <FolderOutlined /> },
    { key: 'shortcuts', label: '快捷键', icon: <ThunderboltOutlined /> },
    { key: 'mobile', label: '手机查看', icon: <MobileOutlined /> },
    { key: 'data', label: '数据与危险操作', icon: <BarChartOutlined /> },
];
