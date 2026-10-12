import { useState } from 'react';
import { Button, Checkbox, Dropdown, Popconfirm } from 'antd';
import {
  DeleteOutlined,
  FileTextOutlined,
  MoreOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import ImportText from './modals/ImportText';
import type { VehicleParams } from './types';

interface SavedConfigItem {
  id: number;
  name: string;
  timestamp: string;
  params: VehicleParams;
}

interface BottomBarProps {
  savedConfigs: SavedConfigItem[];
  selectedSlots: SavedConfigItem[];
  onLoadConfig: (config: SavedConfigItem) => void;
  onToggleOverlay: (config: SavedConfigItem) => void;
  onDeleteConfig: (id: number) => void;
  onSaveCurrent: () => void;
  importText: string;
  onImportTextChange: (v: string) => void;
  onParseImport: () => void;
  getSlotIndex: (configId: number) => number;
  parseErrors?: Set<number>;
  maxSlots?: number;
}

const EMPTY_PARSE_ERRORS = new Set<number>();

const BottomBar = ({
  savedConfigs,
  selectedSlots,
  onLoadConfig,
  onToggleOverlay,
  onDeleteConfig,
  onSaveCurrent,
  importText,
  onImportTextChange,
  onParseImport,
  getSlotIndex,
  parseErrors = EMPTY_PARSE_ERRORS,
  maxSlots = 4,
}: BottomBarProps) => {
  const [showImport, setShowImport] = useState(false);

  const timeLabel = (timestamp: string) =>
    new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      style={{
        background: '#0f172a',
        borderTop: '1px solid #334155',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}
    >
      {/* Left: Save current */}
      <Button type="primary" size="small" icon={<PlusOutlined />} onClick={onSaveCurrent}>
        保存当前
      </Button>

      <div style={{ width: 1, height: 24, background: '#334155', flexShrink: 0 }} />

      {/* Slot items */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflowX: 'auto',
          minWidth: 0,
        }}
      >
        {savedConfigs.length === 0 ? (
          <span
            style={{
              fontSize: 10,
              color: '#64748b',
              fontStyle: 'italic',
              padding: '0 8px',
              whiteSpace: 'nowrap',
            }}
          >
            暂无保存的配置
          </span>
        ) : (
          savedConfigs.map((config) => {
            const slotIdx = getSlotIndex(config.id);
            const isOverlay = slotIdx > 0;
            const isFull = !isOverlay && selectedSlots.length >= maxSlots;

            return (
              <div
                key={config.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: '#1e293b',
                  borderRadius: 6,
                  border: '1px solid #334155',
                  padding: '2px 8px',
                  minWidth: 0,
                  maxWidth: 190,
                }}
              >
                {/* Load (click name with confirmation) */}
                <Popconfirm
                  title="加载配置?"
                  description={config.name}
                  onConfirm={() => onLoadConfig(config)}
                  okText="确认加载"
                  cancelText="取消"
                >
                  <Button
                    type="text"
                    size="small"
                    style={{ color: '#cbd5e1', padding: 0, minWidth: 0 }}
                    title={`加载配置: ${config.name}`}
                  >
                    <span style={{ fontSize: 10, color: '#94a3b8', marginRight: 4 }}>
                      {timeLabel(config.timestamp)}
                    </span>
                    <span
                      style={{
                        display: 'inline-block',
                        maxWidth: 90,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {config.name}
                    </span>
                  </Button>
                </Popconfirm>

                {/* Overlay toggle */}
                <Checkbox
                  checked={isOverlay}
                  disabled={isFull}
                  onChange={() => onToggleOverlay(config)}
                  title={
                    isOverlay
                      ? '取消叠加'
                      : isFull
                        ? `最多叠加 ${maxSlots} 个`
                        : '叠加显示'
                  }
                  style={{ margin: 0 }}
                />

                {/* Delete menu */}
                <Dropdown
                  trigger={['click']}
                  placement="bottomRight"
                  menu={{
                    items: [
                      { key: 'del', icon: <DeleteOutlined />, label: '删除配置', danger: true },
                    ],
                    onClick: () => onDeleteConfig(config.id),
                  }}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<MoreOutlined />}
                    style={{ color: '#94a3b8', padding: 0, minWidth: 0 }}
                  />
                </Dropdown>
              </div>
            );
          })
        )}
      </div>

      <div style={{ width: 1, height: 24, background: '#334155', flexShrink: 0 }} />

      {/* Import toggle */}
      <Button
        size="small"
        icon={<FileTextOutlined />}
        onClick={() => setShowImport(!showImport)}
        style={
          showImport
            ? { color: '#fff', background: '#1d4ed8' }
            : { color: '#94a3b8' }
        }
      >
        文本导入
      </Button>

      {/* Collapsible import area */}
      {showImport && (
        <div style={{ flexShrink: 0, width: 260 }}>
          <ImportText
            importText={importText}
            onImportTextChange={onImportTextChange}
            onParseImport={onParseImport}
            parseErrors={parseErrors}
          />
        </div>
      )}
    </div>
  );
};

export default BottomBar;