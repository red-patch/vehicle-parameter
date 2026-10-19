import { describe, expect, it, vi } from 'vitest';
import { getEnumDataVersion, preloadEnumData, subscribeEnumData } from '../attributeEnums';

describe('词表变更订阅', () => {
    it('preloadEnumData 完成后版本号 +1 并通知订阅者；退订后不再通知', async () => {
        const listener = vi.fn();
        const unsubscribe = subscribeEnumData(listener);
        const before = getEnumDataVersion();
        await preloadEnumData();
        expect(getEnumDataVersion()).toBe(before + 1);
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        await preloadEnumData();
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
