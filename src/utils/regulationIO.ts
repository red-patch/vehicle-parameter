/**
 * 法规库 IO 薄封装（设计 §5.3：Tauri 命令，无 JS 回退）
 *
 * **刻意不做 JS 回退**（与 announcementRecord.ts 不同）：公告中心有 plugin-fs 回退，
 * 是因为它只读目录、不解析命名；法规库的**文件名解析是 Rust 单源**（Q18），
 * 在浏览器里重写一遍解析就等于把双实现漂移带回来——那正是本设计要消灭的东西。
 * 非桌面环境下宁可明确报错，也不给一份行为不同的实现。
 */

import type { FirstPageHints, RegulationScanResult, RegulationSidecar } from './regulationTypes';

export class NotDesktopError extends Error {
    constructor() {
        super('法规标准库仅在桌面端可用');
        this.name = 'NotDesktopError';
    }
}

const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const invokeCore = async <T>(cmd: string, args: Record<string, unknown>): Promise<T> => {
    if (!isTauri()) throw new NotDesktopError();
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
};

/** 读取旁路文件；不存在时 Rust 返回带默认词表/站点模板的空库 */
export const readSidecar = (root: string): Promise<RegulationSidecar> =>
    invokeCore<RegulationSidecar>('read_regulation_sidecar', { root });

/** 整库写入（单文件旁路，一次 IPC） */
export const writeSidecar = (root: string, sidecar: RegulationSidecar): Promise<string> =>
    invokeCore<string>('write_regulation_sidecar', { root, sidecar });

/** 扫描：遍历目录 + 解析文件名 + 重算引用状态 + 列出未登记文件 */
export const scanRegulations = (root: string): Promise<RegulationScanResult> =>
    invokeCore<RegulationScanResult>('scan_regulations', { root });

/**
 * 从标准 PDF 首页抽预填线索（发布/实施日期、代替 XXX、稿别）。
 * best-effort：Rust 侧读不了/无文本层/过大一律返回 null，不抛错。
 */
export const extractHints = async (fullPath: string): Promise<FirstPageHints | null> => {
    try {
        return await invokeCore<FirstPageHints | null>('extract_regulation_hints', { path: fullPath });
    } catch {
        // 预填是锦上添花，失败不该打断登记流程
        return null;
    }
};
