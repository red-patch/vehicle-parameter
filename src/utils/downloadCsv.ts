import { message } from 'antd';

/**
 * 下载 CSV 文件 - 同时支持 Web 和 Tauri 桌面应用
 * @param content CSV 内容（不需要 BOM，函数会自动添加）
 * @param filename 建议的文件名
 */
export const downloadCsv = async (content: string, filename: string): Promise<void> => {
    if (!content) {
        message.warning('暂无内容可下载');
        return;
    }

    // 添加 BOM 使得 Excel 能正确识别 UTF-8
    const contentWithBom = '\uFEFF' + content;

    // 使用 Web 标准下载方式
    // 此方法在 Tauri 桌面应用中也可以工作
    const blob = new Blob([contentWithBom], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    // 模拟点击下载
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 延迟释放 URL
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    message.success(`正在下载 ${filename}`);
};
