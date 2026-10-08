import React from 'react';
import { Alert, Button, Space } from 'antd';

interface AnnouncementPickupPromptProps {
    visible: boolean;
    onPick: () => void;
    onDismiss: () => void;
}

/**
 * 粘贴导入成功后的 PDF 拾取提示（设计文档 §4.1，Q10 裁定）：
 * 参数与 PDF 是两个独立动作，这条提示只负责「别把刚下载的 PDF 忘在 Downloads 里」。
 */
const AnnouncementPickupPrompt: React.FC<AnnouncementPickupPromptProps> = ({ visible, onPick, onDismiss }) => {
    if (!visible) return null;
    return (
        <Alert
            type="info"
            showIcon
            closable
            onClose={onDismiss}
            message="刚在浏览器下载了公告 PDF？"
            description="可以把刚下载的 PDF 归档到公告中心，与解析出的参数绑定到同一条公告记录。"
            action={
                <Space direction="vertical">
                    <Button size="small" type="primary" onClick={onPick}>
                        选择并归档 PDF
                    </Button>
                    <Button size="small" onClick={onDismiss}>
                        暂不归档
                    </Button>
                </Space>
            }
        />
    );
};

export default AnnouncementPickupPrompt;
