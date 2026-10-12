import { VehicleSVGContent } from './SideView';
import type { VehicleParams } from '../types';

/**
 * FrontView — 原样提取自原 L4VehicleConfigurator.jsx 前视渲染逻辑
 * 零改动：仅将闭包变量转为 props，补全 arrowhead def（原文件侧视和前视共用同一 def 但分属不同 SVG）
 *
 * Sprint 4: 新增 selectedSlots 叠加渲染支持（虚线 + 槽位配色）
 */
const FrontView = ({ params, viewDimensions, groundY, selectedSlots = [] }: { params: VehicleParams; showDimensions: boolean; viewDimensions: { width: number; height: number }; groundY: number; selectedSlots?: Array<{ id: number; params: VehicleParams }> }) => {
  // Sprint 4: 叠加渲染 selectedSlots 中的配置
  const slotOverlays = selectedSlots.map((slot, idx) => (
    <VehicleSVGContent
      key={slot.id}
      p={slot.params}
      isGhost={false}
      slotIndex={idx + 1}
      viewType="front"
      viewDimensions={viewDimensions}
      groundY={groundY}
    />
  ));

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${viewDimensions.width} ${viewDimensions.height}`} className="bg-white">
      <defs>
        <pattern id="grid2" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
        </pattern>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid2)" />
      <line x1="0" y1={groundY} x2={viewDimensions.width} y2={groundY} stroke="#333" strokeWidth="2" />
      <text x="20" y="30" className="text-sm font-bold fill-gray-400">FRONT VIEW</text>

      {/* Sprint 4: 叠加层在先，当前编辑层在后 */}
      {slotOverlays}
      <VehicleSVGContent p={params} isGhost={false} slotIndex={0} viewType="front" viewDimensions={viewDimensions} groundY={groundY} />

      {/* Axis indicator */}
      <g transform={`translate(40, ${viewDimensions.height - 40})`}>
        <line x1="0" y1="0" x2="0" y2={-30} stroke="#000" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <text x="-5" y={-35} className="text-xs font-bold">Z</text>
        <line x1="0" y1="0" x2={30} y2="0" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrowhead)" />
        <text x={35} y="5" className="text-xs font-bold fill-green-600">Y</text>
        <circle cx="0" cy="0" r="2" fill="black" />
      </g>
    </svg>
  );
};

export default FrontView;