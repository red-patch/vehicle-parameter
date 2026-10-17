import type { ReactNode } from 'react';
import { Typography, Alert } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import type { VehicleParams } from './types';
import type { RatioStatus } from './useVehicleParams';

interface ResultPanelProps {
  params: VehicleParams;
  ratioInfo: { ratio: string; status: RatioStatus; msg: string };
  hasWheelConflict: boolean;
  isRearOverhangTooShort: boolean;
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

/** 语义色只上文字 / 线 / 点（设计系统「色彩是信号不是填充」）；中性卡一律同一表面 */
const TONE_TEXT: Record<Tone, string> = {
  neutral: 'var(--text-3)',
  success: 'var(--success-text)',
  warning: 'var(--warning-text)',
  danger: 'var(--danger-text)',
};
const TONE_EDGE: Record<Tone, string> = {
  neutral: 'var(--border-default)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  tone?: Tone;
  /** 主指标：数值放大一档 */
  emphasis?: boolean;
}

/**
 * 结果卡：同一骨架（标签 → 数值+单位 → 注记），只有状态卡带左侧色条。
 * 此前 6 张卡各用一套写死的浅色描边/底色（蓝/紫/橙/绿），暗色下不翻转，
 * 且颜色不承载含义（「实际总长」是紫色并不表示任何状态）。
 */
const StatCard = ({ label, value, unit, note, tone = 'neutral', emphasis }: StatCardProps) => (
  <div
    style={{
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid var(--border-default)',
      borderLeft: tone === 'neutral' ? '1px solid var(--border-default)' : `3px solid ${TONE_EDGE[tone]}`,
      background: 'var(--surface-2)',
    }}
  >
    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{label}</Typography.Text>
    <div
      className="tabular-nums"
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: emphasis ? 20 : 14,
        fontWeight: emphasis ? 700 : 500,
        color: tone === 'danger' ? 'var(--danger-text)' : 'var(--text-1)',
        marginTop: 2,
      }}
    >
      {value}
      {unit && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 4 }}>{unit}</span>}
    </div>
    {note && (
      <div style={{ fontSize: 11, marginTop: 2, color: TONE_TEXT[tone] }}>{note}</div>
    )}
  </div>
);

const ResultPanel = ({ params, ratioInfo, hasWheelConflict, isRearOverhangTooShort }: ResultPanelProps) => {
  const dims = (l: number, w: number, h: number) => `${Math.round(l)} × ${Math.round(w)} × ${Math.round(h)}`;
  return (
    <div
      className="surface-container border-l border-default"
      style={{ width: 288, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', padding: 12 }}
    >
      <Typography.Title level={5} style={{ margin: 0 }}>
        <InfoCircleOutlined style={{ marginRight: 8 }} />
        计算结果摘要
      </Typography.Title>

      {hasWheelConflict && <Alert type="error" showIcon message="轮包干涉！请提升货台高度。" />}

      <StatCard label="内空体积" value={params.innerCargoVolume} unit="m³" emphasis />
      <StatCard
        label="货厢内空（长 × 宽 × 高）"
        value={dims(params.innerCargoLength, params.innerCargoWidth, params.innerCargoHeight)}
        unit="mm"
      />
      <StatCard
        label="货厢外廓（长 × 宽 × 高）"
        value={dims(params.cargoLength, params.cargoWidth, params.cargoHeight)}
        unit="mm"
      />
      <StatCard
        label="实际总长"
        value={Math.round(params.actualOverallLength)}
        unit="mm"
        note={params.actualOverallLength > params.chassisLength ? '货厢超出底盘' : '底盘包络货厢'}
      />
      <StatCard
        label="后悬长度"
        value={Math.round(params.chassisOverhangRear)}
        unit="mm"
        tone={isRearOverhangTooShort ? 'danger' : 'neutral'}
        note={isRearOverhangTooShort ? '后悬过短（< 300mm）' : undefined}
      />
      <StatCard
        label="轴轮比"
        value={ratioInfo.ratio}
        tone={ratioInfo.status === 'warning' ? 'warning' : 'success'}
        note={ratioInfo.msg}
      />
    </div>
  );
};

export default ResultPanel;
