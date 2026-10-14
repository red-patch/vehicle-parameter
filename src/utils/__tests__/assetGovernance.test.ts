import { describe, it, expect } from 'vitest';
import type { AssetFileInfo } from '../assetManager';
import {
  buildGovernanceReport,
  buildGroupRenameMeta,
  collectPrimaryMeta,
  computeCarVersionGroups,
  deriveCarIdentityKey,
  deriveVehicleGroupKey,
  normalizeGroupKey,
  pickGroupAlias,
  resolveVehicleGroupKey,
  sanitizeGroupName,
  sortGroupFiles,
  type GovernanceFileEntry,
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

describe('resolveVehicleGroupKey / normalizeGroupKey', () => {
  it('无 groupName 时回落文件名推导', () => {
    expect(resolveVehicleGroupKey({ fileName: '白犀牛R3_20260309.json' }, undefined)).toBe('R3');
    expect(resolveVehicleGroupKey({ fileName: '白犀牛R3_20260309.json' }, {})).toBe('R3');
  });

  it('有 groupName 时以显示名为准（不再被推导剥离品牌/变体）', () => {
    expect(resolveVehicleGroupKey({ fileName: '白犀牛R3_20260309.json' }, { groupName: '白犀牛 R3' })).toBe('白犀牛R3');
    expect(resolveVehicleGroupKey({ fileName: 'V6E（客运版）-JHC6480BEV22.json' }, { groupName: 'V6E（客运版）' })).toBe('V6E（客运版）');
  });

  it('规范化：去空白 + 拉丁大写，与推导键同口径', () => {
    expect(normalizeGroupKey(' 龙耀 8s ')).toBe('龙耀8S');
    expect(normalizeGroupKey('白犀牛 r3')).toBe('白犀牛R3');
  });

  it('同名必同键：显示名与另一组推导键一致时归入同组', () => {
    // 组A 的文件推导键是 8S，人工显示名叫「龙耀8S」；组B 的文件推导键正是「龙耀8S」
    const keyA = resolveVehicleGroupKey({ fileName: '金龙8S-XMQ5035XXYBEVL04.json' }, { groupName: '龙耀8S' });
    const keyB = resolveVehicleGroupKey({ fileName: '龙耀8S 宁德时代 53.58 XMQ5035XXYBEVL02 Ⅱ.json' }, {});
    expect(keyA).toBe(keyB);
  });
});

describe('deriveCarIdentityKey / computeCarVersionGroups（ADR-0003 每车版本链）', () => {
  const entry = (info: AssetFileInfo, meta = {}, groupKey = 'G'): GovernanceFileEntry => ({ info, meta, groupKey });

  it('身份键 = 公告号+准入编号；ZR 不同即不同车', () => {
    const a = makeInfo({ fileName: 'a.json', announceNos: ['SH5047XXYMFEVMZ5'], admissionNos: ['ZR2025'] });
    const b = makeInfo({ fileName: 'b.json', announceNos: ['SH5047XXYMFEVMZ5'], admissionNos: ['ZR2026'] });
    const same = makeInfo({ fileName: 'c.json', announceNos: ['sh5047xxymfevmz5'], admissionNos: ['ZR2025'] });
    expect(deriveCarIdentityKey(a, a.announceNos, 'V6E')).not.toBe(deriveCarIdentityKey(b, b.announceNos, 'V6E'));
    // 大小写/空白归一后同车
    expect(deriveCarIdentityKey(a, a.announceNos, 'V6E')).toBe(deriveCarIdentityKey(same, same.announceNos, 'V6E'));
  });

  it('无公告号时身份键 = 车型组 + 产品名', () => {
    const a = makeInfo({ fileName: 'a.json', productName: 'X3' });
    expect(deriveCarIdentityKey(a, [], 'X3')).toBe(deriveCarIdentityKey(a, [], 'X3'));
    const b = makeInfo({ fileName: 'b.json', productName: 'X3 Pro' });
    expect(deriveCarIdentityKey(a, [], 'X3')).not.toBe(deriveCarIdentityKey(b, [], 'X3'));
  });

  it('链头 = 活跃版本中 updatedAt 最新；superseded/deprecated 不参与', () => {
    const files = [
      entry(makeInfo({ fileName: 'old.json', announceNos: ['AAA1'], updatedAt: '2026-01-01T00:00:00Z' }), { status: 'superseded' }),
      entry(makeInfo({ fileName: 'new.json', announceNos: ['AAA1'], updatedAt: '2026-09-01T00:00:00Z' })),
      entry(makeInfo({ fileName: 'mid.json', announceNos: ['AAA1'], updatedAt: '2026-05-01T00:00:00Z' })),
    ];
    const cars = computeCarVersionGroups(files, i => i.announceNos);
    const car = cars.get(deriveCarIdentityKey(files[1].info, ['AAA1'], 'G'))!;
    expect(car.files).toHaveLength(3);
    expect(car.activeFiles).toHaveLength(2);
    expect(car.latest?.info.fileName).toBe('new.json');
  });

  it('同车多活跃版本 = 版本链未收敛（latest 链头仍按 updatedAt 定，不看参数多少）', () => {
    const files = [
      entry(makeInfo({ fileName: 'full.json', announceNos: ['AAA1'], filledParams: 100, updatedAt: '2026-01-01T00:00:00Z' })),
      entry(makeInfo({ fileName: 'fresh.json', announceNos: ['AAA1'], filledParams: 10, updatedAt: '2026-09-01T00:00:00Z' })),
    ];
    const report = buildGovernanceReport(files.map(f => f.info), {});
    expect(report.unconvergedCars).toHaveLength(1);
    expect(report.unconvergedCars[0].latestFileName).toBe('fresh.json');
    expect(report.latestFileNames).toEqual(['fresh.json']);
  });

  it('不同电量（不同公告号）是两辆车，各出链头，不算未收敛', () => {
    const files = [
      entry(makeInfo({ fileName: 'v6e-38.json', announceNos: ['AAA1'], updatedAt: '2026-01-01T00:00:00Z' })),
      entry(makeInfo({ fileName: 'v6e-41.json', announceNos: ['BBB2'], updatedAt: '2026-02-01T00:00:00Z' })),
    ];
    const report = buildGovernanceReport(files.map(f => f.info), {});
    expect(report.unconvergedCars).toHaveLength(0);
    expect(report.latestFileNames.sort()).toEqual(['v6e-38.json', 'v6e-41.json']);
  });
});

describe('buildGovernanceReport', () => {
  const infos = [
    makeInfo({ fileName: 'V6E 宁德时代 38.64 DNC5037XXYBEVP1 Ⅱ.json', vehicleModel: 'DNC5037XXYBEVP1', hasAdmissionInfo: true, approvalStatus: '已审核', filledParams: 50 }),
    makeInfo({ fileName: 'V6E（客运版）-JHC6480BEV22.json', announceNos: ['JHC6480BEV22'] }),
    makeInfo({ fileName: 'V6E-23款-宁德38.64.json', announceNos: ['ZZ999'], approvalStatus: '驳回', hasAdmissionInfo: true }),
    makeInfo({ fileName: '大拿T1 宁德时代 86.55 SH5047XXYMFEVMZ1 Ⅱ.json', vehicleModel: 'SH5047XXYMFEVMZ1', hasAdmissionInfo: true, approvalStatus: '已审核' }),
  ];
  const meta = {};

  it('分组统计', () => {
    const report = buildGovernanceReport(infos, meta);
    expect(report.totalFiles).toBe(4);
    expect(report.totalGroups).toBe(2);
    const v6e = report.groups.find(g => g.groupKey === 'V6E');
    expect(v6e?.files).toHaveLength(3);
  });

  it('groupName 同名合并、异名拆分（显示名参与归组）', () => {
    const files = [
      makeInfo({ fileName: '金龙8S-XMQ5035XXYBEVL04.json' }),
      makeInfo({ fileName: '龙耀8S 宁德时代 53.58 XMQ5035XXYBEVL02 Ⅱ.json' }),
      makeInfo({ fileName: '龙耀8S 宁德时代 41.86 XMQ5035XXYBEVL02 Ⅱ.json' }),
    ];
    // 未改名：金龙8S 推导为 8S，独立成组
    expect(buildGovernanceReport(files, {}).totalGroups).toBe(2);

    // 改名为与既有组同名 → 自动合并
    const merged = buildGovernanceReport(files, { '金龙8S-XMQ5035XXYBEVL04.json': { groupName: '龙耀8S' } });
    expect(merged.totalGroups).toBe(1);
    expect(merged.groups[0].files).toHaveLength(3);

    // 改成不同名 → 从原组拆出（只剩 file2 一组、file1+file3 的龙耀8S 组）
    const split = buildGovernanceReport(files, {
      '金龙8S-XMQ5035XXYBEVL04.json': { groupName: '龙耀8S' },
      '龙耀8S 宁德时代 53.58 XMQ5035XXYBEVL02 Ⅱ.json': { groupName: '新名字' },
    });
    expect(split.totalGroups).toBe(2);
    expect(split.groups.find(g => g.groupKey === '新名字')?.files).toHaveLength(1);
    expect(split.groups.find(g => g.groupKey === '龙耀8S')?.files).toHaveLength(2);
  });

  it('版本链收敛：每车一份链头，无主文件概念', () => {
    const report = buildGovernanceReport(infos, meta);
    // 4 个文件 = 4 辆不同的车（公告号/身份各不同），各出一份链头
    expect(report.latestFileNames).toHaveLength(4);
    expect(report.unconvergedCars).toHaveLength(0);
    // groups 不再带主文件字段
    expect(report.groups[0]).not.toHaveProperty('suggestedPrimary');
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

describe('sortGroupFiles', () => {
  const e = (
    fileName: string,
    opts: { status?: 'superseded' | 'deprecated'; approval?: string; updatedAt?: string } = {},
  ) => ({
    info: makeInfo({ fileName, approvalStatus: opts.approval ?? null, updatedAt: opts.updatedAt ?? null }),
    meta: { status: opts.status },
    groupKey: 'G',
  });

  it('链头最前、历史其次、废弃沉底，同级按更新时间新→旧', () => {
    const files = [
      e('d.json', { status: 'deprecated' }),
      e('b.json', { updatedAt: '2026-09-01T00:00:00Z' }),
      e('a.json', { updatedAt: '2026-01-01T00:00:00Z' }),
      e('c.json', { status: 'superseded', updatedAt: '2026-05-01T00:00:00Z' }),
    ];
    // a 是链头（手动指定集合），即使时间旧也置顶
    expect(sortGroupFiles(files, new Set(['a.json'])).map(f => f.info.fileName)).toEqual(['a.json', 'b.json', 'c.json', 'd.json']);
  });

  it('无链头集合时活跃按更新时间新→旧，文件名兜底', () => {
    const files = [
      e('b-dev.json'),
      e('a-dev.json'),
    ];
    expect(sortGroupFiles(files).map(f => f.info.fileName)).toEqual(['a-dev.json', 'b-dev.json']);
  });
});

describe('sanitizeGroupName', () => {
  it('显示名与文件名解耦：只收尾空白、压缩连续空格，保留内部字符', () => {
    expect(sanitizeGroupName('  白犀牛 R3  ')).toBe('白犀牛 R3');
    expect(sanitizeGroupName('白犀牛  R3')).toBe('白犀牛 R3');
    expect(sanitizeGroupName('龙耀8S')).toBe('龙耀8S');
    expect(sanitizeGroupName('   ')).toBe('');
  });
});

describe('pickGroupAlias', () => {
  const e = (fileName: string, groupName?: string) => ({
    info: makeInfo({ fileName }),
    meta: groupName ? { groupName } : {},
    groupKey: 'R3',
  });

  it('真实案例：文件名已正确（白犀牛R3），别名覆盖裸推导键', () => {
    const files = [e('白犀牛R3_20260309.json', '白犀牛R3')];
    expect(pickGroupAlias(files, 'R3')).toBe('白犀牛R3');
  });

  it('取首个命中别名（组重命名会写入组内全部文件，通常只有一个值）', () => {
    const files = [
      e('白犀牛R3_a.json', '白犀牛R3'),
      e('白犀牛R3_b.json'),
    ];
    expect(pickGroupAlias(files, 'R3')).toBe('白犀牛R3');
  });

  it('无别名时回落推导键', () => {
    expect(pickGroupAlias([e('白犀牛R3_20260309.json')], 'R3')).toBe('R3');
    expect(pickGroupAlias([], 'R3')).toBe('R3');
  });
});

describe('collectPrimaryMeta（主文件 → 关键车型 迁移）', () => {
  it('收集 isPrimary 文件名并从 meta 清除，其余标注保留', () => {
    const metaMap = {
      'old.json': { isPrimary: true, status: 'superseded' as const },
      'solo.json': { isPrimary: true },
      'plain.json': { groupName: 'V6E' },
    };
    const { primaryFileNames, cleaned } = collectPrimaryMeta(metaMap);
    expect(primaryFileNames.sort()).toEqual(['old.json', 'solo.json']);
    expect(cleaned['old.json']).toEqual({ status: 'superseded' }); // 其他标注保留
    expect(cleaned['solo.json']).toBeUndefined(); // 只剩空标注时整个条目移除
    expect(cleaned['plain.json']).toEqual({ groupName: 'V6E' });
  });

  it('无 isPrimary 时原样返回', () => {
    const metaMap = { 'a.json': { groupName: 'X' } };
    const { primaryFileNames, cleaned } = collectPrimaryMeta(metaMap);
    expect(primaryFileNames).toEqual([]);
    expect(cleaned).toEqual(metaMap);
  });
});

describe('buildGroupRenameMeta（组重命名落盘，2026-10-14 新界面入口）', () => {
  const entry = (fileName: string, meta: Record<string, unknown> = {}): GovernanceFileEntry => ({
    info: makeInfo({ fileName }),
    meta: meta as GovernanceFileEntry['meta'],
    groupKey: 'V6E',
  });

  it('把新显示名写进组内每个文件（pickGroupAlias 取任一，故需全写）', () => {
    const files = [entry('a.json'), entry('b.json'), entry('c.json')];
    const { next, newKey, skipped } = buildGroupRenameMeta(files, 'V6E', '远程V6E', {});
    expect(skipped).toBe(false);
    expect(newKey).toBe('远程V6E');
    expect(next['a.json'].groupName).toBe('远程V6E');
    expect(next['b.json'].groupName).toBe('远程V6E');
    expect(next['c.json'].groupName).toBe('远程V6E');
  });

  it('保留既有标注（status/note/alias 不被清除）', () => {
    const meta = { 'a.json': { status: 'superseded' as const, note: '备注', alias: '短名' } };
    const files = [entry('a.json', meta['a.json'])];
    const { next } = buildGroupRenameMeta(files, 'V6E', '新名', meta);
    expect(next['a.json']).toEqual({ status: 'superseded', note: '备注', alias: '短名', groupName: '新名' });
  });

  it('空输入 / 纯空白 → skipped，不改 meta', () => {
    const meta = { 'a.json': { groupName: 'V6E' } };
    const { skipped, next } = buildGroupRenameMeta([entry('a.json')], 'V6E', '   ', meta);
    expect(skipped).toBe(true);
    expect(next).toBe(meta);
  });

  it('连续空格折叠、首尾去空（sanitizeGroupName 口径）', () => {
    const { newKey } = buildGroupRenameMeta([entry('a.json')], 'V6E', '  白犀牛   R3  ', {});
    expect(newKey).toBe('白犀牛 R3');
  });

  it('新名与原名规范化后同键（仅空白差异）→ skipped，不产生无意义落盘', () => {
    const { skipped } = buildGroupRenameMeta([entry('a.json')], 'V6E', ' V6E ', {});
    expect(skipped).toBe(true);
  });

  it('改名后归组键随之改变（组名参与归组，同名会与既有组合并）', () => {
    const { newKey } = buildGroupRenameMeta([entry('a.json')], 'V6E', '远程V6E', {});
    // 新键规范化 = 既有「远程V6E」组的归组键 → 触发合并
    expect(normalizeGroupKey(newKey)).toBe(normalizeGroupKey('远程V6E'));
  });

  it('不修改入参 metaMap（纯函数，返回新表）', () => {
    const meta = { 'a.json': { groupName: 'V6E' } };
    const { next } = buildGroupRenameMeta([entry('a.json')], 'V6E', '新名', meta);
    expect(meta['a.json'].groupName).toBe('V6E');
    expect(next).not.toBe(meta);
  });
});
