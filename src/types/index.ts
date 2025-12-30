export interface VehicleParameter {
    id: string; // 唯一标识，通常是参数名或参数名+分组
    group: string; // 分组/类别
    name: string; // 参数名
    value: string | number; // 参数值
    rowCheck?: string; // 行是否需要核对(保留原字段概念)
    originSheet?: string; // 来源 Sheet 页名称
    productName?: string; // 产品名称 (列头)
}

export interface SheetData {
    fileName: string;
    data: VehicleParameter[];
    rawHeaders: string[];
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
}

