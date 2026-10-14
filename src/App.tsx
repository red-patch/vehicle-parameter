import React from 'react';
import { ConfigProvider, message, Skeleton, theme } from 'antd';
import ErrorBoundary from './components/ErrorBoundary';
import zhCN from 'antd/locale/zh_CN';
import MainLayout from './components/Layout/MainLayout';
import LegacyDiffPanel from './components/DiffViewer/LegacyDiffPanel';
import { useVehicleStore } from './store/vehicleStore';
import { useThemeStore } from './store/themeStore';
import { useSettingsStore, FONT_SCALE_PX } from './store/settingsStore';
import { compareSheets } from './utils/comparator';
import { getThemeConfig } from './theme/themeConfig';
import { useShallow } from 'zustand/react/shallow';

const ParameterWorkbench = React.lazy(() => import('./components/ParameterWorkbench/ParameterWorkbench'));
const AnnouncementQuery = React.lazy(() => import('./components/AnnouncementQuery/AnnouncementQuery'));
const RegulationLibrary = React.lazy(() => import('./components/RegulationLibrary/RegulationLibrary'));
const ConfigManagerView = React.lazy(() => import('./components/SmartFiller/ConfigManagerView'));
const VehicleDesigner = React.lazy(() => import('./components/VehicleDesigner/VehicleDesigner'));

type WorkbenchTab = 'pool' | 'compare' | 'fill' | 'purify';
const WORKBENCH_TABS: WorkbenchTab[] = ['pool', 'compare', 'fill', 'purify'];

/**
 * 顶层模块全部 memo 化：activeTab 切换时 App 重渲染只改 display 包装 div，
 * 各模块（独立订阅 store）不再被连带重渲染——这是顶部切换卡顿的主因。
 */
const MemoWorkbench: React.FC<{
  activeTab: WorkbenchTab;
  onTabChange: (key: string) => void;
}> = React.memo(({ activeTab, onTabChange }) => (
  <ParameterWorkbench activeTab={activeTab} onTabChange={onTabChange} showTabs={false} />
));

const MemoAnnouncement: React.FC<{ onOpenWorkbench?: () => void }> = ({ onOpenWorkbench }) => (
  <AnnouncementQuery onOpenWorkbench={onOpenWorkbench} />
);
const MemoRegulationLibrary = React.memo(() => <RegulationLibrary />);
const MemoConfigManager = React.memo(() => <ConfigManagerView />);

const App: React.FC = () => {
  const { baseFile, targetFile, setDiffResult, compareMode } = useVehicleStore(useShallow(state => ({
    baseFile: state.baseFile,
    targetFile: state.targetFile,
    setDiffResult: state.setDiffResult,
    compareMode: state.compareMode,
  })));
  const { isDarkMode } = useThemeStore();
  const fontSize = useSettingsStore(state => state.fontSize);
  const [activeTab, setActiveTab] = React.useState('pool');
  // 工作台停留的内部 tab：切到非工作台模块时保持不变，MemoWorkbench 的 props
  // 稳定（不重渲染），回到工作台时状态原样。所有切 tab 入口都走 handleTabChange。
  const [workbenchTab, setWorkbenchTab] = React.useState<WorkbenchTab>('pool');
  const handleTabChange = React.useCallback((next: string) => {
    setActiveTab(next);
    if (WORKBENCH_TABS.includes(next as WorkbenchTab)) {
      setWorkbenchTab(next as WorkbenchTab);
    }
  }, []);

  // 同步暗黑模式到 DOM
  React.useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDarkMode]);

  // 同步界面字号到 DOM：驱动 index.css 的 --fs-* 变量（medium 移除属性即回默认）
  React.useEffect(() => {
    const root = document.documentElement;
    if (fontSize === 'medium') {
      root.removeAttribute('data-font-scale');
    } else {
      root.setAttribute('data-font-scale', fontSize);
    }
  }, [fontSize]);

  // Auto-run diff when both files are present or mode changes
  React.useEffect(() => {
    if (baseFile && targetFile) {
      try {
        const result = compareSheets(baseFile, targetFile, compareMode);
        setDiffResult(result);
      } catch (err) {
        console.error('Comparison error:', err);
        message.error('比对失败，请检查文件格式或数据完整性');
      }
    }
  }, [baseFile, targetFile, setDiffResult, compareMode]);

  // theme 对象必须 memo：内联字面量会让 ConfigProvider 的 context 在每次
  // activeTab 切换时变化，绕过所有子树的 React.memo 触发全应用 antd 重渲染
  const themeConfig = React.useMemo(() => ({
    ...getThemeConfig(isDarkMode, FONT_SCALE_PX[fontSize]),
    cssVar: {},
    algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
  }), [isDarkMode, fontSize]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={themeConfig}
    >
      <ErrorBoundary>
        <MainLayout activeTab={activeTab} onTabChange={handleTabChange}>

          {/* 所有模块保持挂载，用 display:none 切换，避免顶层菜单切换的 mount/unmount 开销 */}
          <React.Suspense fallback={<Skeleton active />}>
            <div className="vp-fade-in" style={{ display: WORKBENCH_TABS.includes(activeTab as WorkbenchTab) ? undefined : 'none' }}>
              <MemoWorkbench activeTab={workbenchTab} onTabChange={handleTabChange} />
            </div>
          </React.Suspense>

          {/* Legacy Tabs (Hidden from Menu but logic kept for safety) */}
          <React.Suspense fallback={<Skeleton active />}>
            <div className="vp-fade-in" style={{ display: activeTab === 'diff' ? undefined : 'none' }}>
              <LegacyDiffPanel />
            </div>
          </React.Suspense>

          <React.Suspense fallback={<Skeleton active />}>
            <div className="vp-fade-in" style={{ display: activeTab === 'announcement' ? undefined : 'none' }}>
              <MemoAnnouncement onOpenWorkbench={() => handleTabChange('pool')} />
            </div>
          </React.Suspense>

          <React.Suspense fallback={<Skeleton active />}>
            <div className="vp-fade-in" style={{ display: activeTab === 'regulation' ? undefined : 'none' }}>
              <MemoRegulationLibrary />
            </div>
          </React.Suspense>

          <React.Suspense fallback={<Skeleton active />}>
            <div className="vp-fade-in" style={{ display: activeTab === 'dict' ? undefined : 'none' }}>
              <MemoConfigManager />
            </div>
          </React.Suspense>

          <React.Suspense fallback={<Skeleton active />}>
            <div className="vp-fade-in" style={{ display: activeTab === 'designer' ? undefined : 'none' }}>
              <VehicleDesigner />
            </div>
          </React.Suspense>

        </MainLayout>
      </ErrorBoundary>
    </ConfigProvider>
  );
};

export default App;
