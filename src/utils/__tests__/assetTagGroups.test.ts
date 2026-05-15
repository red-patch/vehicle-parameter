import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSET_TAG_GROUPS } from '../assetTagGroups';

describe('AssetTagGroupsConfig', () => {
    it('returns default config for empty', () => {
        expect(DEFAULT_ASSET_TAG_GROUPS).toEqual({ groups: [], exclusiveGroups: [] });
    });
});
