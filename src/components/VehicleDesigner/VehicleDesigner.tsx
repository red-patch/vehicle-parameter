import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';

// Hooks
import { useVehicleParams } from './useVehicleParams';
import { useSavedConfigs } from './useSavedConfigs';
import { useResponsiveCanvas } from './useResponsiveCanvas';
import type { VehicleParams } from './types';

// Components
import ParameterPanel from './ParameterPanel/index';
import TopBar from './TopBar';
import BottomBar from './BottomBar';
import { SideView, FrontView } from './Canvas/index';
import ResultPanel from './ResultPanel';
import SaveConfigModal from './modals/SaveConfigModal';
import { useDesignerHotkeys, type DesignerView } from './useDesignerHotkeys';
import { useViewportPaneHeight } from '../../hooks/useViewportPaneHeight';

// Lazy loaded 3D
const Vehicle3D = lazy(() => import('./Vehicle3D'));

type View = DesignerView;

interface VehicleDesignerProps {
  /** 是否为当前可见页面（App 按顶层 activeTab 传入）；控制快捷键是否绑定 */
  active?: boolean;
}

/**
 * 与 useSavedConfigs 内部的 SavedConfig 结构一致（该接口未导出）。
 * 恢复配置与槽位叠加同用此形状。
 */
interface SavedConfigShape {
  id: number;
  name: string;
  timestamp: string;
  params: VehicleParams;
}

/**
 * VehicleDesigner — 主容器组件
 * 三段式布局：顶栏（TopBar）+ 中栏（左栏参数 | 画布 | 右栏结果）+ 底栏（BottomBar）
 */
const VehicleDesigner = ({ active = true }: VehicleDesignerProps) => {
  // --- Hooks ---
  const {
    params,
    setParams,
    handleChange,
    handleTireChange,
    parseAndApplyConfig,
    validateImportLines,
    ratioInfo,
    hasWheelConflict,
    isRearOverhangTooShort,
    copyToClipboard,
    resetParams,
    lastEditedKey,
    undo,
    redo,
    canUndo,
    canRedo,
    pushHistory,
  } = useVehicleParams();

  const {
    savedConfigs,
    showSaveModal,
    setShowSaveModal,
    saveName,
    setSaveName,
    selectedSlots,
    saveCurrentConfig,
    restoreConfig,
    deleteConfig,
    exportConfigsToCSV,
    toggleSlot,
    getSlotIndex,
  } = useSavedConfigs(params);

  const { containerRef, viewDimensions } = useResponsiveCanvas();

  // 整页钉在视口内（替代原 h-screen：外层已有导航与页脚，h-screen 会把底栏挤出视口）
  const rootRef = useRef<HTMLDivElement>(null);
  const paneHeight = useViewportPaneHeight(rootRef);

  // --- Local state ---
  const [activeTab, setActiveTab] = useState<View>('side');
  const [showDimensions] = useState(true);
  const [importText, setImportText] = useState('');
  // 3D 首次进入后再挂载（保持 lazy 懒加载），此后常驻不卸载 —— 切 Tab 用 CSS
  // 隐藏代替卸载，避免 WebGL context 反复销毁重建 + shader 全量重编译（性能审计报告 #6）
  const [hasVisited3D, setHasVisited3D] = useState(false);

  // --- 3D 参数节流 ---
  // 滑杆每个 input tick 都 setParams；3D 场景（troika 文字重排版等）按 100ms
  // 节流消费，避免每 tick 全量重建（性能审计报告 #4）。输入侧 params 保持实时。
  const [params3D, setParams3D] = useState<VehicleParams>(params);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // params 引用变化即重置定时器 —— 最后一次变更后 100ms 内无新输入才提交给 3D
    timerRef.current = setTimeout(() => setParams3D(params), 100);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [params]);
  // 组件卸载时清理
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // --- SVG 渲染基础计算 ---
  // 地面线下方要放 3 层尺寸标注（最深 groundY + 90 + 文字高），至少留 110px，避免画布较矮时被裁切
  const groundY = Math.min(viewDimensions.height * 0.85, viewDimensions.height - 110);

  // --- 文本导入处理 ---
  const [parseErrors, setParseErrors] = useState<Set<number>>(new Set());
  const handleParseImport = () => {
    const result = parseAndApplyConfig(importText);
    setParseErrors(result.errorLines);
    if (result.count > 0) {
      alert(`成功更新 ${result.count} 个参数！${result.errorLines.size > 0 ? ` (${result.errorLines.size} 行解析失败)` : ''}`);
    } else {
      alert('未识别到有效参数，请检查格式。');
    }
  };

  // 文本变化时实时更新错误行标记
  const handleImportTextChange = (val: string) => {
    setImportText(val);
    const { errorLines } = validateImportLines(val);
    setParseErrors(errorLines);
  };

  // --- 恢复配置 ---
  const handleRestoreConfig = (config: SavedConfigShape) => {
    pushHistory(params);
    restoreConfig(config, setParams);
  };

  // --- 导出 CSV ---
  const handleExportCSV = () => {
    exportConfigsToCSV();
  };

  // TopBar 的 onViewChange 签名为 (v: string) => void，
  // 本地 activeTab 保持收窄的 view 联合类型。
  const handleViewChange = (v: string) => {
    if (v === '3d') setHasVisited3D(true);
    setActiveTab(v as View);
  };

  // --- 键盘快捷键: 视图切换 1/2/3 + 撤销/重做（仅本页可见时生效） ---
  const handleSelectView = useCallback((view: View) => {
    if (view === '3d') setHasVisited3D(true);
    setActiveTab(view);
  }, []);
  useDesignerHotkeys({ enabled: active, onSelectView: handleSelectView, onUndo: undo, onRedo: redo });

  // --- 渲染 ---
  return (
    <div
      ref={rootRef}
      className="flex flex-col surface-container text-1 rounded-lg border border-default overflow-hidden font-sans"
      style={{ height: paneHeight, minHeight: 560 }}
    >
      {/* ====== 顶栏 ====== */}
      <TopBar
        activeView={activeTab}
        onViewChange={handleViewChange}
        onReset={resetParams}
        onCopy={copyToClipboard}
        onExportCSV={handleExportCSV}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* ====== 保存弹窗 ====== */}
      <SaveConfigModal
        show={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        saveName={saveName}
        onSaveNameChange={setSaveName}
        onSave={saveCurrentConfig}
      />

      {/* ====== 主体三栏布局 ====== */}
      <div className="flex flex-1 overflow-hidden">
        {/* ---- 左栏: 参数面板 ---- */}
        <div className="w-96 shrink-0 surface-container border-r border-default overflow-y-auto p-4 flex flex-col gap-4">
          <ParameterPanel
            params={params}
            handleChange={handleChange}
            handleTireChange={handleTireChange}
            hasWheelConflict={hasWheelConflict}
            ratioInfo={ratioInfo}
            isRearOverhangTooShort={isRearOverhangTooShort}
            lastEditedKey={lastEditedKey}
          />
        </div>

        {/* ---- 中栏: 画布 ---- */}
        <div className="flex-1 min-w-0 surface-inset p-4 flex flex-col relative" ref={containerRef}>
          {/* 图纸保持浅色底：SVG 视图的线条/标注配色按白底设计 */}
          <div className="flex-1 bg-white rounded-lg border border-default overflow-hidden relative">
            {/* 三个视图常驻挂载，用 CSS display 切换 —— 避免 2D SVG 重建与 3D WebGL 卸载 */}
            <div style={{ display: activeTab === 'side' ? 'block' : 'none', width: '100%', height: '100%' }}>
              <SideView params={params} showDimensions={showDimensions} viewDimensions={viewDimensions} groundY={groundY} selectedSlots={selectedSlots} />
            </div>
            <div style={{ display: activeTab === 'front' ? 'block' : 'none', width: '100%', height: '100%' }}>
              <FrontView params={params} showDimensions={showDimensions} viewDimensions={viewDimensions} groundY={groundY} selectedSlots={selectedSlots} />
            </div>
            <div style={{ display: activeTab === '3d' ? 'block' : 'none', width: '100%', height: '100%' }}>
              {hasVisited3D && (
                <Suspense fallback={
                  <div className="w-full h-full flex items-center justify-center surface-inset text-3 text-sm">
                    正在加载 3D 预览...
                  </div>
                }>
                  <Vehicle3D params={params3D} selectedSlots={selectedSlots} />
                </Suspense>
              )}
            </div>

            <div className="absolute bottom-2 right-4 text-[10px] text-gray-300 font-mono pointer-events-none select-none">
              Design By 计皓琛 2025.12
            </div>
          </div>
        </div>

        {/* ---- 右栏: ResultPanel ---- */}
        <ResultPanel
          params={params}
          ratioInfo={ratioInfo}
          hasWheelConflict={hasWheelConflict}
          isRearOverhangTooShort={isRearOverhangTooShort}
        />
      </div>

      {/* ====== 底栏 ====== */}
      <BottomBar
        savedConfigs={savedConfigs}
        selectedSlots={selectedSlots}
        onLoadConfig={handleRestoreConfig}
        onToggleOverlay={toggleSlot}
        onDeleteConfig={deleteConfig}
        onSaveCurrent={() => setShowSaveModal(true)}
        importText={importText}
        onImportTextChange={handleImportTextChange}
        onParseImport={handleParseImport}
        getSlotIndex={getSlotIndex}
        parseErrors={parseErrors}
      />
    </div>
  );
};

export default VehicleDesigner;