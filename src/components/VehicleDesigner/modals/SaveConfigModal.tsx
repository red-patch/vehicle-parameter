import { Input, Modal } from 'antd';

interface SaveConfigModalProps {
  show: boolean;
  onClose: () => void;
  saveName: string;
  onSaveNameChange: (v: string) => void;
  onSave: () => void;
}

const SaveConfigModal = ({
  show,
  onClose,
  saveName,
  onSaveNameChange,
  onSave,
}: SaveConfigModalProps) => (
  <Modal
    title="保存当前参数"
    open={show}
    onOk={onSave}
    onCancel={onClose}
    okText="保存"
    cancelText="取消"
  >
    <Input
      placeholder="输入配置名称（可选）"
      value={saveName}
      onChange={(e) => onSaveNameChange(e.target.value)}
      onPressEnter={onSave}
      autoFocus
    />
  </Modal>
);

export default SaveConfigModal;