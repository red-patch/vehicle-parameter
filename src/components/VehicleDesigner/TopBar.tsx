import { Button, Dropdown, Popconfirm, Segmented, Tooltip } from 'antd';
import {
  CopyOutlined,
  DownOutlined,
  DownloadOutlined,
  FileTextOutlined,
  RedoOutlined,
  ReloadOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { formatShortcut } from '../../constants/shortcuts';

interface TopBarProps {
  activeView: string;
  onViewChange: (v: string) => void;
  onReset: () => void;
  onCopy: () => void;
  onExportCSV: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const VIEW_OPTIONS = [
  { label: '侧视', value: 'side' },
  { label: '前视', value: 'front' },
  { label: '3D', value: '3d' },
];

/** 工具条走表面变量：此前写死深蓝底 + ghost 按钮，亮色主题下与全应用割裂 */
const barStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  borderBottom: '1px solid var(--border-default)',
  padding: '8px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
};

const TopBar = ({
  activeView,
  onViewChange,
  onReset,
  onCopy,
  onExportCSV,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: TopBarProps) => {
  const handleExportClick = ({ key }: { key: string }) => {
    if (key === 'copy') onCopy();
    else if (key === 'csv') onExportCSV();
  };

  return (
    <div style={barStyle}>
      {/* Left: Brand */}
      <span style={{ color: 'var(--text-1)', fontSize: 'var(--fs-title)', fontWeight: 600 }}>
        整车设计
      </span>

      {/* Center: View segmented control */}
      <Segmented
        value={activeView}
        onChange={(v) => onViewChange(v as string)}
        options={VIEW_OPTIONS.map((o, i) => ({ ...o, label: <Tooltip title={`快捷键 ${i + 1}`}>{o.label}</Tooltip> }))}
      />

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Tooltip title={`撤销（${formatShortcut('mod+z')}）`}>
          <Button icon={<UndoOutlined />} onClick={onUndo} disabled={!canUndo}>
            撤销
          </Button>
        </Tooltip>
        <Tooltip title={`重做（${formatShortcut('mod+shift+z')}）`}>
          <Button icon={<RedoOutlined />} onClick={onRedo} disabled={!canRedo}>
            重做
          </Button>
        </Tooltip>

        <Popconfirm
          title="确认重置所有参数？"
          description="所有参数将恢复为默认值。"
          onConfirm={onReset}
          okText="确认重置"
          cancelText="取消"
        >
          <Button danger icon={<ReloadOutlined />}>
            重置
          </Button>
        </Popconfirm>

        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: [
              { key: 'copy', icon: <CopyOutlined />, label: '复制格式化参数' },
              { key: 'csv', icon: <FileTextOutlined />, label: '导出 CSV' },
              { key: 'pdf', icon: <DownloadOutlined />, label: '导出 PDF', disabled: true },
            ],
            onClick: handleExportClick,
          }}
        >
          <Button icon={<DownloadOutlined />}>
            导出 <DownOutlined style={{ fontSize: 10 }} />
          </Button>
        </Dropdown>
      </div>
    </div>
  );
};

export default TopBar;