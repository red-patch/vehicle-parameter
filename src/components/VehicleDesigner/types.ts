// 整车设计器参数：L4 底盘/上装参数体系的唯一权威类型。
// 派生字段（cargoHeight 等）由 deriveParams 计算，输入侧为完整 VehicleParams。
export interface VehicleParams {
  // 输入参数
  chassisLength: number;
  overallLength: number;
  overallWidth: number;
  overallHeight: number;
  sensorTopHeight: number;
  frontModuleLength: number;
  wheelbase: number;
  trackWidth: number;
  wheelRadius: number;
  chassisGroundClearance: number;
  platformHeight: number;
  chassisOverhangFront: number;
  chassisWidth: number;
  tireSpec: string;
  cargoLength: number;
  cargoWidth: number;
  cargoWallThickness: number;
  frontMinGroundClearance: number;
  rearMinGroundClearance: number;
  cargoGap: number;
  // 姿态角（既作输入也作派生，双向驱动）
  approachAngle: number;
  departureAngle: number;
  // 派生参数
  cargoHeight: number;
  frontModuleHeight: number;
  chassisOverhangRear: number;
  cargoRearOverhang: number;
  innerCargoLength: number;
  innerCargoWidth: number;
  innerCargoHeight: number;
  innerCargoVolume: number;
  actualOverallLength: number;
  // 可选：前视 SVG 读取，INITIAL_PARAMS 未定义
  frontModuleWidth?: number;
  chassisHeight?: number;
}