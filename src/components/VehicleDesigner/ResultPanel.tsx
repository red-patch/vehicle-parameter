import { Card, Typography, Alert } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import type { VehicleParams } from './types';
import type { RatioStatus } from './useVehicleParams';

interface ResultPanelProps {
  params: VehicleParams;
  ratioInfo: { ratio: string; status: RatioStatus; msg: string };
  hasWheelConflict: boolean;
  isRearOverhangTooShort: boolean;
}

const cardGap = 12;
const cardBodyStyle: React.CSSProperties = { padding: 12 };

const ResultPanel = ({ params, ratioInfo, hasWheelConflict, isRearOverhangTooShort }: ResultPanelProps) => {
  return (
    <div style={{ width: 288, display: 'flex', flexDirection: 'column', gap: cardGap, overflowY: 'auto', padding: 4 }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        <InfoCircleOutlined style={{ marginRight: 8 }} />
        计算结果摘要
      </Typography.Title>

      {/* 货厢内空 */}
      <Card size="small" style={{ borderColor: '#e0f2fe' }} styles={{ body: cardBodyStyle }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          货厢内空
        </Typography.Text>
        <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#0c4a6e', marginTop: 4 }}>
          {Math.round(params.innerCargoLength)} × {Math.round(params.innerCargoWidth)} × {Math.round(params.innerCargoHeight)}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 10 }}>(长 × 宽 × 高) mm</Typography.Text>
      </Card>

      {/* 内空体积 */}
      <Card size="small" style={{ borderColor: '#bfdbfe' }} styles={{ body: cardBodyStyle }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          内空体积
        </Typography.Text>
        <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#1e40af', marginTop: 4 }}>
          {params.innerCargoVolume} <span style={{ fontSize: 14, fontWeight: 400 }}>m³</span>
        </div>
      </Card>

      {/* 实际总长 */}
      <Card size="small" style={{ borderColor: '#e9d5ff' }} styles={{ body: cardBodyStyle }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          实际总长
        </Typography.Text>
        <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#581c87', marginTop: 4 }}>
          {Math.round(params.actualOverallLength)} <span style={{ fontSize: 10 }}>mm</span>
        </div>
        <Typography.Text style={{ fontSize: 10, color: '#7e22ce', display: 'block', marginTop: 2 }}>
          {params.actualOverallLength > params.chassisLength ? '货厢超出底盘' : '底盘包络货厢'}
        </Typography.Text>
      </Card>

      {/* 后悬长度 */}
      <Card size="small" style={{ borderColor: '#fed7aa' }} styles={{ body: cardBodyStyle }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          后悬长度
        </Typography.Text>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 13,
            marginTop: 4,
            color: isRearOverhangTooShort ? '#dc2626' : '#c2410c',
            fontWeight: isRearOverhangTooShort ? 700 : 400,
          }}
        >
          {Math.round(params.chassisOverhangRear)} <span style={{ fontSize: 10, fontWeight: 400 }}>mm</span>
        </div>
        {isRearOverhangTooShort && (
          <Typography.Text style={{ fontSize: 10, color: '#ef4444', display: 'block', marginTop: 2, fontWeight: 500 }}>
            ⚠ 后悬过短(&lt;300mm)
          </Typography.Text>
        )}
      </Card>

      {/* 轴轮比 */}
      <Card
        size="small"
        style={{ borderColor: ratioInfo.status === 'warning' ? '#fde047' : '#bbf7d0' }}
        styles={{
          body: { padding: 12, backgroundColor: ratioInfo.status === 'warning' ? '#fefce8' : '#f0fdf4' },
        }}
      >
        <Typography.Text style={{ fontSize: 12, color: ratioInfo.status === 'warning' ? '#854d0e' : '#166534' }}>
          轴轮比
        </Typography.Text>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 13,
            marginTop: 4,
            color: ratioInfo.status === 'warning' ? '#854d0e' : '#166534',
          }}
        >
          {ratioInfo.ratio}
        </div>
        <Typography.Text
          style={{ fontSize: 10, display: 'block', marginTop: 2, color: ratioInfo.status === 'warning' ? '#a16207' : '#15803d' }}
        >
          {ratioInfo.msg}
        </Typography.Text>
      </Card>

      {/* 货厢外廓 */}
      <Card size="small" style={{ borderColor: '#e2e8f0' }} styles={{ body: cardBodyStyle }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          货厢外廓
        </Typography.Text>
        <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#1e293b', marginTop: 4 }}>
          {Math.round(params.cargoLength)} × {Math.round(params.cargoWidth)} × {Math.round(params.cargoHeight)}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 10 }}>(长 × 宽 × 高) mm</Typography.Text>
      </Card>

      {hasWheelConflict && <Alert type="error" showIcon message="轮包干涉！请提升货台高度。" />}

      <div style={{ textAlign: 'center', fontSize: 10, color: '#9ca3af', fontFamily: 'monospace', marginTop: 'auto' }}>
        Design By 计皓琛 2025.12
      </div>
    </div>
  );
};

export default ResultPanel;