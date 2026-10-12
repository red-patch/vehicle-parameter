import { Alert, Input, Typography } from 'antd';
import { ColumnWidthOutlined, ThunderboltOutlined, InboxOutlined } from '@ant-design/icons';
import Section from './Section';
import InputGroup from './InputGroup';
import LinkedPair from './LinkedPair';
import type { VehicleParams } from '../types';
import type { RatioStatus } from '../useVehicleParams';

interface ParameterPanelProps {
  params: VehicleParams;
  handleChange: (key: keyof VehicleParams, value: number) => void;
  handleTireChange: (val: string) => void;
  hasWheelConflict: boolean;
  ratioInfo: { ratio: string; status: RatioStatus; msg: string };
  isRearOverhangTooShort: boolean;
  lastEditedKey: string;
}

const readonlyRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: '#fff',
  padding: 8,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  marginBottom: 8,
};

const ParameterPanel = ({
  params,
  handleChange,
  handleTireChange,
  hasWheelConflict,
  ratioInfo,
  lastEditedKey,
}: ParameterPanelProps) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Section 1: 整车定义 */}
      <Section
        title="1. 整车定义"
        defaultExpanded
        valueSummary={`${Math.round(params.overallLength)}×${Math.round(params.overallWidth)}×${params.overallHeight}`}
        icon={<ColumnWidthOutlined />}
      >
        <InputGroup
          label="底盘长度"
          value={params.chassisLength}
          unit="mm"
          min={3000}
          max={6000}
          step={50}
          highlight
          onChange={(v) => handleChange('chassisLength', v)}
        />
        <div style={readonlyRowStyle}>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
            整车长度(计算)
          </Typography.Text>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: params.overallLength > params.chassisLength ? '#ea580c' : '#1e293b' }}>
            {Math.round(params.overallLength)}mm
          </span>
        </div>
        <div style={readonlyRowStyle}>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
            整车宽度(计算)
          </Typography.Text>
          <span style={{ fontFamily: 'monospace', color: '#1e293b' }}>{Math.round(params.overallWidth)}mm</span>
        </div>
        <InputGroup
          label="整车高度"
          value={params.overallHeight}
          unit="mm"
          min={2000}
          max={3000}
          highlight
          onChange={(v) => handleChange('overallHeight', v)}
        />
      </Section>

      {/* Section 2: 姿态角 */}
      <Section
        title="2. 姿态角"
        defaultExpanded
        valueSummary={`α${params.approachAngle}° β${params.departureAngle}°`}
        icon={<ThunderboltOutlined />}
      >
        <LinkedPair
          primaryLabel="接近角 α"
          primaryKey="approachAngle"
          primaryValue={params.approachAngle}
          secondaryLabel="前最低点高"
          secondaryKey="frontMinGroundClearance"
          secondaryValue={params.frontMinGroundClearance}
          onChange={(k, v) => handleChange(k as keyof VehicleParams, v)}
          lastEditedKey={lastEditedKey}
          overhangKey="chassisOverhangFront"
          overhangValue={Math.round(params.chassisOverhangFront)}
        />
        <LinkedPair
          primaryLabel="离去角 β"
          primaryKey="departureAngle"
          primaryValue={params.departureAngle}
          secondaryLabel="后最低点高"
          secondaryKey="rearMinGroundClearance"
          secondaryValue={params.rearMinGroundClearance}
          onChange={(k, v) => handleChange(k as keyof VehicleParams, v)}
          lastEditedKey={lastEditedKey}
          overhangKey="chassisOverhangRear"
          overhangValue={Math.round(params.chassisOverhangRear)}
        />
      </Section>

      {/* Section 3: 货厢与智驾 */}
      <Section
        title="3. 货厢与智驾"
        defaultExpanded
        valueSummary={`厢${Math.round(params.cargoLength)}×${Math.round(params.cargoWidth)} 智驾${params.frontModuleLength}`}
        icon={<InboxOutlined />}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <InputGroup
            label="货箱长度"
            value={params.cargoLength}
            unit="mm"
            min={2000}
            max={5000}
            highlight
            onChange={(v) => handleChange('cargoLength', v)}
          />
          <InputGroup
            label="货箱宽度"
            value={params.cargoWidth}
            unit="mm"
            min={1400}
            max={2500}
            highlight
            onChange={(v) => handleChange('cargoWidth', v)}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <InputGroup
            label="货箱尾部超出"
            value={params.cargoRearOverhang}
            unit="mm"
            min={0}
            max={1000}
            onChange={(v) => handleChange('cargoRearOverhang', v)}
          />
          <InputGroup
            label="智驾-货箱间隙"
            value={params.cargoGap}
            unit="mm"
            min={0}
            max={200}
            onChange={(v) => handleChange('cargoGap', v)}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <InputGroup
            label="智驾模组长"
            value={params.frontModuleLength}
            unit="mm"
            min={200}
            max={1000}
            onChange={(v) => handleChange('frontModuleLength', v)}
          />
          <InputGroup
            label="智驾顶高"
            value={params.sensorTopHeight}
            unit="mm"
            min={1800}
            max={2500}
            onChange={(v) => handleChange('sensorTopHeight', v)}
          />
        </div>
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>
            <span>轮胎规格</span>
            <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>R={Math.round(params.wheelRadius)}mm</span>
          </div>
          <Input
            value={params.tireSpec}
            onChange={(e) => handleTireChange(e.target.value)}
            placeholder="e.g. 215/75R16"
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>
        {hasWheelConflict && <Alert type="warning" showIcon message="轮包干涉！请提升货台高度。" />}
      </Section>

      {/* Section 4: 底盘配置 */}
      <Section
        title="4. 底盘配置"
        defaultExpanded={false}
        valueSummary={`轴${params.wheelbase} 轮${params.trackWidth} 宽${params.chassisWidth}`}
      >
        {ratioInfo.status === 'warning' ? (
          <Alert
            type="warning"
            showIcon
            message={`轴轮比: ${ratioInfo.ratio}`}
            description={ratioInfo.msg}
            style={{ marginBottom: 8 }}
          />
        ) : (
          <Alert
            type="success"
            showIcon
            message={`轴轮比: ${ratioInfo.ratio}`}
            description={ratioInfo.msg}
            style={{ marginBottom: 8 }}
          />
        )}
        <InputGroup
          label="轮距"
          value={params.trackWidth}
          unit="mm"
          min={1000}
          max={2000}
          highlight
          onChange={(v) => handleChange('trackWidth', v)}
        />
        <InputGroup
          label="底盘宽度"
          value={params.chassisWidth}
          unit="mm"
          min={1000}
          max={2000}
          onChange={(v) => handleChange('chassisWidth', v)}
        />
        <InputGroup
          label="轴距"
          value={params.wheelbase}
          unit="mm"
          min={2000}
          max={3500}
          onChange={(v) => handleChange('wheelbase', v)}
        />
        <InputGroup
          label="前悬"
          value={params.chassisOverhangFront}
          unit="mm"
          min={600}
          max={1500}
          onChange={(v) => handleChange('chassisOverhangFront', v)}
        />
        <InputGroup
          label="底盘离地间隙"
          value={params.chassisGroundClearance}
          unit="mm"
          min={150}
          max={500}
          onChange={(v) => handleChange('chassisGroundClearance', v)}
        />
        <InputGroup
          label="货台离地高度"
          value={params.platformHeight}
          unit="mm"
          min={400}
          max={1000}
          alert={hasWheelConflict}
          onChange={(v) => handleChange('platformHeight', v)}
        />
      </Section>

      {/* Section 5: 货厢壁厚 */}
      <Section title="5. 货厢壁厚" defaultExpanded={false} valueSummary={`${params.cargoWallThickness}mm`}>
        <InputGroup
          label="壁厚"
          value={params.cargoWallThickness}
          unit="mm"
          min={0}
          max={200}
          onChange={(v) => handleChange('cargoWallThickness', v)}
        />
      </Section>
    </div>
  );
};

export default ParameterPanel;