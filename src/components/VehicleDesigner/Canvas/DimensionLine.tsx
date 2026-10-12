/**
 * DimensionLine — 原样提取自原 L4VehicleConfigurator.jsx L463-L484
 * 仅增加 showDimensions prop（原为闭包变量）
 */
interface DimensionLineProps {
  x1: number; y1: number; x2: number; y2: number;
  text?: string; offset?: number; vertical?: boolean;
  color?: string; isOverall?: boolean; showDimensions?: boolean;
}

const DimensionLine = ({ x1, y1, x2, y2, text, offset = 20, vertical = false, color = "gray-400", isOverall = false, showDimensions = true }: DimensionLineProps) => {
  if (!showDimensions || isNaN(x1) || isNaN(x2) || isNaN(y1) || isNaN(y2)) return null;
  const nx = vertical ? offset : 0;
  const ny = vertical ? 0 : offset;
  const midX = (x1 + x2) / 2 + nx;
  const midY = (y1 + y2) / 2 + ny;
  const strokeW = isOverall ? "2" : "1";
  const finalColor = isOverall ? "#2563eb" : "currentColor";
  const textLen = (text || "").length * 7;

  return (
    <g className={`text-xs ${isOverall ? '' : `fill-${color} stroke-${color}`}`} style={isOverall ? { stroke: '#2563eb', fill: '#2563eb' } : {}}>
      <line x1={x1} y1={y1} x2={x1 + nx} y2={y1 + ny} strokeWidth="0.5" strokeDasharray="2,2" opacity="0.3" />
      <line x1={x2} y1={y2} x2={x2 + nx} y2={y2 + ny} strokeWidth="0.5" strokeDasharray="2,2" opacity="0.3" />
      <line x1={x1 + nx} y1={y1 + ny} x2={x2 + nx} y2={y2 + ny} strokeWidth={strokeW} />
      <path d={`M ${x1 + nx} ${y1 + ny} l ${vertical ? -2 : -3} ${vertical ? -3 : 2} l ${vertical ? 4 : 0} ${vertical ? 0 : -4} z`} fill={finalColor} />
      <path d={`M ${x2 + nx} ${y2 + ny} l ${vertical ? -2 : 3} ${vertical ? 3 : -2} l ${vertical ? 4 : 0} ${vertical ? 0 : 4} z`} fill={finalColor} />
      <rect x={midX - textLen / 2} y={midY - 9} width={textLen} height="16" fill="white" stroke="none" opacity="0.9" rx="2" />
      <text x={midX} y={midY + 4} textAnchor="middle" stroke="none" className={`font-mono ${isOverall ? 'font-bold' : ''}`}>{text}</text>
    </g>
  );
};

export default DimensionLine;