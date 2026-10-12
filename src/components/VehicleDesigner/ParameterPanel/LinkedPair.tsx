import { Tooltip } from 'antd';
import InputGroup from './InputGroup';

interface LinkedPairProps {
  primaryLabel: string;
  primaryKey: string;
  primaryValue: number;
  secondaryLabel: string;
  secondaryKey: string;
  secondaryValue: number;
  onChange: (key: string, value: number) => void;
  lastEditedKey: string;
  overhangKey: string;
  overhangValue: number;
}

const LinkedPair = ({ primaryLabel, primaryKey, primaryValue, secondaryLabel, secondaryKey, secondaryValue, onChange, lastEditedKey, overhangValue }: LinkedPairProps) => {
  const isPrimaryMaster = lastEditedKey === primaryKey;
  const isSecondaryMaster = lastEditedKey === secondaryKey;
  const primaryTooltip = isPrimaryMaster ? `${primaryLabel} 为主参数（最后编辑）` : `推导公式: atan(${secondaryLabel} / ${overhangValue}mm)`;
  const secondaryTooltip = isSecondaryMaster ? `${secondaryLabel} 为主参数（最后编辑）` : `推导公式: ${overhangValue}mm × tan(${primaryLabel})`;

  const badge = (isMaster: boolean) => (
    <span style={{ fontSize: 9, fontWeight: 700, color: isMaster ? '#2563eb' : '#f97316', background: isMaster ? '#dbeafe' : '#ffedd5', padding: '0 4px', borderRadius: 4, marginRight: 4 }}>
      {isMaster ? '主' : '从'}
    </span>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <Tooltip title={primaryTooltip}>
        <div style={{ opacity: isPrimaryMaster ? 1 : 0.6 }}>
          {badge(isPrimaryMaster)}
          <InputGroup label={primaryLabel} value={primaryValue} unit="°" min={10} max={60} step={0.1} onChange={(v) => onChange(primaryKey, v)} highlight />
        </div>
      </Tooltip>
      <Tooltip title={secondaryTooltip}>
        <div style={{ opacity: isSecondaryMaster ? 1 : 0.6 }}>
          {badge(isSecondaryMaster)}
          <InputGroup label={secondaryLabel} value={secondaryValue} unit="mm" min={100} max={1000} onChange={(v) => onChange(secondaryKey, v)} />
        </div>
      </Tooltip>
    </div>
  );
};

export default LinkedPair;