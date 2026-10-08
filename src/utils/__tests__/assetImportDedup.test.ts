import { describe, it, expect } from 'vitest';
import type { AssetFileInfo, AssetMetaMap } from '../assetManager';
import {
    extractImportAnnounceNos,
    extractImportAdmissionNos,
    buildImportCandidate,
    classifyImportCandidate,
    classifyImportBatch,
    defaultDecisionFor,
} from '../assetImportDedup';

const makeInfo = (overrides: Partial<AssetFileInfo> & { fileName: string }): AssetFileInfo => ({
    productName: overrides.fileName.replace(/\.json$/i, ''),
    updatedAt: null,
    totalParams: 10,
    filledParams: 8,
    announceNos: [],
    vehicleModel: null,
    hasAdmissionInfo: false,
    approvalStatus: null,
    ...overrides,
});

describe('extractImportAnnounceNos', () => {
    it('收集纯字母数字公告号与车辆型号，过滤复合ID', () => {
        const nos = extractImportAnnounceNos([
            { id: '1', group: '公告', name: '公告号', value: 'XMQ5039XXYBEVL02' },
            { id: '2', group: '公告', name: '产品编号', value: 'V7E 50kwh_20260303-JHC6507BEVR2' },
            { id: '3', group: '公告', name: '车辆型号', value: 'JHC6507BEVR1' },
            { id: '4', group: '其它', name: '整车名称', value: '龙耀6S' },
        ]);
        expect(nos).toContain('XMQ5039XXYBEVL02');
        expect(nos).toContain('JHC6507BEVR1');
        expect(nos.some(n => n.includes('JHC6507BEVR2'))).toBe(false);
    });
});

describe('classifyImportCandidate', () => {
    it('公告号与产品名都命中 → 确定重复（updated）', () => {
        const existing = [makeInfo({ fileName: '龙耀6S XMQ5039XXYBEVL02 Ⅱ.json', productName: '龙耀6S', announceNos: ['XMQ5039XXYBEVL02'] })];
        const result = classifyImportCandidate(
            { fileName: '龙耀6S-导入', productName: '龙耀6S', announceNos: ['xmq5039xxybevl02'] },
            existing,
        );
        expect(result.verdict).toBe('updated');
        expect(result.matchedFiles).toEqual(['龙耀6S XMQ5039XXYBEVL02 Ⅱ.json']);
    });

    it('公告号相同但产品名不同 → 疑似重复（suspect）', () => {
        const existing = [makeInfo({ fileName: 'A XMQ5039XXYBEVL02.json', productName: '龙耀6S', announceNos: ['XMQ5039XXYBEVL02'] })];
        const result = classifyImportCandidate(
            { fileName: 'B-导入', productName: '龙耀6S Pro', announceNos: ['XMQ5039XXYBEVL02'] },
            existing,
        );
        expect(result.verdict).toBe('suspect');
    });

    it('双方无公告号，同组同产品名 → 确定重复', () => {
        const existing = [makeInfo({ fileName: '龙耀6S.json', productName: '龙耀6S' })];
        const result = classifyImportCandidate(
            { fileName: '龙耀6S-货运版.json', productName: '龙耀6S', announceNos: [] },
            existing,
        );
        expect(result.verdict).toBe('updated');
    });

    it('双方无公告号，同产品名但不同组 → 疑似重复', () => {
        const existing = [makeInfo({ fileName: 'JHC6507BEVR1.json', productName: '龙耀6S' })];
        const result = classifyImportCandidate(
            { fileName: 'ZB5030XXYBEVGDD6.json', productName: '龙耀6S', announceNos: [] },
            existing,
        );
        expect(result.verdict).toBe('suspect');
    });

    it('产品名相同但公告号不同 → 疑似重复', () => {
        const existing = [makeInfo({ fileName: 'A AAA111.json', productName: '龙耀6S', announceNos: ['AAA111'] })];
        const result = classifyImportCandidate(
            { fileName: 'B-导入', productName: '龙耀6S', announceNos: ['BBB222'] },
            existing,
        );
        expect(result.verdict).toBe('suspect');
    });

    it('产品名相同但单方缺公告号 → 疑似重复', () => {
        const existing = [makeInfo({ fileName: 'A AAA111.json', productName: '龙耀6S', announceNos: ['AAA111'] })];
        const result = classifyImportCandidate(
            { fileName: 'B-导入', productName: '龙耀6S', announceNos: [] },
            existing,
        );
        expect(result.verdict).toBe('suspect');
    });

    it('groupName 别名参与归组：别名一致时升为确定重复', () => {
        const existing = [makeInfo({ fileName: 'XMQ5030-old.json', productName: 'V6E' })];
        const meta: AssetMetaMap = { 'XMQ5030-old.json': { groupName: 'V6E' } };
        const candidate = { fileName: 'V6E-新.json', productName: 'V6E', announceNos: [] };

        expect(classifyImportCandidate(candidate, existing, {}).verdict).toBe('suspect');
        expect(classifyImportCandidate(candidate, existing, meta).verdict).toBe('updated');
    });

    it('关键参数签名重合 → 疑似重复', () => {
        const existing = [makeInfo({ fileName: 'A AAA111.json', productName: '甲车' })];
        const result = classifyImportCandidate(
            { fileName: 'B.json', productName: '乙车', announceNos: [], keySignature: 'V6E|38.64|宁德时代' },
            existing.map(e => ({ ...e })),
            {},
        );
        // existing 无 keySignature 时先补上同签名
        expect(result.verdict).toBe('new');
        const existingWithSig = [makeInfo({ fileName: 'A AAA111.json', productName: '甲车', keySignature: 'V6E|38.64|宁德时代' } as Partial<AssetFileInfo> & { fileName: string })];
        const result2 = classifyImportCandidate(
            { fileName: 'B.json', productName: '乙车', announceNos: [], keySignature: 'V6E|38.64|宁德时代' },
            existingWithSig,
        );
        expect(result2.verdict).toBe('suspect');
    });

    it('无任何关联 → new', () => {
        const existing = [makeInfo({ fileName: 'A AAA111.json', productName: '甲车', announceNos: ['AAA111'] })];
        const result = classifyImportCandidate(
            { fileName: 'B.json', productName: '乙车', announceNos: ['BBB222'] },
            existing,
        );
        expect(result.verdict).toBe('new');
        expect(result.matchedFiles).toEqual([]);
    });

    it('确定重复优先于疑似重复', () => {
        const existing = [
            makeInfo({ fileName: 'A AAA111.json', productName: '甲车', announceNos: ['AAA111'] }),
            makeInfo({ fileName: 'B AAA111.json', productName: '甲车Pro', announceNos: ['AAA111'] }),
        ];
        const result = classifyImportCandidate(
            { fileName: 'C.json', productName: '甲车', announceNos: ['AAA111'] },
            existing,
        );
        expect(result.verdict).toBe('updated');
        expect(result.matchedFiles).toEqual(['A AAA111.json']);
    });
});

describe('同公告号但准入证据不同 → 判定为不同车型（2026-10-01 用户裁定）', () => {
    const SH = 'SH5047XXYMFEVMZ5';

    it('准入编号不同（ZR 重报）→ new，理由说明判不同', () => {
        const existing = [makeInfo({
            fileName: `大拿T1 … ${SH} Ⅱ.json`,
            productName: `大拿T1 宁德时代 100.07 ${SH} Ⅱ`,
            announceNos: [SH],
            admissionNos: ['ZR202505300002'],
            admissionLevelRaw: 'Ⅱ',
        })];
        const result = classifyImportCandidate({
            fileName: `大拿T1 … ${SH} Ⅰ`,
            productName: `大拿T1 宁德时代 100.07 ${SH} Ⅰ`,
            announceNos: [SH],
            admissionNos: ['ZR202609290001'],
            admissionLevel: 'Ⅰ',
        }, existing);
        expect(result.verdict).toBe('new');
        expect(result.matchedFiles).toEqual([]);
        expect(result.reason).toContain('不同车型');
        expect(result.reason).toContain('准入编号');
    });

    it('无准入编号但等级不同 → new', () => {
        const existing = [makeInfo({
            fileName: 'A SH1 Ⅱ.json', productName: 'X SH1 Ⅱ', announceNos: ['SH1'], admissionLevelRaw: 'Ⅱ',
        })];
        const result = classifyImportCandidate({
            fileName: 'B SH1 Ⅰ', productName: 'X SH1 Ⅰ', announceNos: ['SH1'], admissionLevel: 'Ⅰ',
        }, existing);
        expect(result.verdict).toBe('new');
        expect(result.reason).toContain('准入等级');
    });

    it('准入编号相同（同准入记录）+ 产品名不同 → 仍疑似（可能是数据修正/名称变体）', () => {
        const existing = [makeInfo({
            fileName: 'A SH1.json', productName: 'X SH1 Ⅱ', announceNos: ['SH1'], admissionNos: ['ZR1'], admissionLevelRaw: 'Ⅱ',
        })];
        const result = classifyImportCandidate({
            fileName: 'B SH1', productName: 'X SH1 Ⅰ', announceNos: ['SH1'], admissionNos: ['ZR1'], admissionLevel: 'Ⅰ',
        }, existing);
        expect(result.verdict).toBe('suspect');
    });

    it('准入编号相同 + 产品名一致 → 确定重复（同车的数据更新）', () => {
        const existing = [makeInfo({
            fileName: 'A SH1.json', productName: 'X SH1', announceNos: ['SH1'], admissionNos: ['ZR1'],
        })];
        const result = classifyImportCandidate({
            fileName: 'B SH1', productName: 'X SH1', announceNos: ['SH1'], admissionNos: ['ZR1'],
        }, existing);
        expect(result.verdict).toBe('updated');
    });
});

describe('extractImportAdmissionNos', () => {
    it('提取准入编号参数', () => {
        expect(extractImportAdmissionNos([
            { id: '1', group: '准入', name: '准入编号', value: 'ZR202505300002' },
            { id: '2', group: '其它', name: '公告号', value: 'SH5047XXYMFEVMZ5' },
        ])).toEqual(['ZR202505300002']);
    });
});

describe('buildImportCandidate', () => {
    it('从参数体组装候选（含准入判别信号）', () => {
        const c = buildImportCandidate(
            [
                { id: '1', group: '公告', name: '公告号', value: 'AAA111' },
                { id: '2', group: '准入', name: '准入编号', value: 'ZR1' },
                { id: '3', group: '准入', name: '产品等级标准', value: 'Ⅱ' },
            ],
            '甲车',
            '甲车',
        );
        expect(c.announceNos).toEqual(['AAA111']);
        expect(c.admissionNos).toEqual(['ZR1']);
        expect(c.admissionLevel).toBe('Ⅱ');
    });
});

describe('classifyImportBatch', () => {
    it('批次内身份键撞车 → 后者判 suspect', () => {
        const candidates = [
            { fileName: '甲车.json', productName: '甲车', announceNos: ['AAA111'] },
            { fileName: '甲车-copy.json', productName: '甲车', announceNos: ['AAA111'] },
        ];
        const results = classifyImportBatch(candidates, []);
        expect(results[0].verdict).toBe('new');
        expect(results[1].verdict).toBe('suspect');
        expect(results[1].reason).toContain('甲车');
    });

    it('批次内不同车型互不干扰', () => {
        const candidates = [
            { fileName: '甲车.json', productName: '甲车', announceNos: ['AAA111'] },
            { fileName: '乙车.json', productName: '乙车', announceNos: ['BBB222'] },
        ];
        const results = classifyImportBatch(candidates, []);
        expect(results.every(r => r.verdict === 'new')).toBe(true);
    });
});

describe('defaultDecisionFor', () => {
    it('新增→保存；更新已有→并存；疑似→跳过', () => {
        expect(defaultDecisionFor('new')).toBe('save');
        expect(defaultDecisionFor('updated')).toBe('keep-new');
        expect(defaultDecisionFor('suspect')).toBe('skip');
    });
});

describe('buildImportCandidate', () => {
    it('从参数体组装候选', () => {
        const c = buildImportCandidate(
            [{ id: '1', group: '公告', name: '公告号', value: 'AAA111' }],
            '甲车',
            '甲车',
        );
        expect(c.announceNos).toEqual(['AAA111']);
    });
});
