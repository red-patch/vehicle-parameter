import type { SheetPreview, SheetData } from '../types';

/**
 * 导入过程态的一次性清理（内存治理 P0-1）。
 *
 * 背景：FileManager 里 fileCache / previewData / diffState 此前只设不清——
 * fileCache 是 Map<string, File> 且只有 set，原始 File 永久驻留；
 * diffState 关闭弹窗时只置 open:false，base/target 两张整表仍被引用。
 *
 * 收敛到一个可测入口：所有「预览取消 / 确认 / sheet 选择取消 / 比对关闭」
 * 路径统一调用它，避免漏清。
 */
export interface ImportTransientSetters {
    setFileCache: (next: Map<string, File>) => void;
    setPreviewData: (next: SheetPreview[]) => void;
    setDiffState: (updater: (prev: {
        open: boolean;
        baseFileName: string;
        targetName: string;
        base: SheetData | null;
        target: SheetData | null;
    }) => {
        open: boolean;
        baseFileName: string;
        targetName: string;
        base: SheetData | null;
        target: SheetData | null;
    }) => void;
}

export const clearImportTransients = (s: ImportTransientSetters): void => {
    s.setFileCache(new Map());
    s.setPreviewData([]);
    s.setDiffState(() => ({ open: false, baseFileName: '', targetName: '', base: null, target: null }));
};
