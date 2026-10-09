import { describe, expect, it } from 'vitest';
import {
    EMPTY_FILTERS,
    buildVersionChains,
    compareVersionDesc,
    deriveStatus,
    applyHints,
    emptyRecord,
    filterRecords,
    findConflicts,
    formatSiteUrl,
    formatSize,
    identityOf,
    latestOfChain,
    pickSite,
    recordIssue,
    sitesForLevel,
    splitStandardNoYear,
    statusLabel,
    type RegulationRecord,
    type SiteTemplate,
} from '../regulationTypes';

const rec = (over: Partial<RegulationRecord> = {}): RegulationRecord =>
    emptyRecord({ standardNo: 'GB 44495', title: '汽车整车信息安全技术要求', ...over });

describe('deriveStatus — 日期推导 + 人工覆盖位（Q7）', () => {
    it('实施日期在未来 → 即将实施', () => {
        expect(deriveStatus({ status: '', statusOverridden: false, publishedAt: '2026-08-27', effectiveAt: '2027-07-01' }, '2026-10-09')).toBe('即将实施');
    });

    it('实施日期已过 → 现行', () => {
        expect(deriveStatus({ status: '', statusOverridden: false, publishedAt: '2024-08-23', effectiveAt: '2026-01-01' }, '2026-10-09')).toBe('现行');
    });

    it('实施当天算现行（边界）', () => {
        expect(deriveStatus({ status: '', statusOverridden: false, publishedAt: null, effectiveAt: '2026-10-09' }, '2026-10-09')).toBe('现行');
    });

    it('只有发布日期 → 现行', () => {
        expect(deriveStatus({ status: '', statusOverridden: false, publishedAt: '2016-07-26', effectiveAt: null }, '2026-10-09')).toBe('现行');
    });

    it('稿别标记优先于日期 → 草案', () => {
        // 征求意见稿即使带了日期也应是草案
        expect(
            deriveStatus({ status: '', statusOverridden: false, publishedAt: '2021-01-01', effectiveAt: '2021-06-01', marker: '征求意见稿' }, '2026-10-09'),
        ).toBe('草案');
    });

    it('显式状态「草案」优先于日期（否则填了日期就会显示成现行）', () => {
        // 登记时对征求意见稿预填 status='草案'；若日期先判，稿别就丢了
        expect(
            deriveStatus({ status: '草案', statusOverridden: false, publishedAt: '2017-01-01', effectiveAt: '2017-06-01' }, '2026-10-09'),
        ).toBe('草案');
    });

    it('人工覆盖压过一切', () => {
        // 废止无法从日期推出，只能人工标注——覆盖位必须生效
        expect(
            deriveStatus({ status: '废止', statusOverridden: true, publishedAt: '2016-07-26', effectiveAt: '2016-07-26' }, '2026-10-09'),
        ).toBe('废止');
    });

    it('人工写了状态但没勾覆盖：无日期时仍采信', () => {
        expect(deriveStatus({ status: '已被替代', statusOverridden: false, publishedAt: null, effectiveAt: null }, '2026-10-09')).toBe('已被替代');
    });

    it('什么都没有 → 未知（不猜）', () => {
        expect(deriveStatus({ status: '', statusOverridden: false, publishedAt: null, effectiveAt: null }, '2026-10-09')).toBe('未知');
    });

    it('日期格式非法时不当成日期用', () => {
        expect(deriveStatus({ status: '', statusOverridden: false, publishedAt: null, effectiveAt: '2026年' }, '2026-10-09')).toBe('未知');
    });

    it('statusLabel 把空串显示成未知', () => {
        expect(statusLabel('')).toBe('未知');
        expect(statusLabel('现行')).toBe('现行');
    });
});

describe('formatSiteUrl — 站点模板占位符（Q26）', () => {
    it('填充 {no} 并转义', () => {
        expect(formatSiteUrl('https://x/{no}', 'GB 44495')).toBe('https://x/GB%2044495');
    });

    it('{compact} 去空格', () => {
        expect(formatSiteUrl('https://x/{compact}', 'GB/T 18386.1')).toBe('https://x/GB%2FT18386.1');
    });

    it('{code} 去掉发布机构前缀（SAE 规范页只认代号，实测 j3016 200）', () => {
        expect(formatSiteUrl('https://www.sae.org/standards/content/{code}/', 'SAE J3016')).toBe(
            'https://www.sae.org/standards/content/j3016/',
        );
    });

    it('{code} 对无前缀的标准号回落为整体', () => {
        expect(formatSiteUrl('https://x/{code}', 'J3016')).toBe('https://x/j3016');
    });

    it('{lower} 去空格转小写', () => {
        expect(formatSiteUrl('https://x/{lower}', 'SAE J3016')).toBe('https://x/saej3016');
    });

    it('模板无占位符时原样返回', () => {
        expect(formatSiteUrl('https://hbba.sacinfo.org.cn/', 'GA 802')).toBe('https://hbba.sacinfo.org.cn/');
    });

    it('空标准号不产生 undefined', () => {
        expect(formatSiteUrl('https://x/{no}', '')).toBe('https://x/');
    });
});

describe('pickSite / sitesForLevel — 按层级选权威站点（Q24：只有国标可回填）', () => {
    const sites: SiteTemplate[] = [
        { name: '国标站', levels: ['国标'], urlTemplate: 'https://gb/{no}', supportsVerify: true },
        { name: '行标站', levels: ['行标'], urlTemplate: 'https://hb/', supportsVerify: false },
        { name: '通用站', levels: [], urlTemplate: 'https://any/{no}', supportsVerify: false },
    ];

    it('精确匹配层级', () => {
        expect(pickSite(sites, '国标')?.name).toBe('国标站');
        expect(pickSite(sites, '行标')?.name).toBe('行标站');
    });

    it('层级没有专属站点时回落到通用站点', () => {
        expect(pickSite(sites, '团标')?.name).toBe('通用站');
    });

    it('只有支持回填的站点才带 supportsVerify', () => {
        expect(sitesForLevel(sites, '国标').filter(s => s.supportsVerify).map(s => s.name)).toEqual(['国标站']);
        expect(sitesForLevel(sites, '行标').filter(s => s.supportsVerify)).toEqual([]);
    });

    it('无站点时返回 null', () => {
        expect(pickSite([], '国标')).toBeNull();
    });
});

describe('splitStandardNoYear / findConflicts — 身份与版本归位、永不静默覆盖', () => {
    it('把连写的标准号+年份拆开', () => {
        expect(splitStandardNoYear('GB 44495-2024')).toEqual({ standardNo: 'GB 44495', year: '2024' });
        expect(splitStandardNoYear('GB/T 34590.1-2022')).toEqual({ standardNo: 'GB/T 34590.1', year: '2022' });
    });

    it('不带年份的原样保留', () => {
        expect(splitStandardNoYear('GB 44495')).toEqual({ standardNo: 'GB 44495', year: null });
        // 部分号尾部不是 4 位数字，不能误拆
        expect(splitStandardNoYear('GB/T 34590.1')).toEqual({ standardNo: 'GB/T 34590.1', year: null });
        // SAE 的 6 位修订代号不是年份
        expect(splitStandardNoYear('SAE J3016-202104')).toEqual({ standardNo: 'SAE J3016-202104', year: null });
    });

    it('identityOf 去年份但保留部分号', () => {
        expect(identityOf({ standardNo: 'GB 1589-2016' })).toBe('GB 1589');
        expect(identityOf({ standardNo: 'GB/T 34590.1-2022' })).toBe('GB/T 34590.1');
        expect(identityOf({ standardNo: 'GB/T 34590.1' })).toBe('GB/T 34590.1');
        expect(identityOf({ standardNo: 'SAE J3016-202104' })).toBe('SAE J3016-202104');
    });

    it('同一身份不同版本不算冲突（那是版本链）', () => {
        const existing = [rec({ standardNo: 'GB 1589', year: '2016' })];
        expect(findConflicts(existing, [{ standardNo: 'GB 1589', year: '2026' }])).toHaveLength(0);
    });

    it('身份+版本都相同 → 报冲突，不静默覆盖', () => {
        const existing = [rec({ standardNo: 'GB 1589', year: '2016' })];
        const conflicts = findConflicts(existing, [{ standardNo: 'GB 1589', year: '2016' }]);
        expect(conflicts).toHaveLength(1);
    });

    it('用户把年份填进标准号也能识别出冲突', () => {
        const existing = [rec({ standardNo: 'GB 1589', year: '2016' })];
        // 待登记项写成 "GB 1589-2016"，身份归一后仍是同一版本
        const conflicts = findConflicts(existing, [{ standardNo: 'GB 1589-2016', year: null }]);
        expect(conflicts).toHaveLength(1);
    });

    it('条目之间互相重复也算冲突，且不重复计数', () => {
        const conflicts = findConflicts(
            [],
            [
                { standardNo: 'GB 1', year: '2020' },
                { standardNo: 'GB 1', year: '2020' },
                { standardNo: 'GB 1', year: '2020' },
            ],
        );
        expect(conflicts).toHaveLength(1);
    });

    it('没有冲突时返回空', () => {
        expect(findConflicts([], [{ standardNo: 'GB 1', year: '2020' }])).toEqual([]);
    });
});

describe('applyHints — 首页预填合并（Q16）', () => {
    const hints = {
        publishedAt: '2024-08-23',
        effectiveAt: '2026-01-01',
        replaces: ['GB 1589-2016'],
        isDraft: false,
        textLayer: 'has',
    };

    it('空记录填入全部线索', () => {
        const r = applyHints(rec(), hints);
        expect(r.publishedAt).toBe('2024-08-23');
        expect(r.effectiveAt).toBe('2026-01-01');
        expect(r.replaces).toEqual(['GB 1589-2016']);
    });

    it('人工已填的值不被覆盖（人工优先）', () => {
        const r = applyHints(rec({ publishedAt: '2000-01-01', replaces: ['GB 1-1999'] }), hints);
        expect(r.publishedAt).toBe('2000-01-01');
        expect(r.replaces).toEqual(['GB 1-1999']);
        // 未填的仍然补上
        expect(r.effectiveAt).toBe('2026-01-01');
    });

    it('无线索时原样返回', () => {
        const before = rec({ publishedAt: '2020-01-01' });
        expect(applyHints(before, null)).toEqual(before);
    });

    it('文本层探测结果写进记录（扫描件要能被标出来）', () => {
        const r = applyHints(rec({ textLayer: 'unknown' }), { ...hints, textLayer: 'none' });
        expect(r.textLayer).toBe('none');
    });

    it('已有文本层结论不被覆盖', () => {
        const r = applyHints(rec({ textLayer: 'none' }), { ...hints, textLayer: 'has' });
        expect(r.textLayer).toBe('none');
    });

    it('稿别线索预填为草案状态', () => {
        const r = applyHints(rec(), { ...hints, isDraft: true });
        expect(r.status).toBe('草案');
    });

    it('已有状态不被稿别线索覆盖', () => {
        const r = applyHints(rec({ status: '现行' }), { ...hints, isDraft: true });
        expect(r.status).toBe('现行');
    });
});

describe('版本链 — 同一标准号的多个版本（Q5/Q6）', () => {
    const r2016 = rec({ standardNo: 'GB 1589', year: '2016', title: '外廓尺寸限值' });
    const r2026 = rec({ standardNo: 'GB 1589', year: '2026', title: '外廓尺寸限值' });
    const rOther = rec({ standardNo: 'GB 7258', year: '2017', title: '运行安全技术条件' });

    it('身份 = 标准号，年份不参与', () => {
        expect(identityOf(r2016)).toBe(identityOf(r2026));
        expect(identityOf(r2016)).not.toBe(identityOf(rOther));
    });

    it('部分号是不同身份', () => {
        expect(identityOf(rec({ standardNo: 'GB/T 18386.1' }))).not.toBe(identityOf(rec({ standardNo: 'GB/T 18386.2' })));
    });

    it('分组后每条链按年份降序', () => {
        const chains = buildVersionChains([r2016, r2026, rOther]);
        expect(chains.get('GB 1589')?.map(r => r.year)).toEqual(['2026', '2016']);
        expect(chains.get('GB 7258')).toHaveLength(1);
    });

    it('最新版取年份最大的', () => {
        expect(latestOfChain([r2016, r2026]).year).toBe('2026');
    });

    it('无年份的排在最后', () => {
        const noYear = rec({ standardNo: 'GB 1589', year: null });
        expect([noYear, r2016].sort(compareVersionDesc).map(r => r.year)).toEqual(['2016', null]);
    });
});

describe('filterRecords — facet 横切 + 搜索（Q10/Q13/Q17）', () => {
    const a = rec({ standardNo: 'GB 44495', level: '国标', domains: ['智能驾驶', '信息安全'], effectiveAt: '2026-01-01' });
    const b = rec({ standardNo: 'GB 1589', level: '国标', domains: ['整车安全与准入'], effectiveAt: '2017-01-01' });
    const c = rec({ standardNo: 'ISO 26262', level: '国际', domains: ['功能安全'], effectiveAt: null });
    const all = [a, b, c];
    const TODAY = '2026-10-09';

    it('空筛选返回全部', () => {
        expect(filterRecords(all, EMPTY_FILTERS, TODAY)).toHaveLength(3);
    });

    it('层级筛选', () => {
        expect(filterRecords(all, { ...EMPTY_FILTERS, levels: ['国际'] }, TODAY).map(r => r.standardNo)).toEqual(['ISO 26262']);
    });

    it('主题域多值：命中任一即通过', () => {
        expect(filterRecords(all, { ...EMPTY_FILTERS, domains: ['信息安全'] }, TODAY).map(r => r.standardNo)).toEqual(['GB 44495']);
        expect(filterRecords(all, { ...EMPTY_FILTERS, domains: ['信息安全', '功能安全'] }, TODAY).map(r => r.standardNo)).toEqual(['GB 44495', 'ISO 26262']);
    });

    it('多维 facet 是「与」关系（横切）', () => {
        expect(filterRecords(all, { ...EMPTY_FILTERS, levels: ['国标'], domains: ['功能安全'] }, TODAY)).toHaveLength(0);
    });

    it('状态筛选走推导结果', () => {
        expect(filterRecords(all, { ...EMPTY_FILTERS, statuses: ['现行'] }, TODAY).map(r => r.standardNo)).toEqual(['GB 44495', 'GB 1589']);
        expect(filterRecords(all, { ...EMPTY_FILTERS, statuses: ['未知'] }, TODAY).map(r => r.standardNo)).toEqual(['ISO 26262']);
    });

    it('搜索匹配标准号/名称/主题域，大小写不敏感', () => {
        expect(filterRecords(all, { ...EMPTY_FILTERS, query: '44495' }, TODAY)).toHaveLength(1);
        expect(filterRecords(all, { ...EMPTY_FILTERS, query: 'iso 26262' }, TODAY)).toHaveLength(1);
        expect(filterRecords(all, { ...EMPTY_FILTERS, query: '功能安全' }, TODAY)).toHaveLength(1);
        expect(filterRecords(all, { ...EMPTY_FILTERS, query: 'zzz' }, TODAY)).toHaveLength(0);
    });
});

describe('展示助手', () => {
    it('formatSize', () => {
        expect(formatSize(null)).toBe('—');
        expect(formatSize(0)).toBe('—');
        expect(formatSize(500 * 1024)).toBe('500 KB');
        expect(formatSize(6.36 * 1024 * 1024)).toBe('6.4 MB');
    });

    it('recordIssue 优先级：缺失 > 无文件 > 未下载 > 无文本层', () => {
        expect(recordIssue(rec({ fileMissing: true, notDownloaded: true }))).toBe('file-missing');
        expect(recordIssue(rec({ fileName: null }))).toBe('no-file');
        expect(recordIssue(rec({ fileName: 'a.pdf', notDownloaded: true }))).toBe('not-downloaded');
        expect(recordIssue(rec({ fileName: 'a.pdf', textLayer: 'none' }))).toBe('no-text-layer');
        expect(recordIssue(rec({ fileName: 'a.pdf', textLayer: 'has' }))).toBeNull();
    });

    it('无 PDF 是合法状态，不是错误（Q8）', () => {
        // 有 no-file 提示，但记录本身合法——不应被当成解析失败
        const r = rec({ fileName: null, standardNo: 'ISO 26262', unparsedReason: undefined });
        expect(recordIssue(r)).toBe('no-file');
        expect(r.standardNo).toBe('ISO 26262');
    });
});
