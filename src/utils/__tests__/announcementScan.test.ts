import { describe, expect, it } from 'vitest';
import {
    adjudicateCandidates,
    assetGroupName,
    buildAssetNamingIndex,
    resolveCandidateNaming,
    type AssetNamingEntry,
    type PdfCandidate,
} from '../announcementScan';

const candidate = (over: Partial<PdfCandidate> & { path: string }): PdfCandidate => ({
    fileName: over.path.split('/').pop() ?? over.path,
    sizeBytes: 170_000,
    modifiedMs: 1_000,
    contentHash: `hash-${over.path}`,
    confidence: 'announcement',
    announceNo: 'DNC5037XXYBEVP1',
    batch: '407',
    company: null,
    trademark: null,
    productTitle: null,
    markerHits: 8,
    filenameHint: false,
    error: null,
    ...over,
});

const entry = (fileName: string, productName: string): AssetNamingEntry => ({ fileName, productName });

describe('buildAssetNamingIndex / assetGroupName', () => {
    it('indexes by both announceNos and vehicleModel, keys normalized to uppercase', () => {
        const index = buildAssetNamingIndex([
            { fileName: 'a.json', productName: '远程V8E', announceNos: ['DNC1'], vehicleModel: 'DNC2' },
        ] as never[]);
        expect(index.has('DNC1')).toBe(true);
        expect(index.has('DNC2')).toBe(true);
        // 键为大写规范化——查找侧统一走 normalizeAnnounceNo（resolveCandidateNaming 已如此）
        expect(index.get('dnc1' as never)).toBeUndefined();
    });

    it('assetGroupName derives the group key from file name', () => {
        expect(assetGroupName(entry('远程V8E-55.23kWh DNC1.json', '远程V8E 某配置'))).toContain('V8E');
    });
});

describe('resolveCandidateNaming', () => {
    it('borrows the asset group name when the announce number hits the library', () => {
        const index = buildAssetNamingIndex([
            { fileName: '远程V8E-55.23kWh DNC5037XXYBEVP1.json', productName: '远程V8E 6x2 厢式车', announceNos: ['DNC5037XXYBEVP1'] },
        ] as never[]);
        const naming = resolveCandidateNaming(candidate({ path: '/a.pdf' }), index);
        expect(naming).toEqual({ vehicleName: expect.stringContaining('V8E'), announceNo: 'DNC5037XXYBEVP1', batch: '407' });
    });

    it('falls back to trademark + stripped product title', () => {
        const naming = resolveCandidateNaming(candidate({
            path: '/b.pdf',
            announceNo: 'JJC999',
            batch: '',
            trademark: '远程牌',
            productTitle: 'JJC999型纯电动厢式运输车',
        }), new Map());
        expect(naming.vehicleName).toBe('远程牌 纯电动厢式运输车');
        expect(naming.batch).toBe('');
    });

    it('ignores trademark that is actually an address line', () => {
        const naming = resolveCandidateNaming(candidate({
            path: '/c.pdf',
            announceNo: 'JJC999',
            trademark: '四川省南充市嘉陵区远程大道二段198号',
            productTitle: 'JJC999型纯电动厢式运输车',
        }), new Map());
        expect(naming.vehicleName).toBe('纯电动厢式运输车');
    });

    it('returns blanks for an unreadable candidate', () => {
        const naming = resolveCandidateNaming(candidate({
            path: '/d.pdf', announceNo: null, batch: null, confidence: 'suspect', error: 'x',
        }), new Map());
        expect(naming).toEqual({ vehicleName: '', announceNo: '', batch: '' });
    });

    it('falls back to the file name for notDownloaded candidates', () => {
        const naming = resolveCandidateNaming(candidate({
            path: '/some/dir/某车公告第389批.pdf',
            confidence: 'notDownloaded',
            announceNo: 'XML5036XYZEVS0', // Rust 侧从文件名解析
            batch: '389',
        }), new Map());
        expect(naming.vehicleName).toBe('某车公告第389批');
        expect(naming.announceNo).toBe('XML5036XYZEVS0');
        expect(naming.batch).toBe('389');
    });
});

describe('adjudicateCandidates', () => {
    it('marks candidates whose content hash is already archived', () => {
        const result = adjudicateCandidates(
            [candidate({ path: '/a.pdf', contentHash: 'ARCHIVED' })],
            new Set(['ARCHIVED']),
            new Set(),
        );
        expect(result).toHaveLength(1);
        expect(result[0].group).toBe('archived');
    });

    it('keeps only the newest copy among identical contents', () => {
        const result = adjudicateCandidates(
            [
                candidate({ path: '/old.pdf', contentHash: 'H', modifiedMs: 100 }),
                candidate({ path: '/new.pdf', contentHash: 'H', modifiedMs: 200 }),
            ],
            new Set(),
            new Set(),
        );
        const groups = Object.fromEntries(result.map(r => [r.candidate.path, r.group]));
        expect(groups['/new.pdf']).toBe('fresh');
        expect(groups['/old.pdf']).toBe('duplicate');
    });

    it('same announceNo+batch different content: newest wins, older superseded', () => {
        const result = adjudicateCandidates(
            [
                candidate({ path: '/v1.pdf', announceNo: 'DNC1', batch: '407', modifiedMs: 100 }),
                candidate({ path: '/v2.pdf', announceNo: 'DNC1', batch: '407', modifiedMs: 200 }),
            ],
            new Set(),
            new Set(),
        );
        const groups = Object.fromEntries(result.map(r => [r.candidate.path, r.group]));
        expect(groups['/v2.pdf']).toBe('fresh');
        expect(groups['/v1.pdf']).toBe('superseded');
    });

    it('flags replacesArchived when a record with the same announceNo+batch exists', () => {
        const result = adjudicateCandidates(
            [candidate({ path: '/a.pdf', announceNo: 'DNC1', batch: '407' })],
            new Set(),
            new Set(['DNC1|407']),
        );
        expect(result[0].group).toBe('fresh');
        expect(result[0].replacesArchived).toBe(true);
    });

    it('different batches of the same announceNo are independent fresh candidates', () => {
        const result = adjudicateCandidates(
            [
                candidate({ path: '/b407.pdf', announceNo: 'DNC1', batch: '407' }),
                candidate({ path: '/b408.pdf', announceNo: 'DNC1', batch: '408' }),
            ],
            new Set(),
            new Set(),
        );
        expect(result.filter(r => r.group === 'fresh')).toHaveLength(2);
    });

    it('non-announcement candidates collapse into the other group unchecked', () => {
        const result = adjudicateCandidates(
            [
                candidate({ path: '/intro.pdf', confidence: 'other', markerHits: 0 }),
                candidate({ path: '/real.pdf', confidence: 'announcement' }),
            ],
            new Set(),
            new Set(),
        );
        const other = result.find(r => r.candidate.path === '/intro.pdf');
        expect(other?.group).toBe('other');
        expect(result.find(r => r.candidate.path === '/real.pdf')?.group).toBe('fresh');
    });

    it('notDownloaded candidates form their own group and never enter hash dedup', () => {
        const result = adjudicateCandidates(
            [
                // 未下载候选：空内容哈希，即便 archived 集合里有 "" 也不该被误判
                candidate({ path: '/cloud.pdf', confidence: 'notDownloaded', contentHash: '' }),
                candidate({ path: '/real.pdf', confidence: 'announcement' }),
            ],
            new Set(['']),
            new Set(),
        );
        expect(result.find(r => r.candidate.path === '/cloud.pdf')?.group).toBe('notDownloaded');
        expect(result.find(r => r.candidate.path === '/real.pdf')?.group).toBe('fresh');
        // 未下载排在已归档之前、非公告之前
        expect(result.map(r => r.group)).toEqual(['fresh', 'notDownloaded']);
    });
});
