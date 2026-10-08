import type * as XLSX from 'xlsx';

/**
 * workbook handle 存储（内存治理 P2）。
 *
 * 背景：完整 WorkBook 跨 worker→主线程结构化克隆实测 32.2MB（478×504 / 240912 单元格），
 * 而消费者真正需要的 SheetData 是 21.6MB、AOA 只要 2.0MB。本模块让 workbook 留在
 * 解析侧（worker 或主线程 fallback），主线程只拿一个 id。
 *
 * LRU 上限是**安全网**：调用方（组件卸载/弹窗关闭）本应显式 release，
 * 上限保证漏放时内存有界，而不是无声增长。
 */
export interface WorkbookHandleEntry {
    workbook: XLSX.WorkBook;
    fileName: string;
}

export class WorkbookHandleStore {
    private readonly entries = new Map<number, WorkbookHandleEntry>();
    private readonly capacity: number;
    private nextId = 1;

    // 注意：tsconfig.app.json 开了 erasableSyntaxOnly，禁止构造器参数属性
    // （constructor(private readonly capacity = 3) 会报 TS1294），必须显式声明字段。
    // capacity < 1 会让 open 存完即驱逐、返回一个取不到东西的悬挂 id，故直接拒绝。
    constructor(capacity = 3) {
        if (capacity < 1) throw new Error(`WorkbookHandleStore 容量必须 ≥ 1，收到 ${capacity}`);
        this.capacity = capacity;
    }

    /** 存入并返回 handle id；超出容量时驱逐最久未用的一项 */
    open(workbook: XLSX.WorkBook, fileName: string): number {
        const id = this.nextId++;
        this.entries.set(id, { workbook, fileName });
        this.evict();
        return id;
    }

    /** 读取并标记为最近使用；不存在返回 undefined */
    get(id: number): WorkbookHandleEntry | undefined {
        const entry = this.entries.get(id);
        if (!entry) return undefined;
        // Map 保持插入序：重插以刷新 LRU 位置
        this.entries.delete(id);
        this.entries.set(id, entry);
        return entry;
    }

    /** 释放；返回是否确实释放了（重复释放/未知 id → false，不抛错） */
    release(id: number): boolean {
        return this.entries.delete(id);
    }

    get size(): number {
        return this.entries.size;
    }

    private evict(): void {
        while (this.entries.size > this.capacity) {
            const oldest = this.entries.keys().next().value as number | undefined;
            if (oldest === undefined) return;
            this.entries.delete(oldest);
        }
    }
}
