import DimensionLine from './DimensionLine';
import type { VehicleParams } from '../types';

const safeVal = (v: number): number => isNaN(v) ? 0 : v;

/**
 * 叠加槽位配色映射 — Sprint 4
 * 最多 4 个槽位，每个槽位分配一个区分色
 * 叠加渲染使用该色作为虚线 stroke，当前编辑仍以实线渲染
 */
const SLOT_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308'];

const getAngleLine = (originX: number, angle: number, isFront: boolean, groundY: number, viewDimensions: { width: number; height: number }): { x2: number; y2: number } => {
  const len = viewDimensions.width * 0.15;
  const rad = (angle || 0) * (Math.PI / 180);
  const dx = len * Math.cos(rad);
  const dy = len * Math.sin(rad);
  return { x2: isFront ? originX + dx : originX - dx, y2: groundY - dy };
};

const AxisIndicator = ({ viewDimensions, view }: { viewDimensions: { width: number; height: number }; view: string }) => {
  const size = 30; const originX = 40; const originY = viewDimensions.height - 40;
  return (
    <g transform={`translate(${originX}, ${originY})`}>
      <line x1="0" y1="0" x2="0" y2={-size} stroke="#000" strokeWidth="2" markerEnd="url(#arrowhead)" />
      <text x="-5" y={-size - 5} className="text-xs font-bold">Z</text>
      {view === 'side' ? (
        <>
          <line x1="0" y1="0" x2={size} y2="0" stroke="#ef4444" strokeWidth="2" markerEnd="url(#arrowhead)" />
          <text x={size + 5} y="5" className="text-xs font-bold fill-red-600">X</text>
        </>
      ) : (
        <>
          <line x1="0" y1="0" x2={size} y2="0" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrowhead)" />
          <text x={size + 5} y="5" className="text-xs font-bold fill-green-600">Y</text>
        </>
      )}
      <circle cx="0" cy="0" r="2" fill="black" />
    </g>
  );
};

const VehicleSVGContent = ({ p, isGhost, viewType, viewDimensions, groundY, slotIndex = 0 }: { p: VehicleParams; isGhost: boolean; viewType: 'side' | 'front'; viewDimensions: { width: number; height: number }; groundY: number; slotIndex?: number }) => {
  const s = (viewDimensions.width * 0.7) / Math.max(4000, p.actualOverallLength);
  const scale = Math.min(Math.max(s, 0.08), 0.2);
  const vizLen = safeVal(p.actualOverallLength) * scale;
  const sX = (viewDimensions.width - vizLen) / 2;
  const rWX = sX + safeVal(p.chassisOverhangRear) * scale;
  const fWX = rWX + safeVal(p.wheelbase) * scale;
  const wY = groundY - safeVal(p.wheelRadius) * scale;
  const pY = groundY - safeVal(p.platformHeight) * scale;
  const cBY = groundY - safeVal(p.chassisGroundClearance) * scale;
  const vFX = fWX + safeVal(p.chassisOverhangFront) * scale;
  const vRX = vFX - safeVal(p.actualOverallLength) * scale;

  const chassisLen = safeVal(p.chassisLength || p.actualOverallLength);
  const chassisRX = vFX - chassisLen * scale;

  const fMRX = vFX - safeVal(p.frontModuleLength) * scale;
  const fMTY = pY - safeVal(p.frontModuleHeight) * scale;

  const cFX = fMRX - safeVal(p.cargoGap) * scale;
  const cRX = cFX - safeVal(p.cargoLength) * scale;
  const cTY = pY - safeVal(p.cargoHeight) * scale;

  // Sprint 4: Overlay rendering (slotIndex > 0) — 叠加层用虚线 + 槽位配色
  const isOverlay = slotIndex > 0;
  const overlayColor = isOverlay ? SLOT_COLORS[(slotIndex - 1) % SLOT_COLORS.length] : undefined;
  const overlayProps = isOverlay ? {
    strokeDasharray: "6,4",
    fill: "none",
    stroke: overlayColor,
    strokeWidth: 2,
    opacity: 0.7,
  } : {};

  const ghostProps = isGhost ? {
    strokeDasharray: "4,4",
    opacity: 0.4,
    stroke: "#94a3b8",
    fill: "none"
  } : {};

  if (viewType === 'side') {
    return (
      <g className={isGhost || isOverlay ? "pointer-events-none" : ""}>
        {!isGhost && !isOverlay && (
          <g stroke="#ef4444" strokeWidth="1" strokeDasharray="4,4">
            <line x1={fWX} y1={groundY} x2={getAngleLine(fWX, p.approachAngle, true, groundY, viewDimensions).x2} y2={getAngleLine(fWX, p.approachAngle, true, groundY, viewDimensions).y2} />
            <line x1={rWX} y1={groundY} x2={getAngleLine(rWX, p.departureAngle, false, groundY, viewDimensions).x2} y2={getAngleLine(rWX, p.departureAngle, false, groundY, viewDimensions).y2} />
          </g>
        )}

        <path
          d={`M ${chassisRX} ${pY} L ${vFX} ${pY} L ${vFX} ${cBY} L ${chassisRX} ${cBY} Z`}
          fill={isOverlay ? "none" : (isGhost ? "none" : "#4b5563")}
          stroke={isOverlay ? overlayColor : (isGhost ? "#94a3b8" : "#374151")}
          strokeWidth="2"
          {...(isOverlay ? overlayProps : ghostProps)}
        />

        <g>
          <rect
            x={cRX} y={cTY}
            width={safeVal(p.cargoLength * scale)} height={safeVal(p.cargoHeight * scale)}
            fill={isOverlay ? "none" : (isGhost ? "none" : "#e0f2fe")}
            stroke={isOverlay ? overlayColor : (isGhost ? "#94a3b8" : "#0ea5e9")}
            strokeWidth="2" rx="2"
            {...(isOverlay ? overlayProps : ghostProps)}
          />
          {!isGhost && !isOverlay && (
            <rect
              x={cRX + safeVal(p.cargoWallThickness * scale)}
              y={cTY + safeVal(p.cargoWallThickness * scale)}
              width={safeVal(p.innerCargoLength * scale)}
              height={safeVal(p.innerCargoHeight * scale)}
              fill="none" stroke="#0ea5e9" strokeWidth="1" strokeDasharray="4,2" opacity="0.6"
            />
          )}
        </g>

        <g>
          <path
            d={`M ${fMRX} ${pY} L ${vFX} ${pY} L ${vFX} ${fMTY + 10} L ${vFX - 10} ${fMTY} L ${fMRX} ${fMTY} Z`}
            fill={isOverlay ? "none" : (isGhost ? "none" : "#ffedd5")}
            stroke={isOverlay ? overlayColor : (isGhost ? "#94a3b8" : "#f97316")}
            strokeWidth="2"
            {...(isOverlay ? overlayProps : ghostProps)}
          />
        </g>

        <circle cx={rWX} cy={wY} r={p.wheelRadius * scale} fill={isOverlay ? "none" : (isGhost ? "none" : "#1f2937")} stroke={isOverlay ? overlayColor : (isGhost ? "#94a3b8" : "white")} strokeWidth="2" {...(isOverlay ? overlayProps : ghostProps)} />
        <circle cx={fWX} cy={wY} r={p.wheelRadius * scale} fill={isOverlay ? "none" : (isGhost ? "none" : "#1f2937")} stroke={isOverlay ? overlayColor : (isGhost ? "#94a3b8" : "white")} strokeWidth="2" {...(isOverlay ? overlayProps : ghostProps)} />

        {!isGhost && !isOverlay && (
          <>
            <DimensionLine x1={cRX} y1={cTY} x2={cFX} y2={cTY} text={`厢长 ${Math.round(p.cargoLength)}`} offset={-30} color="sky-600" showDimensions={true} />
            <DimensionLine x1={fMRX} y1={fMTY} x2={vFX} y2={fMTY} text={`智驾长 ${Math.round(p.frontModuleLength)}`} offset={-30} color="orange-600" showDimensions={true} />
            <DimensionLine x1={rWX} y1={groundY} x2={fWX} y2={groundY} text={`轴距 ${Math.round(p.wheelbase)}`} offset={40} showDimensions={true} />
            <DimensionLine x1={chassisRX} y1={groundY} x2={rWX} y2={groundY} text={`后悬 ${Math.round(p.chassisOverhangRear)}`} offset={40} color={p.chassisOverhangRear < 300 ? "red-600" : "gray-400"} showDimensions={true} />
            <DimensionLine x1={fWX} y1={groundY} x2={vFX} y2={groundY} text={`前悬 ${Math.round(p.chassisOverhangFront)}`} offset={40} showDimensions={true} />

            <text x={fWX + 50} y={groundY - 10} className="text-sm font-bold fill-red-600">α {p.approachAngle}°</text>
            <text x={rWX - 70} y={groundY - 10} className="text-sm font-bold fill-red-600">β {p.departureAngle}°</text>

            <DimensionLine x1={chassisRX} y1={groundY} x2={vFX} y2={groundY} text={`底盘长 ${Math.round(p.chassisLength || p.actualOverallLength)}`} offset={65} color="gray-500" showDimensions={true} />
            <DimensionLine x1={vRX} y1={groundY} x2={vFX} y2={groundY} text={`整车长 ${Math.round(p.actualOverallLength)}`} offset={90} isOverall={true} showDimensions={true} />
            <DimensionLine x1={vRX - 60} y1={groundY} x2={vRX - 60} y2={cTY} text={`整车高 ${Math.round(p.overallHeight)}`} vertical={true} offset={0} isOverall={true} showDimensions={true} />
            <DimensionLine x1={vRX + 60} y1={groundY} x2={vRX + 60} y2={pY} text={`H_deck ${p.platformHeight}`} vertical={true} offset={0} color="gray-600" showDimensions={true} />
            <DimensionLine x1={vFX + 20} y1={groundY} x2={vFX + 20} y2={fMTY} text={`智驾高 ${Math.round(p.sensorTopHeight)}`} vertical={true} offset={0} color="orange-600" showDimensions={true} />
          </>
        )}
      </g>
    );
  } else {
    // Front View
    const center = viewDimensions.width / 2;
    const hT = (p.trackWidth / 2) * scale;
    const hCW = (p.cargoWidth / 2) * scale;
    const fmW = p.frontModuleWidth || p.chassisWidth || p.overallWidth;
    const hMW = (fmW / 2) * scale;
    const wW = 220 * scale;

    const chassisW = p.chassisWidth || p.overallWidth || 1000;
    const hChassisW = (chassisW / 2) * scale;

    return (
      <g className={isGhost || isOverlay ? "pointer-events-none" : ""}>
        <rect x={center - hT - wW / 2} y={groundY - p.wheelRadius * 2 * scale} width={wW} height={p.wheelRadius * 2 * scale} fill={isOverlay ? "none" : (isGhost ? "none" : "#1f2937")} stroke={isOverlay ? overlayColor : (isGhost ? "#94a3b8" : "none")} {...(isOverlay ? overlayProps : ghostProps)} />
        <rect x={center + hT - wW / 2} y={groundY - p.wheelRadius * 2 * scale} width={wW} height={p.wheelRadius * 2 * scale} fill={isOverlay ? "none" : (isGhost ? "none" : "#1f2937")} stroke={isOverlay ? overlayColor : (isGhost ? "#94a3b8" : "none")} {...(isOverlay ? overlayProps : ghostProps)} />

        <rect x={center - hChassisW} y={groundY - (p.chassisHeight || 250) * scale} width={hChassisW * 2} height={15 * scale} fill={isOverlay ? "none" : (isGhost ? "none" : "#4b5563")} stroke={isOverlay ? overlayColor : (isGhost ? "#94a3b8" : "none")} {...(isOverlay ? overlayProps : ghostProps)} />

        <rect x={center - hCW} y={groundY - p.platformHeight * scale - p.cargoHeight * scale} width={hCW * 2} height={p.cargoHeight * scale} fill={isOverlay ? "none" : (isGhost ? "none" : "#e0f2fe")} stroke={isOverlay ? overlayColor : (isGhost ? "#94a3b8" : "#0ea5e9")} strokeWidth="1" strokeDasharray={isOverlay ? "6,4" : (isGhost ? "4,4" : "4,4")} {...(isOverlay ? overlayProps : ghostProps)} />

        <rect x={center - hMW} y={groundY - p.platformHeight * scale - p.frontModuleHeight * scale} width={hMW * 2} height={p.frontModuleHeight * scale} fill={isOverlay ? "none" : (isGhost ? "none" : "#ffedd5")} stroke={isOverlay ? overlayColor : (isGhost ? "#94a3b8" : "#f97316")} strokeWidth="2" {...(isOverlay ? overlayProps : ghostProps)} />

        {!isGhost && !isOverlay && (
          <>
            <DimensionLine x1={center - hT} y1={groundY + 25} x2={center + hT} y2={groundY + 25} text={`轮距 ${Math.round(p.trackWidth)}`} />
            <DimensionLine x1={center - hCW} y1={groundY - p.platformHeight * scale - p.cargoHeight * scale} x2={center + hCW} y2={groundY - p.platformHeight * scale - p.cargoHeight * scale} text={`厢宽 ${Math.round(p.cargoWidth)}`} offset={-30} color="sky-600" />
            <DimensionLine x1={center - Math.max(hT + wW / 2, hCW, hMW)} y1={groundY + 70} x2={center + Math.max(hT + wW / 2, hCW, hMW)} y2={groundY + 70} text={`整车宽 ${Math.round(p.overallWidth)}`} offset={0} isOverall={true} />
          </>
        )}
      </g>
    );
  }
};

const SideView = ({ params, viewDimensions, groundY, selectedSlots = [] }: { params: VehicleParams; showDimensions: boolean; viewDimensions: { width: number; height: number }; groundY: number; selectedSlots?: Array<{ id: number; params: VehicleParams }> }) => {
  // Sprint 4: 叠加渲染 selectedSlots 中的配置
  const slotOverlays = selectedSlots.map((slot, idx) => (
    <VehicleSVGContent
      key={slot.id}
      p={slot.params}
      isGhost={false}
      slotIndex={idx + 1}
      viewType="side"
      viewDimensions={viewDimensions}
      groundY={groundY}
    />
  ));

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${viewDimensions.width} ${viewDimensions.height}`} className="bg-white">
      <defs>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
        </pattern>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      <line x1="0" y1={groundY} x2={viewDimensions.width} y2={groundY} stroke="#333" strokeWidth="2" />
      <text x="20" y="30" className="text-sm font-bold fill-gray-400">SIDE VIEW</text>

      {/* Sprint 4: 叠加层在先，当前编辑层在后（当前层用实线覆盖） */}
      {slotOverlays}
      <VehicleSVGContent p={params} isGhost={false} slotIndex={0} viewType="side" viewDimensions={viewDimensions} groundY={groundY} />

      <AxisIndicator viewDimensions={viewDimensions} view="side" />
    </svg>
  );
};

export default SideView;
// eslint-disable-next-line react-refresh/only-export-components -- 保留既有具名导出：VehicleSVGContent 供 FrontView 复用
export { VehicleSVGContent, safeVal };