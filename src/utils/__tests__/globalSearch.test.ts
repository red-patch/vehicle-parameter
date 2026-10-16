import { describe, it, expect } from 'vitest';
import {
  buildGlobalSearchIndex,
  searchAllDomains,
  SCORE_EXACT,
  SCORE_PREFIX,
  SCORE_INCLUDES,
  type GlobalSearchIndex,
} from '../globalSearch';

/** 经归一化构造单条检索条目（与真实链路一致：keywords 一律小写，供 includes 用） */
const makeItem = (id: string, primary: string, secondary: string, keywords: string[]): {
  id: string; primary: string; secondary: string; keywords: string[];
} => ({ id, primary, secondary, keywords: keywords.map(k => k.toLowerCase()) });

// 共享 fixture（AGENTS.md：mock 数组不逐次新建，用模块级共享态）
const index: GlobalSearchIndex = buildGlobalSearchIndex({
  assets: [
    makeItem('f1.json', 'V6E 客运版', '上汽大通 V6E.json', ['V6E', '客运', '上汽大通', 'BM2024A001']),
    makeItem('f2.json', '白犀牛R3', '白犀牛R3.json', ['白犀牛', 'R3', '无人车']),
    makeItem('f3.json', 'V6E 货运版', 'V6E.json', ['V6E', '货运']),
  ],
  announcements: [
    makeItem('A1.json', 'BM2024A001', 'V6E · 第389批', ['BM2024A001', 'V6E', '389']),
    makeItem('A2.json', 'ZR2025001', '白犀牛R3 · 第390批', ['ZR2025001', '白犀牛R3', '390']),
  ],
  regulations: [
    makeItem('GB 44495', 'GB 44495', '汽车整车信息安全技术要求', ['GB 44495', '信息安全', '整车']),
    makeItem('GB/T 18386.1', 'GB/T 18386.1', '电动汽车能量消耗和续驶里程试验方法 第1部分', ['18386', '续驶里程', '能耗']),
  ],
});

describe('buildGlobalSearchIndex / searchAllDomains', () => {
  it('空关键字返回空结果（不区分大小写由用例覆盖）', () => {
    const results = searchAllDomains(index, '');
    expect(results.assets.total).toBe(3);
    expect(results.assets.items).toHaveLength(0);
    expect(results.announcements.total).toBe(2);
    expect(results.regulations.total).toBe(2);
  });

  it('资产域：按 primary 前缀命中优先于包含命中', () => {
    const results = searchAllDomains(index, 'V6E');
    expect(results.assets.total).toBe(2);
    expect(results.assets.items[0].id).toBe('f1.json'); // 前缀 60 分排最前
    expect(results.assets.items.map(i => i.id)).toContain('f3.json');
  });

  it('资产域：关键字（标签/公告号/主机厂）也参与检索', () => {
    expect(searchAllDomains(index, '上汽大通').assets.total).toBe(1);
    expect(searchAllDomains(index, 'bm2024a001').assets.total).toBe(1); // 小写输入命中大写公告号
    expect(searchAllDomains(index, '无人车').assets.total).toBe(1);
  });

  it('公告域：公告号归一化（去空白 + 大写）后精确命中', () => {
    const results = searchAllDomains(index, ' bm2024a001 ');
    expect(results.announcements.total).toBe(1);
    expect(results.announcements.items[0].score).toBeGreaterThanOrEqual(SCORE_EXACT); // 精确命中 ≥ 包含命中
  });

  it('法规域：标准号含部分号，全号可命中；编号片段可命中', () => {
    expect(searchAllDomains(index, '18386.1').regulations.total).toBe(1);
    expect(searchAllDomains(index, 'GB 44495').regulations.total).toBe(1);
  });

  it('三域同查：一个关键字跨域各出各的结果', () => {
    const results = searchAllDomains(index, '白犀牛');
    expect(results.assets.total).toBe(1);
    expect(results.announcements.total).toBe(1);
    expect(results.regulations.total).toBe(0);
  });

  it('无命中关键字返回各域空列表', () => {
    const results = searchAllDomains(index, '不存在的东西xyz');
    expect(results.assets.items).toHaveLength(0);
    expect(results.announcements.items).toHaveLength(0);
    expect(results.regulations.items).toHaveLength(0);
    expect(results.assets.total).toBe(0);
  });
});

describe('searchAllDomains 打分细节', () => {
  it('精确命中分数 > 前缀 > 包含', () => {
    const r = searchAllDomains(index, 'BM2024A001');
    // 公告域: BM2024A001 是 primary 归一化精确命中
    expect(r.announcements.items[0].score).toBe(SCORE_EXACT);
    // 资产域: keywords 里包含 BM2024A001
    expect(r.assets.items[0].score).toBe(SCORE_INCLUDES);
  });

  it('前缀命中 primary 得 60', () => {
    const r = searchAllDomains(index, 'V6E 客');
    expect(r.assets.items[0].score).toBe(SCORE_PREFIX);
  });

  it('结果按分数降序', () => {
    const r = searchAllDomains(index, 'V6E');
    const scores = r.assets.items.map(i => i.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe('buildGlobalSearchIndex 空输入', () => {
  it('三域全空也能建索引（未配置场景）', () => {
    const empty = buildGlobalSearchIndex({ assets: [], announcements: [], regulations: [] });
    const r = searchAllDomains(empty, 'V6E');
    expect(r.assets.total).toBe(0);
    expect(r.announcements.total).toBe(0);
    expect(r.regulations.total).toBe(0);
  });
});
