import { Button, message } from 'antd';
import { useSettingsStore } from '../store/settingsStore';

/**
 * 「资产库目录未设置」的统一提示。
 *
 * 此前各页文案各说各话（「数据源面板」——该面板已下线；「应用右上角」「资产库大目录」「资产库路径」），
 * 且都只告诉用户去哪、不给入口。统一为一句话 + 「去设置」直达设置面板「路径与位置」。
 */
export const LIBRARY_PATH_MISSING_TEXT = '还没有设置资产库目录';

const MESSAGE_KEY = 'library-path-missing';

/** 打开设置面板并定位到「路径与位置」（资产库目录所在分区） */
export function openLibraryPathSettings(): void {
    useSettingsStore.getState().open('paths');
}

/** 弹出带「去设置」入口的提示；同 key 去重，连点不会堆叠多条 */
export function warnLibraryPathMissing(level: 'warning' | 'error' = 'warning'): void {
    message[level]({
        key: MESSAGE_KEY,
        content: (
            <span>
                {LIBRARY_PATH_MISSING_TEXT}
                <Button
                    type="link"
                    size="small"
                    onClick={() => {
                        message.destroy(MESSAGE_KEY);
                        openLibraryPathSettings();
                    }}
                >
                    去设置
                </Button>
            </span>
        ),
    });
}
