import { describe, expect, it } from 'vitest';
import { buildEnumRows } from '../enumImportRowMapping';

/**
 * 这些用例锁住 EnumImportModal 的**既有**表头/行映射行为，供 P2-4 迁移做等价性对照。
 *
 * 其中「空表头导致后续列错位」是一条**已存在的缺陷**，不是本文件认可的行为：
 * 迁移 Rust read_workbook → AOA 时要求输出与迁移前逐字节一致，故此处刻意复刻。
 * 修它需要单独提交（见下方 it 的说明），不要顺手改这里去"修好"。
 */
describe('buildEnumRows（复刻 EnumImportModal 既有映射）', () => {
    it('普通表头：按列对齐', () => {
        const { headers, rows } = buildEnumRows([['属性名称', '属性值'], ['a', '1'], ['b', '2']], 2, 3);
        expect(headers).toEqual(['属性名称', '属性值']);
        expect(rows).toEqual([
            { 属性名称: 'a', 属性值: '1' },
            { 属性名称: 'b', 属性值: '2' },
        ]);
    });

    it('空表头跳过 → 后续列错位（既有缺陷，刻意保留）', () => {
        // 表头 ['A','','C'] + 数据 ['a1','b1','c1']
        // headers 只收非空 → ['A','C']，随后 c < headers.length 截断，
        // 于是 C 列读到的是 b1，c1 丢失。这是迁移前就有的行为。
        const { headers, rows } = buildEnumRows([['A', '', 'C'], ['a1', 'b1', 'c1']], 3, 2);
        expect(headers).toEqual(['A', 'C']);
        expect(rows).toEqual([{ A: 'a1', C: 'b1' }]);
    });

    it('数值单元格被字符串化（下游一律 String(...) 消费，故等价）', () => {
        const { rows } = buildEnumRows([['k'], [1.5]], 1, 2);
        expect(rows).toEqual([{ k: '1.5' }]);
    });

    it('全空行被丢弃', () => {
        const { rows } = buildEnumRows([['k'], ['v'], [''], [null]], 1, 4);
        expect(rows).toEqual([{ k: 'v' }]);
    });
});
