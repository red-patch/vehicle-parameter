import { describe, expect, it } from 'vitest';
import { parseBatchTagInput, buildBatchTagUpdates } from '../assetTagBatch';

describe('parseBatchTagInput', () => {
  it('按中英文逗号、顿号、空白分隔并去空', () => {
    expect(parseBatchTagInput('公告数据, 人工维护、EV\n纯电\t混动')).toEqual([
      '公告数据',
      '人工维护',
      'EV',
      '纯电',
      '混动',
    ]);
  });

  it('去重且保持首次出现顺序', () => {
    expect(parseBatchTagInput('EV 纯电 EV,纯电')).toEqual(['EV', '纯电']);
  });

  it('空输入与纯分隔符返回空数组', () => {
    expect(parseBatchTagInput('')).toEqual([]);
    expect(parseBatchTagInput('  ，, 、\n ')).toEqual([]);
  });

  it('保留标签内的非分隔字符（不 trim 内部）', () => {
    expect(parseBatchTagInput('  2026款 EV  ')).toEqual(['2026款', 'EV']);
  });
});

describe('buildBatchTagUpdates', () => {
  it('合并去重，已有标签顺序在前', () => {
    const current = { 'a.json': ['公告数据', 'EV'] };
    const updates = buildBatchTagUpdates(current, ['a.json'], ['EV', '人工维护']);
    expect(updates).toEqual({ 'a.json': ['公告数据', 'EV', '人工维护'] });
  });

  it('无已有标签的资产从空列表开始合并', () => {
    const updates = buildBatchTagUpdates({}, ['b.json'], ['公告数据']);
    expect(updates).toEqual({ 'b.json': ['公告数据'] });
  });

  it('多个文件互不影响，只返回有变化的条目', () => {
    const current = {
      'a.json': ['EV'],
      'b.json': ['公告数据'],
      'c.json': [],
    };
    const updates = buildBatchTagUpdates(current, ['a.json', 'b.json', 'c.json'], ['EV']);
    // a.json 已包含 EV（无变化不返回）；b/c 新增 EV
    expect(updates).toEqual({ 'b.json': ['公告数据', 'EV'], 'c.json': ['EV'] });
  });

  it('新增列表为空时返回空对象', () => {
    expect(buildBatchTagUpdates({ 'a.json': ['EV'] }, ['a.json'], [])).toEqual({});
  });

  it('不修改传入的 currentTags（纯函数）', () => {
    const current = { 'a.json': ['EV'] };
    buildBatchTagUpdates(current, ['a.json'], ['新标签']);
    expect(current).toEqual({ 'a.json': ['EV'] });
  });
});

describe('buildBatchTagUpdates 互斥组', () => {
  // 「来源」类互斥组：组内标签互斥，新增即替换
  const sourceSet = ['公告数据', '数据体检', '工作区导入', '人工维护'];
  const options = { exclusiveGroupTags: [sourceSet] };

  it('新增互斥组标签时替换组内已有标签，组外标签保留', () => {
    const current = { 'a.json': ['公告数据', 'EV'] };
    const updates = buildBatchTagUpdates(current, ['a.json'], ['人工维护'], options);
    expect(updates).toEqual({ 'a.json': ['EV', '人工维护'] });
  });

  it('资产已持有该标签时不产生更新条目', () => {
    const current = { 'a.json': ['人工维护'] };
    expect(buildBatchTagUpdates(current, ['a.json'], ['人工维护'], options)).toEqual({});
  });

  it('组内一次输入多个标签时 last-wins（与单卡片 TagSelector 一致）', () => {
    const current = { 'a.json': ['EV'] };
    const updates = buildBatchTagUpdates(current, ['a.json'], ['公告数据', '人工维护'], options);
    expect(updates).toEqual({ 'a.json': ['EV', '人工维护'] });
  });

  it('本轮未涉及互斥组时，组内已有标签原样保留', () => {
    const current = { 'a.json': ['公告数据'] };
    const updates = buildBatchTagUpdates(current, ['a.json'], ['EV'], options);
    expect(updates).toEqual({ 'a.json': ['公告数据', 'EV'] });
  });

  it('替换为不同标签但结果长度相同时也能识别为变化', () => {
    const updates = buildBatchTagUpdates({ 'a.json': ['公告数据', 'X'] }, ['a.json'], ['人工维护'], options);
    expect(updates).toEqual({ 'a.json': ['X', '人工维护'] });
  });

  it('多个互斥组各自独立替换', () => {
    const current = { 'a.json': ['公告数据', '大面'] };
    const updates = buildBatchTagUpdates(
      current,
      ['a.json'],
      ['人工维护', '小卡'],
      { exclusiveGroupTags: [sourceSet, ['大面', '小卡']] }
    );
    expect(updates).toEqual({ 'a.json': ['人工维护', '小卡'] });
  });
});
