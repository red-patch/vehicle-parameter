import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { deriveParams, INITIAL_PARAMS, toRad, toDeg } from './deriveParams';
import { parseTireSpec, validateImportLines, parseConfigText } from './parseParams';
import type { VehicleParams } from './types';

const MAX_HISTORY = 50;

export type RatioStatus = 'warning' | 'normal';

export const useVehicleParams = () => {
  const [params, setParams] = useState<VehicleParams>(INITIAL_PARAMS);
  const [lastEditedKey, setLastEditedKey] = useState('approachAngle');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historyRef = useRef({ past: [] as VehicleParams[], future: [] as VehicleParams[] });
  const paramsRef = useRef<VehicleParams>(params);
  useEffect(() => {
    paramsRef.current = params;
  });

  const pushHistory = useCallback((snapshot: VehicleParams) => {
    const hist = historyRef.current;
    hist.past = [...hist.past, snapshot].slice(-MAX_HISTORY);
    hist.future = [];
    setCanUndo(hist.past.length > 0);
    setCanRedo(hist.future.length > 0);
  }, []);

  const undo = useCallback(() => {
    const hist = historyRef.current;
    if (hist.past.length === 0) return;
    const prevSnapshot = hist.past[hist.past.length - 1];
    hist.past = hist.past.slice(0, -1);
    hist.future = [params, ...hist.future];
    setCanUndo(hist.past.length > 0);
    setCanRedo(hist.future.length > 0);
    setParams(deriveParams(prevSnapshot));
  }, [params]);

  const redo = useCallback(() => {
    const hist = historyRef.current;
    if (hist.future.length === 0) return;
    const nextSnapshot = hist.future[0];
    hist.future = hist.future.slice(1);
    hist.past = [...hist.past, params];
    setCanUndo(hist.past.length > 0);
    setCanRedo(hist.future.length > 0);
    setParams(deriveParams(nextSnapshot));
  }, [params]);

  const handleChange = useCallback((key: keyof VehicleParams, value: number) => {
    const val = value;
    setLastEditedKey(key);
    pushHistory(paramsRef.current);
    setParams(prev => {
      const nextBase = { ...prev, [key]: val };
      const updates: Partial<VehicleParams> = { [key]: val };
      const chassisOverhangRear = nextBase.chassisLength - nextBase.chassisOverhangFront - nextBase.wheelbase;

      if (key === 'approachAngle' && val > 0) {
        updates.frontMinGroundClearance = Math.round(nextBase.chassisOverhangFront * Math.tan(toRad(val)));
      } else if (key === 'departureAngle' && val > 0) {
        updates.rearMinGroundClearance = Math.round(chassisOverhangRear * Math.tan(toRad(val)));
      } else if (key === 'frontMinGroundClearance') {
        const angle = toDeg(Math.atan(val / nextBase.chassisOverhangFront));
        updates.approachAngle = parseFloat(angle.toFixed(1));
      } else if (key === 'rearMinGroundClearance') {
        const angle = toDeg(Math.atan(val / chassisOverhangRear));
        updates.departureAngle = parseFloat(angle.toFixed(1));
      } else if (key === 'chassisOverhangFront') {
        const angle = toDeg(Math.atan(prev.frontMinGroundClearance / val));
        updates.approachAngle = parseFloat(angle.toFixed(1));
      } else if (key === 'chassisLength') {
        // 派生尺寸在下方 deriveParams 统一计算
      } else if (key === 'cargoRearOverhang') {
        updates.cargoLength = nextBase.chassisLength - nextBase.frontModuleLength - nextBase.cargoGap + val;
      }

      return deriveParams({ ...prev, ...updates });
    });
  }, [pushHistory]);

  const handleTireChange = useCallback((val: string) => {
    const newRadius = parseTireSpec(val);
    pushHistory(paramsRef.current);
    setParams(prev => deriveParams({ ...prev, tireSpec: val, wheelRadius: newRadius ?? prev.wheelRadius }));
  }, [pushHistory]);

  const parseAndApplyConfig = useCallback((importText: string) => {
    if (!importText.trim()) return { count: 0, errorLines: new Set<number>() };
    const { updates, errorLines } = parseConfigText(importText);
    if (Object.keys(updates).length > 0) {
      pushHistory(paramsRef.current);
      setParams(prev => deriveParams({ ...prev, ...updates }));
      return { count: Object.keys(updates).length, errorLines };
    }
    return { count: 0, errorLines };
  }, [pushHistory]);

  const ratioInfo = useMemo<{ ratio: string; status: RatioStatus; msg: string }>(() => {
    const ratio = params.wheelbase / (params.trackWidth || 1);
    if (ratio < 1.4) return { ratio: ratio.toFixed(2), status: 'warning', msg: '轴轮比 < 1.4 (偏小)' };
    if (ratio > 2.0) return { ratio: ratio.toFixed(2), status: 'warning', msg: '轴轮比 > 2.0 (偏大)' };
    return { ratio: ratio.toFixed(2), status: 'normal', msg: `工程比例合理 (${ratio.toFixed(2)})` };
  }, [params.trackWidth, params.wheelbase]);

  const hasWheelConflict = params.platformHeight < (params.wheelRadius * 2 + 80);
  const isRearOverhangTooShort = params.chassisOverhangRear < 300;

  const copyToClipboard = useCallback(() => {
    const text = `L4无人车配置\n整车=${Math.round(params.overallLength)}*${Math.round(params.overallWidth)}*${params.overallHeight}\n底盘=${params.chassisLength}*${params.chassisWidth}\n货箱=${Math.round(params.cargoLength)}*${params.cargoWidth}*${params.cargoHeight}\n货箱内空=${Math.round(params.innerCargoLength)}*${Math.round(params.innerCargoWidth)}*${Math.round(params.innerCargoHeight)}=${params.innerCargoVolume}m³\n轴距=${params.wheelbase} 轮距=${params.trackWidth}\n前悬=${Math.round(params.chassisOverhangFront)} 后悬=${Math.round(params.chassisOverhangRear)}\n货台高=${params.platformHeight} 离地=${params.chassisGroundClearance}\n接近角=${params.approachAngle}° 离去角=${params.departureAngle}°\n智驾=${params.frontModuleLength}*${params.sensorTopHeight}\n壁厚=${params.cargoWallThickness} 间隙=${params.cargoGap}\n轮胎=${params.tireSpec}`;
    navigator.clipboard.writeText(text).then(() => {
      alert('配置已复制！');
    }).catch(() => {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      alert('配置已复制！');
    });
  }, [params]);

  const resetParams = useCallback(() => {
    pushHistory(paramsRef.current);
    setParams(INITIAL_PARAMS);
    setLastEditedKey('approachAngle');
  }, [pushHistory]);

  return {
    params, setParams, handleChange, handleTireChange,
    parseAndApplyConfig, validateImportLines,
    ratioInfo, hasWheelConflict, isRearOverhangTooShort,
    copyToClipboard, resetParams, lastEditedKey,
    undo, redo, canUndo, canRedo, pushHistory, MAX_HISTORY,
  };
};