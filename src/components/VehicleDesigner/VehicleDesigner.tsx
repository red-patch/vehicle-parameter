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

// Lazy loaded 3D
const Vehicle3D = lazy(() => import('./Vehicle3D'));

type View = 'side' | 'front' | '3d';

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
const VehicleDesigner = () => {
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
  const groundY = viewDimensions.height * 0.85;

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

  // --- 键盘快捷键: 视图切换 1/2/3 + 撤销/重做 ---
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // 输入框/textarea/select 聚焦时不劫持按键
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // 快捷键 1/2/3 切换侧视/前视/3D
    if (e.key === '1') { setActiveTab('side'); e.preventDefault(); return; }
    if (e.key === '2') { setActiveTab('front'); e.preventDefault(); return; }
    if (e.key === '3') { setHasVisited3D(true); setActiveTab('3d'); e.preventDefault(); return; }

    const isMod = e.metaKey || e.ctrlKey;
    if (isMod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if (isMod && e.key.toLowerCase() === 'z' && e.shiftKey) {
      e.preventDefault();
      redo();
    }
  }, [undo, redo]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // --- 渲染 ---
  return (
    <div className="flex flex-col h-screen bg-white text-slate-800 font-sans">
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
        <div className="w-96 bg-slate-50 border-r border-slate-200 overflow-y-auto p-4 flex flex-col gap-4">
          <ParameterPanel
            params={params}
            handleChange={handleChange}
            handleTireChange={handleTireChange}
            hasWheelConflict={hasWheelConflict}
            ratioInfo={ratioInfo}
            isRearOverhangTooShort={isRearOverhangTooShort}
            lastEditedKey={lastEditedKey}
          />

          {/* 底部版权 */}
          <div className="pt-4 mt-auto text-center border-t border-gray-100">
            <div className="text-[10px] text-gray-400 font-mono flex items-center justify-center gap-1">
              <span>Design By 计皓琛 2025.12</span>
            </div>
          </div>
        </div>

        {/* ---- 中栏: 画布 ---- */}
        <div className="flex-1 bg-gray-100 p-6 flex flex-col relative" ref={containerRef}>
          <div className="flex-1 bg-white shadow-lg rounded-xl overflow-hidden relative">
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
                  <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-500 text-sm">
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