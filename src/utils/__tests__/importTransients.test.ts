import { describe, expect, it, vi } from 'vitest';
import { clearImportTransients } from '../importTransients';

describe('clearImportTransients', () => {
    it('releases preview data and diff payload together', () => {
        const setPreviewData = vi.fn();
        const setDiffState = vi.fn();

        clearImportTransients({ setPreviewData, setDiffState });

        expect(setPreviewData).toHaveBeenCalledWith([]);
        expect(setDiffState).toHaveBeenCalledTimes(1);
    });

    it('clears diff payloads (base/target) rather than only closing the modal', () => {
        const reset = vi.fn();
        const { setDiffState } = { setDiffState: reset };

        clearImportTransients({
            setPreviewData: vi.fn(),
            setDiffState,
        });

        // 传入 updater 函数时，对旧状态调用应把 base/target 置空
        const updater = reset.mock.calls[0][0] as (prev: unknown) => unknown;
        const next = updater({ open: true, base: { data: [1] }, target: { data: [2] }, baseFileName: 'a', targetName: 'b' });
        expect(next).toEqual({ open: false, base: null, target: null, baseFileName: '', targetName: '' });
    });

    it('is idempotent and does not mutate the setter bag', () => {
        const bag = { setPreviewData: vi.fn(), setDiffState: vi.fn() };
        const snapshot = { ...bag };

        clearImportTransients(bag);
        clearImportTransients(bag);

        expect(bag).toEqual(snapshot);
        expect(bag.setPreviewData).toHaveBeenCalledTimes(2);
        expect(bag.setDiffState).toHaveBeenCalledTimes(2);
    });
});
