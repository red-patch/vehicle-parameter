import { useState, type ReactNode } from 'react';
import { Collapse } from 'antd';

interface SectionProps {
  title: string;
  defaultExpanded?: boolean;
  valueSummary?: string;
  icon?: ReactNode;
  children: ReactNode;
}

const Section = ({ title, defaultExpanded = false, valueSummary, icon, children }: SectionProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <Collapse
      ghost
      activeKey={expanded ? ['1'] : []}
      onChange={() => setExpanded(!expanded)}
      items={[{
        key: '1',
        label: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            {icon}
            <span>{title}</span>
            {!expanded && valueSummary && (
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{valueSummary}</span>
            )}
          </span>
        ),
        children,
      }]}
    />
  );
};

export default Section;