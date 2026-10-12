import { memo, useState, useEffect } from 'react';
import { InputNumber, Slider, Space, Typography } from 'antd';

interface InputGroupProps {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  alert?: boolean;
  highlight?: boolean;
}

const InputGroup = memo(({ label, value, unit = 'mm', min, max, step = 1, onChange, alert, highlight }: InputGroupProps) => {
  const [localValue, setLocalValue] = useState<number | null>(Math.round(value));

  useEffect(() => { setLocalValue(Math.round(value)); }, [value]);

  return (
    <div
      style={{
        padding: 8, borderRadius: 8, marginBottom: 8, border: '1px solid',
        borderColor: alert ? '#fca5a5' : highlight ? '#93c5fd' : '#e2e8f0',
        background: alert ? '#fef2f2' : highlight ? '#eff6ff' : '#fff',
      }}
    >
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
        <Typography.Text type={alert ? 'danger' : highlight ? undefined : 'secondary'} style={{ fontSize: 12, fontWeight: 500 }}>
          {label}
        </Typography.Text>
        <Space.Compact>
          <InputNumber
            size="small" value={localValue} min={min} max={max} step={step}
            onChange={(v) => setLocalValue(v)}
            onBlur={() => {
              const val = localValue == null ? NaN : localValue;
              if (!isNaN(val)) { const clamped = Math.max(min, Math.min(max, val)); onChange(clamped); setLocalValue(Math.round(clamped)); }
              else setLocalValue(Math.round(value));
            }}
            onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
            style={{ width: 64 }}
          />
          <Typography.Text type={alert ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>{unit}</Typography.Text>
        </Space.Compact>
      </Space>
      <Slider min={min} max={max} step={step} value={value} onChange={(v) => onChange(v)} />
    </div>
  );
});

InputGroup.displayName = 'InputGroup';
export default InputGroup;