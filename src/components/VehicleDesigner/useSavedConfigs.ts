import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { deriveParams } from './deriveParams';
import type { VehicleParams } from './types';

const STORAGE_KEY = 'l4-vehicle-saved-configs';

interface SavedConfig {
  id: number;
  name: string;
  timestamp: string;
  params: VehicleParams;
}

const loadSavedConfigs = (): SavedConfig[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as SavedConfig[];
  } catch { /* ignore */ }
  return [];
};

export const useSavedConfigs = (params: VehicleParams) => {
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>(loadSavedConfigs);
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [saveName, setSaveName] = useState<string>('');
  const [selectedSlots, setSelectedSlots] = useState<SavedConfig[]>([]);

  // 保存到 localStorage
  const persistConfigs = useCallback((configs: SavedConfig[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  }, []);

  const saveCurrentConfig = useCallback(() => {
    const name = saveName.trim() || `配置 ${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    const newConfig: SavedConfig = {
      id: Date.now(),
      name,
      timestamp: new Date().toISOString(),
      params: { ...params },
    };
    setSavedConfigs(prev => {
      const updated = [newConfig, ...prev].slice(0, 10);
      persistConfigs(updated);
      return updated;
    });
    setShowSaveModal(false);
    setSaveName('');
  }, [saveName, params, persistConfigs]);

  const restoreConfig = useCallback((config: SavedConfig, setParams: Dispatch<SetStateAction<VehicleParams>>) => {
    setParams(deriveParams(config.params));
  }, []);

  const deleteConfig = useCallback((id: number) => {
    setSavedConfigs(prev => {
      const updated = prev.filter(c => c.id !== id);
      persistConfigs(updated);
      return updated;
    });
  }, [persistConfigs]);

  const exportConfigsToCSV = useCallback(() => {
    if (savedConfigs.length === 0) {
      alert('没有保存的参数可导出');
      return;
    }
    const keys = Object.keys(savedConfigs[0].params);
    const headers = ['配置名称', '保存时间', ...keys];
    const rows = savedConfigs.map(c => {
      return [
        c.name,
        new Date(c.timestamp).toLocaleString('zh-CN'),
        ...keys.map(k => c.params[k as keyof VehicleParams]),
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `L4_车辆参数_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    // 延迟回收 —— 部分 WebView 下同步 revoke 会取消尚未开始的下载（性能审计报告 #8c）
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [savedConfigs]);

  const toggleSlot = useCallback((config: SavedConfig) => {
    setSelectedSlots(prev => {
      const exists = prev.find(s => s.id === config.id);
      if (exists) {
        return prev.filter(s => s.id !== config.id);
      } else if (prev.length < 4) {
        return [...prev, config];
      }
      return prev;
    });
  }, []);

  const getSlotIndex = useCallback((configId: number) => {
    return selectedSlots.findIndex(s => s.id === configId) + 1;
  }, [selectedSlots]);

  return {
    savedConfigs,
    showSaveModal,
    setShowSaveModal,
    saveName,
    setSaveName,
    selectedSlots,
    setSelectedSlots,
    saveCurrentConfig,
    restoreConfig,
    deleteConfig,
    exportConfigsToCSV,
    toggleSlot,
    getSlotIndex,
  };
};