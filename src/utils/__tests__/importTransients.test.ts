import { describe, expect, it, vi } from 'vitest';
import { clearImportTransients } from '../importTransients';

describe('clearImportTransients', () => {
    it('releases the file cache, preview data and diff payload together', () => {
        const setFileCache = vi.fn();
        const setPreviewData = vi.fn();
        const setDiffState = vi.fn();

        clearImportTransients({ setFileCache, setPreviewData, setDiffState });

        expect(setFileCache).toHaveBeenCalledWith(new Map());
        expect(setPreviewData).toHaveBeenCalledWith([]);
        expect(setDiffState).toHaveBeenCalledTimes(1);
    });

    it('clears diff payloads (base/target) rather than only closing the modal', () => {
        const reset = vi.fn();
        const { setDiffState } = { setDiffState: reset };

        clearImportTransients({
            setFileCache: vi.fn(),
            setPreviewData: vi.fn(),
            setDiffState,
        });

        // 传入 updater 函数时，对旧状态调用应把 base/target 置空
        const updater = reset.mock.calls[0][0] as (prev: unknown) => unknown;
        const next = updater({ open: true, base: { data: [1] }, target: { data: [2] }, baseFileName: 'a', targetName: 'b' });
        expect(next).toEqual({ open: false, base: null, target: null, baseFileName: '', targetName: '' });
    });

    it('hands each call a fresh empty Map (no shared instance reused across calls)', () => {
        const setFileCache = vi.fn();
        const setPreviewData = vi.fn();
        const setDiffState = vi.fn();
        const bag = { setFileCache, setPreviewData, setDiffState };

        clearImportTransients(bag);
        clearImportTransients(bag);

        const first = setFileCache.mock.calls[0][0] as Map<string, File>;
        const second = setFileCache.mock.calls[1][0] as Map<string, File>;
        expect(first).not.toBe(second);
        expect(first.size).toBe(0);
        expect(second.size).toBe(0);
    });

    it('is idempotent and does not mutate the setter bag', () => {
        const bag = { setFileCache: vi.fn(), setPreviewData: vi.fn(), setDiffState: vi.fn() };
        const snapshot = { ...bag };

        clearImportTransients(bag);
        clearImportTransients(bag);

        expect(bag).toEqual(snapshot);
        expect(bag.setFileCache).toHaveBeenCalledTimes(2);
        expect(bag.setPreviewData).toHaveBeenCalledTimes(2);
        expect(bag.setDiffState).toHaveBeenCalledTimes(2);
    });
});
