import { describe, expect, it } from 'vitest';
import { WorkbookHandleStore } from '../workbookHandles';
import type * as XLSX from 'xlsx';

/** workbook 只当不透明载荷用，这里用最小桩对象 */
const wb = (tag: string) => ({ SheetNames: [tag], Sheets: {} } as unknown as XLSX.WorkBook);

describe('WorkbookHandleStore', () => {
    it('opens and reads back a handle', () => {
        const s = new WorkbookHandleStore(3);
        const id = s.open(wb('a'), 'a.xlsx');
        expect(s.get(id)?.fileName).toBe('a.xlsx');
        expect(s.size).toBe(1);
    });

    it('evicts the least-recently-used entry beyond capacity', () => {
        const s = new WorkbookHandleStore(3);
        const a = s.open(wb('a'), 'a.xlsx');
        const b = s.open(wb('b'), 'b.xlsx');
        const c = s.open(wb('c'), 'c.xlsx');
        // 触碰 a，使其成为最近使用；此时 b 是最久未用
        expect(s.get(a)).toBeDefined();
        const d = s.open(wb('d'), 'd.xlsx');
        expect(s.size).toBe(3);
        expect(s.get(a)).toBeDefined(); // 被触碰过，保留
        expect(s.get(b)).toBeUndefined(); // LRU 被驱逐
        expect(s.get(c)).toBeDefined();
        expect(s.get(d)).toBeDefined();
    });

    it('release is idempotent (double release / unknown id do not throw)', () => {
        const s = new WorkbookHandleStore(3);
        const id = s.open(wb('a'), 'a.xlsx');
        expect(s.release(id)).toBe(true);
        expect(s.release(id)).toBe(false);
        expect(s.release(9999)).toBe(false);
        expect(s.size).toBe(0);
    });

    it('get on an unknown id returns undefined rather than throwing', () => {
        const s = new WorkbookHandleStore(3);
        expect(s.get(1234)).toBeUndefined();
    });

    it('hands out distinct ids for repeated opens of the same file', () => {
        const s = new WorkbookHandleStore(3);
        const first = s.open(wb('a'), 'a.xlsx');
        const second = s.open(wb('a'), 'a.xlsx');
        expect(first).not.toBe(second);
        expect(s.size).toBe(2);
    });

    it('defaults capacity to 3', () => {
        const s = new WorkbookHandleStore();
        s.open(wb('a'), 'a.xlsx');
        s.open(wb('b'), 'b.xlsx');
        s.open(wb('c'), 'c.xlsx');
        expect(s.size).toBe(3);
        s.open(wb('d'), 'd.xlsx'); // 第 4 个触发驱逐，仍应保持 3
        expect(s.size).toBe(3);
    });

    it('rejects a capacity below 1 (would return a dangling id)', () => {
        // capacity 0 时 open 存完即驱逐，返回的 id 永远取不到东西——直接拒绝而非静默
        expect(() => new WorkbookHandleStore(0)).toThrow(/容量/);
        expect(() => new WorkbookHandleStore(-1)).toThrow(/容量/);
    });
});
