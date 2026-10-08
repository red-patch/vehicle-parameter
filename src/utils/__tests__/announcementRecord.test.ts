import { describe, expect, it } from 'vitest';
import {
    batchSeq,
    buildAnnouncementBaseName,
    buildRecordFileNames,
    extractAnnounceNo,
    extractBatch,
    extractProductName,
    findParamValue,
    matchAnnouncementsByNos,
    normalizeAnnounceNo,
    parseAnnouncementBaseName,
    sanitizeFileNamePart,
    uniquifyBaseName,
    validateAnnouncementRecord,
    type AnnouncementInfo,
} from '../announcementRecord';
import type { VehicleParameter } from '../../types';

const param = (name: string, value: string | number): VehicleParameter => ({
    id: `p-${name}`,
    group: '工信部数据',
    name,
    value,
});

describe('sanitizeFileNamePart', () => {
    it('strips illegal filename characters', () => {
        expect(sanitizeFileNamePart('远程V8E/DNC5037:XXY.pdf')).toBe('远程V8EDNC5037XXY.pdf');
        expect(sanitizeFileNamePart('a*b?c"d<e>f|g\\h')).toBe('abcdefgh');
    });

    it('collapses whitespace and trims separators', () => {
        expect(sanitizeFileNamePart('  远程   V8E _')).toBe('远程 V8E');
        expect(sanitizeFileNamePart('_远程_')).toBe('远程');
    });
});

describe('buildAnnouncementBaseName', () => {
    it('joins vehicle name, announce no and batch', () => {
        expect(
            buildAnnouncementBaseName({ vehicleName: '远程V8E', announceNo: 'DNC5037XXYBEVP1', batch: '第389批' }),
        ).toBe('远程V8E_DNC5037XXYBEVP1_第389批');
    });

    it('omits the batch segment when empty', () => {
        expect(buildAnnouncementBaseName({ vehicleName: '远程V8E', announceNo: 'DNC1', batch: '' })).toBe(
            '远程V8E_DNC1',
        );
        expect(buildAnnouncementBaseName({ vehicleName: '远程V8E', announceNo: 'DNC1', batch: null })).toBe(
            '远程V8E_DNC1',
        );
    });

    it('sanitizes each part and drops empties', () => {
        expect(
            buildAnnouncementBaseName({ vehicleName: 'a/b', announceNo: 'DNC:1', batch: '  ' }),
        ).toBe('ab_DNC1');
    });
});

describe('buildRecordFileNames', () => {
    it('pairs json and pdf with the same base', () => {
        expect(buildRecordFileNames('远程V8E_DNC1_第389批')).toEqual({
            jsonName: '远程V8E_DNC1_第389批.json',
            pdfName: '远程V8E_DNC1_第389批.pdf',
        });
    });
});

describe('parseAnnouncementBaseName', () => {
    it('splits vehicle name, announce no and batch', () => {
        expect(parseAnnouncementBaseName('远程V8E_DNC5037XXYBEVP1_第389批')).toEqual({
            vehicleName: '远程V8E',
            announceNo: 'DNC5037XXYBEVP1',
            batch: '第389批',
        });
    });

    it('handles two-segment names', () => {
        expect(parseAnnouncementBaseName('远程V8E_DNC5037XXYBEVP1')).toEqual({
            vehicleName: '远程V8E',
            announceNo: 'DNC5037XXYBEVP1',
            batch: '',
        });
    });

    it('returns blanks for unparseable names', () => {
        expect(parseAnnouncementBaseName('某个文件名')).toEqual({
            vehicleName: '某个文件名',
            announceNo: '',
            batch: '',
        });
    });
});

describe('uniquifyBaseName', () => {
    it('returns the base when free', () => {
        expect(uniquifyBaseName('a_DNC1', new Set())).toBe('a_DNC1');
    });

    it('appends (2), (3)… on collisions', () => {
        expect(uniquifyBaseName('a_DNC1', new Set(['a_DNC1']))).toBe('a_DNC1(2)');
        expect(uniquifyBaseName('a_DNC1', new Set(['a_DNC1', 'a_DNC1(2)']))).toBe('a_DNC1(3)');
    });
});

describe('validateAnnouncementRecord', () => {
    it('accepts a valid record', () => {
        const record = validateAnnouncementRecord({
            version: '1.0',
            announceNo: 'DNC1',
            batch: '第389批',
            vehicleName: '远程V8E',
            sourceUrl: 'https://x',
            importedAt: '2026-10-01T00:00:00Z',
            pdfFile: 'a.pdf',
            parameters: [param('公告号', 'DNC1')],
        });
        expect(record?.announceNo).toBe('DNC1');
        expect(record?.parameters).toHaveLength(1);
    });

    it('rejects records without announceNo or non-object input', () => {
        expect(validateAnnouncementRecord({ batch: '第389批' })).toBeNull();
        expect(validateAnnouncementRecord(null)).toBeNull();
        expect(validateAnnouncementRecord('x')).toBeNull();
    });

    it('normalizes missing optional fields', () => {
        const record = validateAnnouncementRecord({ announceNo: ' DNC1 ' });
        expect(record?.batch).toBe('');
        expect(record?.pdfFile).toBeNull();
        expect(record?.parameters).toEqual([]);
    });
});

describe('param prefill extraction', () => {
    const params = [param('产品名称', '远程V8E 6x2 厢式运输车'), param('批次', '第389批'), param('公告号', 'DNC1')];

    it('finds first matching non-empty value', () => {
        expect(extractProductName(params)).toBe('远程V8E 6x2 厢式运输车');
        expect(extractBatch(params)).toBe('第389批');
        expect(extractAnnounceNo(params)).toBe('DNC1');
    });

    it('supports fallback name lists', () => {
        expect(findParamValue([param('公告批次', '第390批')], ['批次', '公告批次'])).toBe('第390批');
    });

    it('returns empty string when nothing matches', () => {
        expect(extractBatch([param('其它', 'x')])).toBe('');
    });
});

describe('matchAnnouncementsByNos', () => {
    const info = (over: Partial<AnnouncementInfo>): AnnouncementInfo => ({
        jsonFile: 'a.json',
        announceNo: 'DNC1',
        batch: null,
        vehicleName: null,
        importedAt: null,
        sourceUrl: null,
        hasPdf: false,
        pdfFile: null,
        paramCount: 0,
        orphan: false,
        ...over,
    });

    it('matches case-insensitively and ignores orphans', () => {
        const infos = [info({ announceNo: 'dnc1' }), info({ announceNo: 'DNC2', orphan: true, jsonFile: '' })];
        expect(matchAnnouncementsByNos(infos, ['dnc1'])).toHaveLength(1);
        expect(matchAnnouncementsByNos(infos, ['DNC1'])).toHaveLength(1);
        expect(matchAnnouncementsByNos(infos, ['DNC2'])).toHaveLength(0);
    });

    it('returns empty for empty number list', () => {
        expect(matchAnnouncementsByNos([info({})], [''])).toHaveLength(0);
    });
});

describe('batchSeq', () => {
    it('extracts the batch number for latest-first sorting', () => {
        expect(batchSeq('第389批')).toBe(389);
        expect(batchSeq('第40批')).toBe(40);
        expect(batchSeq('389')).toBe(389);
        expect(batchSeq('')).toBe(-1);
        expect(batchSeq(null)).toBe(-1);
    });
});

describe('normalizeAnnounceNo', () => {
    it('trims and uppercases', () => {
        expect(normalizeAnnounceNo(' dnc1 ')).toBe('DNC1');
    });
});
