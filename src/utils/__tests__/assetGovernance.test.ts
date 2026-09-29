import { describe, it, expect } from 'vitest';
import type { AssetFileInfo } from '../assetManager';
import {
  buildAdoptPrimaryMeta,
  buildGovernanceReport,
  deriveVehicleGroupKey,
  suggestPrimary,
} from '../assetGovernance';

// 文件名取自真实资产库 /Users/ethan/车型数据库（2026-09 摸底）
const makeInfo = (over: Partial<AssetFileInfo> & { fileName: string }): AssetFileInfo => ({
  productName: over.fileName.replace(/\.json$/i, ''),
  updatedAt: null,
  totalParams: 0,
  filledParams: 0,
  announceNos: [],
  vehicleModel: null,
  hasAdmissionInfo: false,
  approvalStatus: null,
  ...over,
});

describe('deriveVehicleGroupKey', () => {
  it('五段式命名取 series', () => {
    expect(deriveVehicleGroupKey('F3E-25款-宁德55kWh-厢货-ZB5037XXYBEVGS1.json')).toBe('F3E');
  });

  it('公告范式取首个 token', () => {
    expect(deriveVehicleGroupKey('龙耀8S 宁德时代新能源科技股份有限公司 53.58 XMQ5035XXYBEVL02 Ⅱ.json')).toBe('龙耀8S');
    expect(deriveVehicleGroupKey('智云S300 宁德时代新能源科技股份有限公司 100.46 SX5045XXYBEV341N Ⅰ (ZR202403220001).json')).toBe('智云S300');
  });

  it('尾部括号内容剥离（同车型不同上装归同组）', () => {
    expect(deriveVehicleGroupKey('V6E 宁德时代新能源科技股份有限公司 38.64 DNC5037XXYBEVP1 Ⅱ.json')).toBe('V6E');
    expect(deriveVehicleGroupKey('V6E（小丰车） DNC5037XXYBEVP1_20260317.json')).toBe('V6E');
    expect(deriveVehicleGroupKey('V6E-23款-宁德38.64（3代）+智芯（EVK扁线）+平顶盲窗.json')).toBe('V6E');
  });

  it('变体尾缀剥离', () => {
    expect(deriveVehicleGroupKey('V6E（客运版）-JHC6480BEV22.json')).toBe('V6E');
    expect(deriveVehicleGroupKey('V6E-明窗—宁德41.86+智芯（高速）-25款智富版.json')).toBe('V6E');
  });

  it('厂商前缀剥离：开发级与公告级同车型归同组', () => {
    const key1 = deriveVehicleGroupKey('金旅ET850（货厢）-399.json');
    const key2 = deriveVehicleGroupKey('ET850 宁德时代 70.59 XML1048JEV10 Ⅱ.json');
    expect(key1).toBe('ET850');
    expect(key2).toBe('ET850');
  });

  it('【废弃】前缀剥离 + 厂商前缀剥离', () => {
    expect(deriveVehicleGroupKey('【废弃】V7E客运版-25款 宁德时代新能源科技股份有限公司 50.232 JL6501BEV114 Ⅲ2.json')).toBe('V7E');
  });

  it('token 被厂商剥离剥空时顺延下一个 token', () => {
    expect(deriveVehicleGroupKey('新石器牌_X3_25款_背笼_换电_多氟多_7.84kWh.json')).toBe('X3');
  });

  it('下划线范式的品牌+车型', () => {
    expect(deriveVehicleGroupKey('白犀牛R3_20260309.json')).toBe('R3');
    expect(deriveVehicleGroupKey('九识Z8Max_20260309.json')).toBe('Z8MAX');
  });

  it('拉丁字母归一大写', () => {
    expect(deriveVehicleGroupKey('九识Z8Max_20260309.json')).toBe(deriveVehicleGroupKey('九识Z8max_20260309.json'));
  });
});

describe('suggestPrimary', () => {
  const entry = (info: AssetFileInfo, meta = {}) => ({ info, meta, groupKey: 'G' });

  it('审批已审核优先于参数更多', () => {
    const approved = makeInfo({ fileName: 'a.json', filledParams: 10, approvalStatus: '已审核' });
    const bigger = makeInfo({ fileName: 'b.json', filledParams: 100 });
    expect(suggestPrimary([entry(bigger), entry(approved)])).toBe('a.json');
  });

  it('文件名带「废弃」的降级，即使已审核且参数最多', () => {
    const deprecated = makeInfo({ fileName: '【废弃】V7E客运版.json', filledParams: 100, approvalStatus: '已审核' });
    const normal = makeInfo({ fileName: 'V7E客运版.json', filledParams: 10 });
    expect(suggestPrimary([entry(deprecated), entry(normal)])).toBe('V7E客运版.json');
  });

  it('其次按填写参数最多', () => {
    const small = makeInfo({ fileName: 'a.json', filledParams: 10 });
    const big = makeInfo({ fileName: 'b.json', filledParams: 99 });
    expect(suggestPrimary([entry(small), entry(big)])).toBe('b.json');
  });

  it('再次按 updatedAt 最新', () => {
    const old = makeInfo({ fileName: 'a.json', updatedAt: '2026-03-02T00:00:00Z' });
    const recent = makeInfo({ fileName: 'b.json', updatedAt: '2026-09-21T00:00:00Z' });
    expect(suggestPrimary([entry(recent), entry(old)])).toBe('b.json');
  });

  it('完全并列时按文件名字典序，保证确定性', () => {
    const a = makeInfo({ fileName: 'b.json' });
    const b = makeInfo({ fileName: 'a.json' });
    expect(suggestPrimary([entry(a), entry(b)])).toBe('a.json');
  });
});

describe('buildGovernanceReport', () => {
  const infos = [
    makeInfo({ fileName: 'V6E 宁德时代 38.64 DNC5037XXYBEVP1 Ⅱ.json', vehicleModel: 'DNC5037XXYBEVP1', hasAdmissionInfo: true, approvalStatus: '已审核', filledParams: 50 }),
    makeInfo({ fileName: 'V6E（客运版）-JHC6480BEV22.json', announceNos: ['JHC6480BEV22'] }),
    makeInfo({ fileName: 'V6E-23款-宁德38.64.json', announceNos: ['ZZ999'], approvalStatus: '驳回', hasAdmissionInfo: true }),
    makeInfo({ fileName: '大拿T1 宁德时代 86.55 SH5047XXYMFEVMZ1 Ⅱ.json', vehicleModel: 'SH5047XXYMFEVMZ1', hasAdmissionInfo: true, approvalStatus: '已审核' }),
  ];
  const meta = {
    'V6E-23款-宁德38.64.json': { isPrimary: true },
  };

  it('分组统计', () => {
    const report = buildGovernanceReport(infos, meta);
    expect(report.totalFiles).toBe(4);
    expect(report.totalGroups).toBe(2);
    const v6e = report.groups.find(g => g.groupKey === 'V6E');
    expect(v6e?.files).toHaveLength(3);
  });

  it('缺主文件与多主文件分组', () => {
    const report = buildGovernanceReport(infos, meta);
    // 大拿T1 组没有任何主文件
    expect(report.missingPrimaryGroups.map(g => g.groupKey)).toContain('大拿T1');
    // V6E 组只有一个主文件，不算多主文件
    expect(report.multiPrimaryGroups).toHaveLength(0);

    const dup = buildGovernanceReport(
      [makeInfo({ fileName: 'V6E-23款-宁德38.64.json' }), makeInfo({ fileName: 'V6E-23款-宁德41.86.json' })],
      { 'V6E-23款-宁德38.64.json': { isPrimary: true }, 'V6E-23款-宁德41.86.json': { isPrimary: true } },
    );
    expect(dup.multiPrimaryGroups.map(g => g.groupKey)).toContain('V6E');
  });

  it('主文件建议：组内推荐已审核且参数最全的文件', () => {
    const report = buildGovernanceReport(infos, meta);
    const v6e = report.groups.find(g => g.groupKey === 'V6E');
    expect(v6e?.suggestedPrimary).toBe('V6E 宁德时代 38.64 DNC5037XXYBEVP1 Ⅱ.json');
  });

  it('驳回件自动识别', () => {
    const report = buildGovernanceReport(infos, meta);
    expect(report.rejectedFiles.map(i => i.fileName)).toEqual(['V6E-23款-宁德38.64.json']);
  });

  it('疑似重复：同车辆型号/公告号聚簇（含 ZR 重报对）', () => {
    const zrFiles = [
      makeInfo({ fileName: '智云S300 宁德时代 100.46 SX5045XXYBEV341N Ⅰ (ZR202403220001).json', vehicleModel: 'SX5045XXYBEV341N', announceNos: ['SX5045XXYBEV341N'] }),
      makeInfo({ fileName: '智云S300 宁德时代 100.46 SX5045XXYBEV341N Ⅰ (ZR202405150004).json', vehicleModel: 'SX5045XXYBEV341N', announceNos: ['SX5045XXYBEV341N'] }),
      makeInfo({ fileName: '无关车型.json', vehicleModel: 'OTHER1' }),
    ];
    const report = buildGovernanceReport(zrFiles, {});
    expect(report.duplicateClusters).toHaveLength(1);
    expect(report.duplicateClusters[0].fileNames).toHaveLength(2);
    expect(report.duplicateClusters[0].keys).toContain('SX5045XXYBEV341N');
  });

  it('命名不规范：名称未包含公告号', () => {
    const report = buildGovernanceReport(infos, meta);
    expect(report.namingNonCompliant.some(n => n.name === 'V6E-23款-宁德38.64.json')).toBe(true);
  });
});

describe('buildAdoptPrimaryMeta', () => {
  const group = (files: { fileName: string; isPrimary?: boolean }[], suggested: string | null) => ({
    groupKey: 'G',
    files: files.map(f => ({
      info: makeInfo({ fileName: f.fileName }),
      meta: { isPrimary: f.isPrimary },
      groupKey: 'G',
    })),
    suggestedPrimary: suggested,
    currentPrimary: files.find(f => f.isPrimary)?.fileName ?? null,
  });

  it('采纳建议：设置新主文件并清除旧主文件', () => {
    const metaMap = { 'old.json': { isPrimary: true, status: 'superseded' as const } };
    const g = group(
      [
        { fileName: 'old.json', isPrimary: true },
        { fileName: 'new.json' },
      ],
      'new.json',
    );
    const next = buildAdoptPrimaryMeta(metaMap, [g]);
    expect(next['new.json']?.isPrimary).toBe(true);
    expect(next['old.json']?.isPrimary).toBeUndefined();
    expect(next['old.json']?.status).toBe('superseded'); // 其他标注保留
  });

  it('旧主文件只剩空标注时整个条目删除', () => {
    const metaMap = { 'old.json': { isPrimary: true } };
    const g = group([{ fileName: 'old.json', isPrimary: true }, { fileName: 'new.json' }], 'new.json');
    const next = buildAdoptPrimaryMeta(metaMap, [g]);
    expect(next['old.json']).toBeUndefined();
  });

  it('无建议主文件的组不动', () => {
    const metaMap = { 'a.json': { isPrimary: true } };
    const g = group([{ fileName: 'a.json', isPrimary: true }], null);
    expect(buildAdoptPrimaryMeta(metaMap, [g])).toEqual(metaMap);
  });
});
