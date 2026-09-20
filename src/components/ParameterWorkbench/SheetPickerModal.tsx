import React, { useState } from 'react';
import { Modal, Checkbox, Button, Space } from 'antd';

interface SheetInfo {
  name: string;
  totalRows: number;
}

interface Props {
  open: boolean;
  sheets: SheetInfo[];
  onConfirm: (disabledSheets: Set<string>) => void;
  onSkip: () => void;
  onCancel: () => void;
}

const SheetPickerModal: React.FC<Props> = ({ open, sheets, onConfirm, onSkip, onCancel }) => {
  const [disabledSheets, setDisabledSheets] = useState<Set<string>>(new Set());

  const enabledCount = sheets.length - disabledSheets.size;

  const toggleSheet = (name: string, checked: boolean) => {
    setDisabledSheets(prev => {
      const next = new Set(prev);
      if (checked) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const selectAll = () => setDisabledSheets(new Set());
  const deselectAll = () => setDisabledSheets(new Set(sheets.map(s => s.name)));

  return (
    <Modal
      open={open}
      title="选择要导入的 Sheet"
      width={480}
      onCancel={onCancel}
      footer={[
        <Button key="skip" onClick={onSkip}>跳过，查看全部</Button>,
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button
          key="confirm"
          type="primary"
          disabled={enabledCount === 0}
          onClick={() => onConfirm(disabledSheets)}
        >
          确认（{enabledCount} 个 Sheet）
        </Button>,
      ]}
    >
      <div style={{ marginBottom: 12 }}>
        <Space>
          <Button size="small" onClick={selectAll}>全选</Button>
          <Button size="small" onClick={deselectAll}>全不选</Button>
        </Space>
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {sheets.map(sheet => (
          <div
            key={sheet.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 4px',
              borderBottom: '1px solid var(--border-default)',
            }}
          >
            <Checkbox
              checked={!disabledSheets.has(sheet.name)}
              onChange={e => toggleSheet(sheet.name, e.target.checked)}
            >
              {sheet.name}
            </Checkbox>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>共 {sheet.totalRows} 行（含表头）</span>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default SheetPickerModal;
