import type { VehicleParams } from './types';

export const toRad = (deg: number): number => (deg * Math.PI) / 180;
export const toDeg = (rad: number): number => (rad * 180) / Math.PI;

export const deriveParams = (baseParams: VehicleParams): VehicleParams => {
  const overallWidth = Math.max(baseParams.cargoWidth, baseParams.chassisWidth || baseParams.overallWidth);
  const cargoHeight = baseParams.overallHeight - baseParams.platformHeight;
  const frontModuleHeight = baseParams.sensorTopHeight - baseParams.platformHeight;
  const chassisOverhangRear = baseParams.chassisLength - baseParams.chassisOverhangFront - baseParams.wheelbase;
  const chassisEndPos = baseParams.chassisLength;
  const cargoEndPos = baseParams.frontModuleLength + baseParams.cargoGap + baseParams.cargoLength;
  const cargoRearOverhang = Math.max(0, cargoEndPos - chassisEndPos);
  const overallLength = Math.max(chassisEndPos, cargoEndPos);
  const innerCargoLength = Math.max(0, baseParams.cargoLength - 2 * baseParams.cargoWallThickness);
  const innerCargoWidth = Math.max(0, baseParams.cargoWidth - 2 * baseParams.cargoWallThickness);
  const innerCargoHeight = Math.max(0, cargoHeight - 2 * baseParams.cargoWallThickness);
  const innerCargoVolume = parseFloat(((innerCargoLength * innerCargoWidth * innerCargoHeight) / 1e9).toFixed(2));

  return {
    ...baseParams,
    overallWidth,
    overallLength,
    actualOverallLength: overallLength,
    cargoHeight,
    frontModuleHeight,
    chassisOverhangRear,
    cargoRearOverhang,
    innerCargoLength,
    innerCargoWidth,
    innerCargoHeight,
    innerCargoVolume,
  };
};

export const INITIAL_PARAMS: VehicleParams = deriveParams({
  chassisLength: 3700,
  overallLength: 3700,
  overallWidth: 1500,
  overallHeight: 2200,
  sensorTopHeight: 2000,
  frontModuleLength: 250,
  wheelbase: 2200,
  trackWidth: 1300,
  wheelRadius: 364,
  chassisGroundClearance: 250,
  platformHeight: 700,
  chassisOverhangFront: 800,
  chassisWidth: 1400,
  tireSpec: '215/75R16LT',
  cargoLength: 4050,
  cargoWidth: 1600,
  chassisOverhangRear: 1300,
  approachAngle: 28,
  departureAngle: 18,
  cargoWallThickness: 30,
  frontMinGroundClearance: 450,
  rearMinGroundClearance: 450,
  innerCargoVolume: 0,
  innerCargoLength: 0,
  innerCargoWidth: 0,
  innerCargoHeight: 0,
  cargoRearOverhang: 0,
  cargoGap: 10,
  cargoHeight: 0,
  frontModuleHeight: 0,
  actualOverallLength: 0,
});