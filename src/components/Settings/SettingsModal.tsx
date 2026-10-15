import React from 'react';
import { Modal } from 'antd';
import { useSettingsStore } from '../../store/settingsStore';
import { SETTINGS_SECTIONS } from './sections';
import { useSettingsHotkey } from './useSettingsHotkey';
import AppearanceSection from './sections/AppearanceSection';
import PathsSection from './sections/PathsSection';
import MobileSection from './sections/MobileSection';
import ShortcutsSection from './sections/ShortcutsSection';
import DataSection from './sections/DataSection';

/**
 * 设置面板（设计文档 §2 Q2：居中 Modal，左分类 + 右内容）。
 *
 * 开合由 `settingsStore.isOpen` 单点驱动；三个入口（⌘, / macOS 菜单事件 /
 * header 齿轮按钮）都只调 `store.open()`。快捷键监听也挂在这里，因为面板常驻
 * 挂载（`MainLayout` 中），生命周期比任何单个入口长。
 */
const SettingsModal: React.FC = () => {
    const isOpen = useSettingsStore(s => s.isOpen);
    const close = useSettingsStore(s => s.close);
    const activeSection = useSettingsStore(s => s.activeSection);
    const setActiveSection = useSettingsStore(s => s.setActiveSection);

    useSettingsHotkey();

    const content = React.useMemo(() => {
        switch (activeSection) {
            case 'appearance': return <AppearanceSection />;
            case 'paths': return <PathsSection />;
            case 'mobile': return <MobileSection />;
            case 'shortcuts': return <ShortcutsSection />;
            case 'data': return <DataSection />;
            default: return null;
        }
    }, [activeSection]);

    return (
        <Modal
            title="设置"
            open={isOpen}
            onCancel={close}
            footer={null}
            width={680}
            destroyOnHidden
            styles={{ body: { padding: 0 } }}
        >
            <div className="flex min-h-[380px]">
                <nav
                    role="tablist"
                    aria-label="设置分类"
                    className="w-40 shrink-0 border-r border-default py-2"
                >
                    {SETTINGS_SECTIONS.map(section => {
                        const active = section.key === activeSection;
                        return (
                            <button
                                key={section.key}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => setActiveSection(section.key)}
                                className={`w-full flex items-center gap-2 px-4 py-2 text-left text-body transition-colors border-l-2 ${
                                    active
                                        ? 'text-1 font-medium surface-inset border-l-[var(--brand)]'
                                        : 'text-2 border-l-transparent hover:text-1'
                                }`}
                            >
                                <span className="text-3">{section.icon}</span>
                                {section.label}
                            </button>
                        );
                    })}
                </nav>
                <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4 max-h-[70vh]">
                    {content}
                </div>
            </div>
        </Modal>
    );
};

export default SettingsModal;
