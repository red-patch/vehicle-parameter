export interface VehicleParameter {
    id: string; // 唯一标识，通常是参数名或参数名+分组
    group: string; // 分组/类别
    name: string; // 参数名
    value: string | number; // 参数值
    rowCheck?: string; // 行是否需要核对(保留原字段概念)
    originSheet?: string; // 来源 Sheet 页名称
    productName?: string; // 产品名称 (列头)
    updatedAt?: string; // (V5.4 追加) 参数修改的最后时间记录戳
}

export interface SheetData {
    fileName: string;
    data: VehicleParameter[];
    rawHeaders: string[];
}

export type UpgradeDecision = 'keep_old' | 'use_new' | 'pending';
export type AssetUpgradeCategory = 'same' | 'new_field' | 'fill_empty' | 'conflict' | 'old_only';

export interface AssetUpgradeItem {
    key: string;
    fieldName: string;
    group: string;
    oldValue: string;
    newValue: string;
    category: AssetUpgradeCategory;
    decision: UpgradeDecision;
    required: boolean;
    oldParameter: VehicleParameter | null;
    newParameter: VehicleParameter | null;
}

export interface AssetUpgradeDraft {
    assetFileName: string;
    assetProductName: string;
    importedFileName: string;
    items: AssetUpgradeItem[];
    summary: {
        same: number;
        newField: number;
        fillEmpty: number;
        conflict: number;
        oldOnly: number;
    };
}

export interface DiffResult {
    added: VehicleParameter[];
    removed: VehicleParameter[];
    modified: {
        id: string;
        oldParam: VehicleParameter;
        newParam: VehicleParameter;
    }[];
    unchanged: VehicleParameter[];
}

export interface MatchItem {
    id: string; // Unique ID (e.g. Requirement Row Index)
    requirementName: string; // The field name in the bidding requirement
    matchedParam: VehicleParameter | null; // The matched parameter from our library
    confidence: number; // 0-1 score
    isManual: boolean; // If true, user manually selected this
    manualValue?: string; // V3.0: 手动输入的参数值（用于库中不存在的情况）
}

export type RepairSourceModule = 'compare' | 'smart_fill' | 'multi_vehicle';
export type RepairReason = 'diff' | 'unmatched' | 'enum_mismatch' | 'empty' | 'manual';

export interface RepairContext {
    productName: string;
    sourceFileName: string;
    fieldName?: string;
    sourceModule: RepairSourceModule;
    reason: RepairReason;
    sourceLabel: string;
}

// V1.3: 对比模式
// 'content' - 按字段内容对比（根据 name 匹配，支持同义词）- 默认模式
// 'miit' - 仅公告号数据对比（以工信部数据为模版）
export type CompareMode = 'content' | 'miit';

// Excel 预览数据（每个 Sheet）
export interface SheetPreview {
    sheetName: string;
    rows: string[][];       // 原始二维数组数据（前 100 行）
    totalRows: number;      // 实际总行数
    totalCols: number;      // 实际总列数
    merges: { s: { r: number; c: number }; e: { r: number; c: number } }[]; // 合并单元格
}

// 列角色
export type ColumnRole = 'name' | 'group' | 'product' | 'skip';

// 用户自定义解析配置（按 Sheet）
export interface SheetParseConfig {
    sheetName: string;
    headerRows: number[];      // 表头行索引（0-based），如 [0, 1]
    dataStartRow: number;      // 数据起始行索引（0-based）
    nameColIndex: number;      // 参数名列索引
    groupColIndex: number;     // 分组列索引，-1 表示无
    productColumns: { index: number; name: string }[]; // 产品值列
}
