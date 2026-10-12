import { Button, Dropdown, Popconfirm, Segmented } from 'antd';
import {
  CopyOutlined,
  DownOutlined,
  DownloadOutlined,
  FileTextOutlined,
  RedoOutlined,
  ReloadOutlined,
  UndoOutlined,
} from '@ant-design/icons';

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

const barStyle: React.CSSProperties = {
  background: '#0f172a',
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
      <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
        整车设计
      </span>

      {/* Center: View segmented control */}
      <Segmented
        value={activeView}
        onChange={(v) => onViewChange(v as string)}
        options={VIEW_OPTIONS}
      />

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button
          ghost
          icon={<UndoOutlined />}
          onClick={onUndo}
          disabled={!canUndo}
          title="撤销 (⌘Z)"
        >
          撤销
        </Button>
        <Button
          ghost
          icon={<RedoOutlined />}
          onClick={onRedo}
          disabled={!canRedo}
          title="重做 (⌘⇧Z)"
        >
          重做
        </Button>

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