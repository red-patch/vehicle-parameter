import React from 'react';
import { Radio, Segmented, Typography } from 'antd';
import { useThemeStore } from '../../../store/themeStore';
import { useSettingsStore, type FontScale } from '../../../store/settingsStore';

const { Text, Title } = Typography;

/**
 * 外观 —— 主题与界面字号（设计文档 §4.1）。
 *
 * 主题仍归 `themeStore`：本组件只读它，不复制状态。三选一的语义映射：
 * - 跟随系统 → followSystem=true（themeStore 的 matchMedia 会立即按系统校正）
 * - 亮色 / 暗色 → followSystem=false + 显式定色
 */
const AppearanceSection: React.FC = () => {
    const { isDarkMode, followSystem, setDarkMode, setFollowSystem } = useThemeStore();
    const fontSize = useSettingsStore(s => s.fontSize);
    const setFontSize = useSettingsStore(s => s.setFontSize);

    // 'system' | 'light' | 'dark' 由两个 store 字段合成——单选框的值域
    const themeValue = followSystem ? 'system' : isDarkMode ? 'dark' : 'light';

    const onThemeChange = (value: string) => {
        if (value === 'system') {
            setFollowSystem(true);
            return;
        }
        setFollowSystem(false);
        setDarkMode(value === 'dark');
    };

    return (
        <div className="space-y-6">
            <section>
                <Title level={5} className="!mb-1">主题</Title>
                <Text type="secondary" className="block mb-3">
                    跟随系统时，随 macOS / Windows 的外观设置实时切换。
                </Text>
                <Radio.Group
                    value={themeValue}
                    onChange={e => onThemeChange(e.target.value)}
                    options={[
                        { label: '跟随系统', value: 'system' },
                        { label: '亮色', value: 'light' },
                        { label: '暗色', value: 'dark' },
                    ]}
                />
            </section>

            <section>
                <Title level={5} className="!mb-1">界面字号</Title>
                <Text type="secondary" className="block mb-3">
                    调整全局文字大小，表格与表单控件一并跟随。少量图表内的文字不随此设置变化。
                </Text>
                <Segmented<FontScale>
                    value={fontSize}
                    onChange={setFontSize}
                    options={[
                        { label: '小', value: 'small' },
                        { label: '中', value: 'medium' },
                        { label: '大', value: 'large' },
                    ]}
                />
            </section>
        </div>
    );
};

export default AppearanceSection;
