import { memo, useState, useEffect } from 'react';
import { InputNumber, Slider, Typography } from 'antd';

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

/**
 * 颜色全部走语义变量（随明暗翻转）：此前写死浅色底（#eff6ff / #fff），
 * 暗色下 antd 文字变浅、底色不变，标签直接「隐身」。
 * 标题行允许换行（flex-wrap），单位 nowrap：双列窄卡里不再出现「m / m」被拆成两行。
 */
const InputGroup = memo(({ label, value, unit = 'mm', min, max, step = 1, onChange, alert, highlight }: InputGroupProps) => {
  const [localValue, setLocalValue] = useState<number | null>(Math.round(value));

  useEffect(() => { setLocalValue(Math.round(value)); }, [value]);

  return (
    <div
      style={{
        padding: 8, borderRadius: 8, marginBottom: 8, border: '1px solid',
        borderColor: alert ? 'var(--danger)' : highlight ? 'var(--brand-border)' : 'var(--border-default)',
        background: alert ? 'var(--danger-weak)' : highlight ? 'var(--brand-weak)' : 'var(--surface-2)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 4 }}>
        <Typography.Text type={alert ? 'danger' : highlight ? undefined : 'secondary'} style={{ fontSize: 12, fontWeight: 500 }}>
          {label}
        </Typography.Text>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', marginLeft: 'auto' }}>
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
        </span>
      </div>
      <Slider min={min} max={max} step={step} value={value} onChange={(v) => onChange(v)} />
    </div>
  );
});

InputGroup.displayName = 'InputGroup';
export default InputGroup;
