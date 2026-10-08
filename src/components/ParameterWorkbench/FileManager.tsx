import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Upload, Modal, Checkbox, Button, message, Tooltip, Input, Tag, Select, Table, Segmented } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { parseWithConfigAsync, openWorkbookAsync, parseHandleAsync, releaseWorkbookHandle } from '../../utils/excelParserAsync';
import type { SheetData, SheetPreview, SheetParseConfig } from '../../types';
import ExcelPreviewDialog from './ExcelPreviewDialog';
import AssetListDrawer from '../AssetLibrary/AssetListDrawer';
import ImportDiffModal from '../AssetLibrary/ImportDiffModal';
import SheetPickerModal from './SheetPickerModal';
import { loadAssetTags, saveAssetTags, getAssetFilesWithInfo, loadAssetMeta, saveAssetMeta, loadAssetFile, saveAssetsBatch } from '../../utils/assetManager';
import { compareSheets } from '../../utils/comparator';
import { buildImportCandidate, classifyImportBatch, defaultDecisionFor } from '../../utils/assetImportDedup';
import { buildSupersedeMeta } from '../../utils/assetGovernance';
import { ensureTagsInDefaultGroup, getAssetTagGroupsSync } from '../../utils/assetTagGroups';
import { clearImportTransients } from '../../utils/importTransients';
import TagSelector from '../common/TagSelector';

/** 判定 → 徽章/选项元数据 */
const VERDICT_META = {
  new: { label: '新增', color: 'success' },
  updated: { label: '更新已有', color: 'warning' },
  suspect: { label: '疑似重复', color: 'error' },
};
const DECISION_OPTIONS = {
  new: [{ value: 'save', label: '保存入库' }, { value: 'skip', label: '跳过' }],
  updated: [{ value: 'keep-new', label: '并存为新版本' }, { value: 'replace', label: '替换旧版内容' }, { value: 'skip', label: '跳过' }],
  suspect: [{ value: 'skip', label: '跳过' }, { value: 'save', label: '仍按新车保存' }],
};

interface FileManagerProps {
    hiddenAssetButton?: boolean;
    onSelectFile?: (fileName: string | null) => void;
    focusedFile?: string | null;
}
const FileManager: React.FC<FileManagerProps> = () => {

  const [uploading, setUploading] = useState(false);
  const { assetLibraryPath, bumpAssetVersion, bumpAssetTagGroupsVersion } = useVehicleStore(useShallow(state => ({
    assetLibraryPath: state.assetLibraryPath,
    bumpAssetVersion: state.bumpAssetVersion,
    bumpAssetTagGroupsVersion: state.bumpAssetTagGroupsVersion,
  })));

  const handleUpload = async (file: File) => {
    setUploading(true);
    setFileCache(prev => { const next = new Map(prev); next.set(file.name, file); return next; });
    try {
      await openPreviewDialog(file);
    } catch {
      message.error('无法预览文件');
    } finally {
      setUploading(false);
    }
    return false;
  };

  const openPreviewDialog = async (file: File) => {
    const info = await openWorkbookAsync(file);
    // 全横向格式（参数为列、车型为行，如"产品准入导出"）：列角色配置无法表达，
    // 直接自动解析进入车型确认弹窗
    if (info.orientation === 'horizontal') {
      pendingHandleIdRef.current = null; // 横向路径同步消费，不残留到确认阶段
      await importHorizontalDirectly(info.fileName, info.handleId);
      return;
    }
    pendingHandleIdRef.current = info.handleId; // 供 handlePreviewConfirm 复用
    setPendingFileName(info.fileName);
    setPreviewData(info.previews);
    if (info.previews.length > 1) {
      setSheetPickerData(info.previews.map(p => ({ name: p.sheetName, totalRows: p.totalRows })));
      setSheetPickerOpen(true);
    } else {
      setPreviewOpen(true);
    }
  };

  const importHorizontalDirectly = async (fileName: string, handleId: number) => {
    try {
      // 用 handle 在解析侧解析：不重读文件、workbook 也不过线程边界
      const data = await parseHandleAsync(handleId);
      const productCount = new Set(data.data.map(p => p.productName)).size;
      message.info(`检测到横向格式（参数为列、车型为行），已解析出 ${productCount} 个车型`);
      await showProductConfirm(data, fileName);
    } catch (err) {
      message.error('解析失败：' + (err instanceof Error ? err.message : String(err)));
    } finally {
      // 横向路径同步消费完，立即释放（不残留到确认阶段）
      releaseWorkbookHandle(handleId);
    }
  };

  /** 按产品分组并弹出「确认导入车型」弹窗（预览配置路径与横向快捷路径共用） */
  const showProductConfirm = async (data: SheetData, fileName: string) => {
    const productGroups = new Map<string, typeof data.data>();
    data.data.forEach(p => {
      const key = p.productName || data.fileName;
      if (!productGroups.has(key)) productGroups.set(key, []);
      productGroups.get(key)!.push(p);
    });
    let products = Array.from(productGroups.entries()).map(([name, params]) => ({ name, count: params.length, checked: true }));

    // 导入三分类查重（ADR-0002）：新增 / 更新已有 / 疑似重复
    if (assetLibraryPath) {
      try {
        const [infos, meta] = await Promise.all([
          getAssetFilesWithInfo(assetLibraryPath),
          loadAssetMeta(assetLibraryPath),
        ]);
        const candidates = Array.from(productGroups.entries()).map(([name, params]) =>
          buildImportCandidate(params, name, name)
        );
        const results = classifyImportBatch(candidates, infos, meta);
        products = products.map((p, i) => ({
          ...p,
          verdict: results[i].verdict,
          reason: results[i].reason,
          matchedFiles: results[i].matchedFiles,
          decision: defaultDecisionFor(results[i].verdict),
        }));
      } catch (e) {
        console.warn('导入查重失败，全部按新增处理', e);
      }
    }

    setPendingProducts(products);
    setPendingProductData(data.data);
    setPendingPendingFileName(fileName);
    setVerdictFilter('all');
    setConfirmSearch('');
    contentRefineDoneRef.current = false;
    setConfirmModalVisible(true);
    setPreviewOpen(false);
  };

  const handlePreviewConfirm = async (configs: SheetParseConfig[]) => {
    try {
      const handleId = pendingHandleIdRef.current;
      if (handleId !== null) {
        // 在解析侧用缓存的 workbook 解析：不重读文件、workbook 不过线程边界
        const data = await parseHandleAsync(handleId, configs);
        await showProductConfirm(data, pendingFileName);
      } else {
        // 兜底（当前 UI 流程下不可达：预览弹窗挡着上传入口，ref 在放行到确认前不会被清）。
        // 保留是为 ref 为 null 时仍不静默失败；代价是 fileCache 存活只为服务它。
        const cachedFile = fileCache.get(pendingFileName);
        if (!cachedFile) { message.error('文件缓存过期'); return; }
        const data = await parseWithConfigAsync(cachedFile, configs);
        await showProductConfirm(data, pendingFileName);
      }
    } catch (err) {
      // 解析侧会抛用户可读错误（如「按当前配置未提取到任何参数数据」）；
      // 必须在此捕获，否则 onConfirm 未被 await 会让它变成无人处理的 rejection。
      message.error('解析失败：' + (err instanceof Error ? err.message : String(err)));
      return;
    }
    setPreviewOpen(false);
    releaseImportTransients();
  };

  const handleConfirmSave = async () => {
    if (!assetLibraryPath) { message.error('请先设置资产库路径'); return; }
    const selected = pendingProducts.filter(p => p.checked !== false && (p.decision ?? 'save') !== 'skip');
    if (selected.length === 0) { message.warning('请至少选择一个要保存的车型（处理方式为「跳过」的不会保存）'); return; }

    setImportSaving({ active: true, done: 0, total: selected.length });
    try {
      // 组装批量项：replace → 固定文件名；save/keep-new → 基名。
      // 整批一次 IPC 交给 Rust（save_assets_batch）：唯一名解析（批内重名由已占用
      // 集合保证不互覆）+ N 个文件写盘都在线程池完成，主线程只发一次请求。
      const planned = selected.map(prod => ({
        prod,
        decision: prod.decision ?? defaultDecisionFor(prod.verdict ?? 'new'),
      }));
      const items = planned.map(({ prod, decision }) => {
        const params = pendingProductData.filter(p => (p.productName || pendingPendingFileName) === prod.name);
        if (decision === 'replace' && prod.matchedFiles && prod.matchedFiles.length > 0) {
          // 替换旧版内容：写入命中文件本身，文件名不变（用户显式选择）
          const targetBase = prod.matchedFiles[0].replace(/\.json$/i, '');
          return { fixedFileName: prod.matchedFiles[0], productName: targetBase, parameters: params };
        }
        // save / keep-new：唯一文件名落盘，永不静默覆盖（ADR-0002）
        return { baseName: prod.customName || prod.name, productName: prod.customName || prod.name, parameters: params };
      });

      const results = await saveAssetsBatch(assetLibraryPath, items);
      setImportSaving({ active: true, done: results.filter(r => r.ok).length, total: selected.length });

      const failures = results.filter(r => !r.ok);
      if (failures.length > 0) {
        message.warning(`${failures.length} 个文件写入失败（如 ${failures[0].fileName}：${failures[0].error ?? '未知错误'}）`);
      }

      const supersedePairs: { oldFileName: string; newFileName: string }[] = [];
      const tagEntries: [string, string[]][] = [];
      const allNewTags = new Set<string>();
      let replacedCount = 0;
      let okCount = 0;
      results.forEach((r, i) => {
        if (!r.ok) return;
        okCount++;
        const { prod, decision } = planned[i];
        if (decision === 'keep-new' && prod.matchedFiles) {
          prod.matchedFiles.forEach(old => supersedePairs.push({ oldFileName: old, newFileName: r.fileName }));
        }
        if (prod.tags && prod.tags.length > 0) {
          tagEntries.push([r.fileName, prod.tags]);
          prod.tags.forEach(t => allNewTags.add(t));
        }
        if (decision === 'replace') replacedCount++;
      });

      // 标签一次性合并写（原先逐行 load+save 整个标签文件，N 行 = 2N 次全量 IO）
      if (tagEntries.length > 0) {
        const tags = await loadAssetTags(assetLibraryPath);
        tagEntries.forEach(([fileName, list]) => { tags[fileName] = list; });
        await saveAssetTags(assetLibraryPath, tags);
      }
      // 更新已有 → 旧版本标记为历史版本（主文件标记随新版本继承），一次读写
      if (supersedePairs.length > 0) {
        const meta = await loadAssetMeta(assetLibraryPath);
        await saveAssetMeta(assetLibraryPath, buildSupersedeMeta(meta, supersedePairs));
      }
      // 新建标签同步到标签分组的"其他"分组
      if (allNewTags.size > 0) {
        const groupsUpdated = await ensureTagsInDefaultGroup(assetLibraryPath, Array.from(allNewTags));
        if (groupsUpdated) bumpAssetTagGroupsVersion();
      }
      bumpAssetVersion();
      setConfirmModalVisible(false);
      setPendingFileName('');
      releaseImportTransients();
      const savedCount = okCount - replacedCount;
      const parts = [];
      if (savedCount > 0) parts.push(`保存 ${savedCount} 个`);
      if (replacedCount > 0) parts.push(`替换旧版内容 ${replacedCount} 个`);
      if (supersedePairs.length > 0) parts.push(`${supersedePairs.length} 个旧版本已标记为历史`);
      message.success(`已导入至资产库：${parts.join('，')}（入库不等于加入工作区，可在资产面板筛选后加载）`);
    } finally {
      setImportSaving({ active: false, done: 0, total: 0 });
    }
  };

  const [fileCache, setFileCache] = useState<Map<string, File>>(new Map());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<SheetPreview[]>([]);
  const [pendingFileName, setPendingFileName] = useState('');
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const [sheetPickerData, setSheetPickerData] = useState<{ name: string; totalRows: number }[]>([]);
  const [preselectedDisabledSheets, setPreselectedDisabledSheets] = useState<Set<string>>(new Set());
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingProducts, setPendingProducts] = useState<{
    name: string; count: number; checked?: boolean; customName?: string; tags?: string[];
    verdict?: 'new' | 'updated' | 'suspect'; reason?: string; matchedFiles?: string[];
    decision?: 'save' | 'keep-new' | 'replace' | 'skip';
    /** 内容二次比对：与现有资产无实质差异（仅空模板字段） */
    identical?: boolean;
  }[]>([]);
  const [diffState, setDiffState] = useState<{
    open: boolean; baseFileName: string; targetName: string;
    base: SheetData | null; target: SheetData | null;
  }>({ open: false, baseFileName: '', targetName: '', base: null, target: null });
  /** 预览阶段解析出的 workbook 留在解析侧；主线程只持 handle（内存治理 P2）。
   *  非横向路径：openPreviewDialog 写入，releaseImportTransients 释放。
   *  横向路径不经此 ref（写入前即置 null），由 importHorizontalDirectly 的 finally 单独释放。 */
  const pendingHandleIdRef = useRef<number | null>(null);
  /** 释放导入过程态（fileCache/previewData/diffState/解析侧 workbook handle）。
   *  预览/确认/选择器的关闭与取消路径统一走它。 */
  const releaseImportTransients = useCallback(() => {
    if (pendingHandleIdRef.current !== null) {
      releaseWorkbookHandle(pendingHandleIdRef.current);
      pendingHandleIdRef.current = null;
    }
    clearImportTransients({ setFileCache, setPreviewData, setDiffState });
  }, []);
  // 大批量导入预览：分类筛选 + 搜索（477 条级别的批次用）
  const [verdictFilter, setVerdictFilter] = useState<'all' | 'new' | 'updated' | 'suspect'>('all');
  const [confirmSearch, setConfirmSearch] = useState('');
  const contentRefineDoneRef = useRef(false);
  // 批量落盘进度（275 行级别：并发分块写 + 进度反馈）
  const [importSaving, setImportSaving] = useState<{ active: boolean; done: number; total: number }>({ active: false, done: 0, total: 0 });

  /** 查看 diff：命中文件（现有资产） vs 本次导入数据 */
  const openDiff = async (prod: { name: string; customName?: string; matchedFiles?: string[] }) => {
    const matched = prod.matchedFiles?.[0];
    if (!assetLibraryPath || !matched) return;
    const base = await loadAssetFile(assetLibraryPath, matched);
    const params = pendingProductData.filter(p => (p.productName || pendingPendingFileName) === prod.name);
    const target: SheetData = {
      fileName: `${prod.customName || prod.name}.json`,
      data: params,
      rawHeaders: ['参数分组', '参数名称', '参数值'],
    };
    setDiffState({
      open: true,
      baseFileName: matched,
      targetName: prod.customName || prod.name,
      base,
      target,
    });
  };
  const [pendingProductData, setPendingProductData] = useState<import('../../types').VehicleParameter[]>([]);
  const [pendingPendingFileName, setPendingPendingFileName] = useState('');
  const [allImportTags, setAllImportTags] = useState<string[]>([]);

  // 打开确认弹窗时加载可用标签
  useEffect(() => {
    if (confirmModalVisible && assetLibraryPath) {
      loadAssetTags(assetLibraryPath).then(tagsMap => {
        const tagSet = new Set<string>();
        Object.values(tagsMap).forEach(tags => tags.forEach(t => tagSet.add(t)));
        getAssetTagGroupsSync().groups.forEach(g => g.tags.forEach(t => tagSet.add(t)));
        setAllImportTags(Array.from(tagSet).sort());
      }).catch(() => {});
    }
  }, [confirmModalVisible, assetLibraryPath]);
  const [assetDrawerVisible, setAssetDrawerVisible] = useState(false);

  // 三分类统计（统计条点击即筛选）
  const verdictCounts = useMemo(() => ({
    all: pendingProducts.length,
    new: pendingProducts.filter(p => p.verdict === 'new').length,
    updated: pendingProducts.filter(p => p.verdict === 'updated').length,
    suspect: pendingProducts.filter(p => p.verdict === 'suspect').length,
  }), [pendingProducts]);

  // 表格行：附原始下标（状态更新用），按分类 tab + 搜索过滤
  const confirmTableRows = useMemo(() => pendingProducts
    .map((p, idx) => ({ ...p, __idx: idx }))
    .filter(p => verdictFilter === 'all' || p.verdict === verdictFilter)
    .filter(p => {
      const kw = confirmSearch.trim().toLowerCase();
      if (!kw) return true;
      return p.name.toLowerCase().includes(kw) || (p.customName || '').toLowerCase().includes(kw);
    }), [pendingProducts, verdictFilter, confirmSearch]);

  // 内容二次精化：对「更新已有」的行加载现有资产做参数比对，
  // 无实质差异（变更/缺失/有值新增均为 0，仅空模板字段）的自动改为跳过——
  // 身份命中只说明"是同一辆车"，内容一致时不该制造新版本。
  useEffect(() => {
    if (!confirmModalVisible || contentRefineDoneRef.current || !assetLibraryPath) return;
    const targets = pendingProducts.filter(p => p.verdict === 'updated' && p.matchedFiles?.[0]);
    contentRefineDoneRef.current = true;
    if (targets.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(targets.map(async p => {
        try {
          if (!p.matchedFiles?.length) return null;
          const base = await loadAssetFile(assetLibraryPath, p.matchedFiles[0]);
          if (!base) return null;
          const params = pendingProductData.filter(x => (x.productName || pendingPendingFileName) === p.name);
          const targetSheet: SheetData = {
            fileName: `${p.customName || p.name}.json`,
            data: params,
            rawHeaders: ['参数分组', '参数名称', '参数值'],
          };
          const diff = compareSheets(base, targetSheet, 'content');
          const substantive = diff.modified.length
            + diff.removed.length
            + diff.added.filter(a => String(a.value ?? '').trim() !== '').length;
          return substantive === 0 ? p.name : null;
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      const identicalNames = new Set(results.filter(Boolean));
      if (identicalNames.size === 0) return;
      setPendingProducts(prev => prev.map(p => (
        identicalNames.has(p.name) && p.verdict === 'updated' && p.decision === 'keep-new'
          ? { ...p, identical: true, decision: 'skip', reason: '内容与现有资产一致（仅空模板字段差异），已自动改为跳过' }
          : p
      )));
      message.info(`${identicalNames.size} 个「更新已有」经内容比对无实质差异，已自动改为跳过`);
    })();
    return () => { cancelled = true; };
    // 仅在弹窗打开后跑一次（contentRefineDoneRef 兜底），不随行状态重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmModalVisible]);

  const handleSheetPickerConfirm = (disabledSheets: Set<string>) => {
    setSheetPickerOpen(false);
    setPreselectedDisabledSheets(disabledSheets);
    setPreviewOpen(true);
  };
  const handleSheetPickerSkip = () => {
    setSheetPickerOpen(false);
    setPreselectedDisabledSheets(new Set());
    setPreviewOpen(true);
  };
  const handleSheetPickerCancel = () => {
    setSheetPickerOpen(false);
    setPreselectedDisabledSheets(new Set());
    releaseImportTransients();
  };
  /** 关闭「确认导入车型」弹窗并释放导入过程态（非横向与横向导入路径共用） */
  const handleConfirmModalCancel = () => {
    setConfirmModalVisible(false);
    setPendingProductData([]);
    releaseImportTransients();
  };
  return (
    <>
      <Upload beforeUpload={handleUpload} showUploadList={false} accept=".xlsx,.xls">
        <Button type="primary" icon={<PlusOutlined />} loading={uploading} block size="small">导入车型数据</Button>
      </Upload>

      <ExcelPreviewDialog open={previewOpen} previews={previewData} fileName={pendingFileName}
        onConfirm={handlePreviewConfirm}
        onCancel={() => { setPreviewOpen(false); releaseImportTransients(); }}
        preselectedDisabledSheets={preselectedDisabledSheets} />
      <SheetPickerModal open={sheetPickerOpen} sheets={sheetPickerData}
        onConfirm={handleSheetPickerConfirm} onSkip={handleSheetPickerSkip} onCancel={handleSheetPickerCancel} />
      
      {/* 多车型导入确认弹窗 */}
      {confirmModalVisible && (
        <Modal
          open={confirmModalVisible}
          title="确认导入车型"
          width={980}
          onCancel={handleConfirmModalCancel}
          footer={[
            <Button key="cancel" disabled={importSaving.active}
              onClick={handleConfirmModalCancel}>取消</Button>,
            <Button key="confirm" type="primary" loading={importSaving.active} onClick={handleConfirmSave}>
              {importSaving.active
                ? `保存中…（${importSaving.total} 个）`
                : `保存至资产库 (${pendingProducts.filter(p => p.checked !== false && (p.decision ?? 'save') !== 'skip').length})`}
            </Button>,
          ]}
        >
          <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-2)' }}>
            解析发现 {pendingProducts.length} 个车型，已与资产库查重。点分类查看，逐行或批量处理：
          </div>

          {/* 统计 + 分类筛选 + 搜索 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <Segmented
              size="small"
              value={verdictFilter}
              onChange={v => setVerdictFilter(v as 'all' | 'new' | 'updated' | 'suspect')}
              options={[
                { label: `全部 ${verdictCounts.all}`, value: 'all' },
                { label: `新增 ${verdictCounts.new}`, value: 'new' },
                { label: `更新已有 ${verdictCounts.updated}`, value: 'updated' },
                { label: `疑似重复 ${verdictCounts.suspect}`, value: 'suspect' },
              ]}
            />
            <Input
              size="small"
              allowClear
              prefix={<SearchOutlined style={{ color: 'var(--text-3)' }} />}
              placeholder="搜索车型名 / 文件名..."
              value={confirmSearch}
              onChange={e => setConfirmSearch(e.target.value)}
              style={{ flex: 1, minWidth: 160, maxWidth: 260 }}
            />
          </div>

          {/* 批量操作栏 */}
          <BatchOperationsBar
            total={pendingProducts.length}
            checkedCount={pendingProducts.filter(p => p.checked !== false).length}
            onSelectAll={(checked) => setPendingProducts(prev => prev.map(p => ({ ...p, checked })))}
            onBatchTag={(tag) => {
              setPendingProducts(prev => prev.map(p => ({
                ...p,
                tags: p.checked !== false ? [...new Set([...(p.tags || []), ...tag])] : p.tags,
              })));
              // 新标签也同步到可用列表
              setAllImportTags(prev => {
                const merged = new Set(prev);
                tag.forEach(t => merged.add(t));
                return Array.from(merged).sort();
              });
            }}
            onBatchRename={(prefix, suffix) => {
              setPendingProducts(prev => prev.map(p => ({
                ...p,
                customName: p.checked !== false ? `${prefix}${p.customName || p.name}${suffix}` : p.customName,
              })));
            }}
            allImportTags={allImportTags}
          />

          {/* 分页表格：勾选 / 判定 / 处理 / 文件名 / 标签 / diff */}
          <Table
            size="small"
            rowKey={r => String(r.__idx)}
            dataSource={confirmTableRows}
            pagination={{
              pageSize: 50, size: 'small', showSizeChanger: true, pageSizeOptions: [20, 50, 100, 200],
              showTotal: t => `共 ${t} 条`,
            }}
            scroll={{ y: 380 }}
            rowSelection={{
              selectedRowKeys: pendingProducts.flatMap((p, i) => (p.checked !== false ? [String(i)] : [])),
              onChange: (keys) => {
                // 表头全选只作用于当前筛选视图内的行，视图外的保持原状
                const keySet = new Set((keys as string[]).map(String));
                const viewKeys = new Set(confirmTableRows.map(r => String(r.__idx)));
                setPendingProducts(prev => prev.map((p, i) => (
                  viewKeys.has(String(i)) ? { ...p, checked: keySet.has(String(i)) } : p
                )));
              },
              columnWidth: 36,
            }}
            columns={[
              {
                title: '车型',
                dataIndex: 'name',
                width: 230,
                ellipsis: true,
                render: (_, prod) => (
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={prod.name}>{prod.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{prod.count} 个参数</div>
                  </div>
                ),
              },
              {
                title: '判定',
                key: 'verdict',
                width: 90,
                render: (_, prod) => prod.verdict ? (
                  <Tag color={VERDICT_META[prod.verdict].color} className="m-0" style={{ fontSize: 11 }}>
                    {VERDICT_META[prod.verdict].label}
                  </Tag>
                ) : <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>,
              },
              {
                title: '判定说明 / diff',
                key: 'reason',
                ellipsis: true,
                render: (_, prod) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
                    {prod.identical && (
                      <Tag className="m-0" style={{ fontSize: 10, flexShrink: 0 }}>内容一致</Tag>
                    )}
                    <Tooltip title={prod.reason}>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {prod.reason || ''}
                      </span>
                    </Tooltip>
                    {(prod.matchedFiles?.length ?? 0) > 0 && (
                      <Button size="small" type="link" style={{ fontSize: 11, padding: 0, flexShrink: 0 }} onClick={() => openDiff(prod)}>
                        diff
                      </Button>
                    )}
                  </span>
                ),
              },
              {
                title: '处理',
                key: 'decision',
                width: 145,
                render: (_, prod) => prod.verdict ? (
                  <Select
                    size="small"
                    value={prod.decision ?? 'save'}
                    style={{ width: 132 }}
                    onChange={value => {
                      const next = [...pendingProducts];
                      next[prod.__idx] = { ...next[prod.__idx], decision: value };
                      setPendingProducts(next);
                    }}
                    options={DECISION_OPTIONS[prod.verdict]}
                  />
                ) : null,
              },
              {
                title: '文件名',
                key: 'customName',
                width: 200,
                render: (_, prod) => (
                  <Input
                    size="small"
                    value={prod.customName ?? prod.name}
                    onChange={e => {
                      const next = [...pendingProducts];
                      next[prod.__idx] = { ...next[prod.__idx], customName: e.target.value };
                      setPendingProducts(next);
                    }}
                    placeholder="文件名"
                    onClick={e => e.stopPropagation()}
                    addonAfter=".json"
                  />
                ),
              },
              {
                title: '标签',
                key: 'tags',
                width: 150,
                render: (_, prod) => (
                  <TagSelector
                    selected={prod.tags || []}
                    availableTags={allImportTags}
                    onChange={tags => {
                      const next = [...pendingProducts];
                      next[prod.__idx] = { ...next[prod.__idx], tags };
                      setPendingProducts(next);
                      // 新建的标签立即加入可用列表
                      setAllImportTags(prev => {
                        const merged = new Set(prev);
                        tags.forEach(t => merged.add(t));
                        return Array.from(merged).sort();
                      });
                    }}
                  />
                ),
              },
            ]}
          />
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
            仅保存至资产库，不自动加入待分析工作区（需要分析时在资产面板筛选后「⚡新增到工作区」）；处理方式为「跳过」的不会保存。
          </div>
        </Modal>
      )}

      <AssetListDrawer visible={assetDrawerVisible} onClose={() => setAssetDrawerVisible(false)} />
      <ImportDiffModal
        open={diffState.open}
        baseFileName={diffState.baseFileName}
        targetName={diffState.targetName}
        base={diffState.base}
        target={diffState.target}
        onClose={() => setDiffState(prev => ({ ...prev, open: false, base: null, target: null }))}
      />
    </>
  );
};

// 批量操作栏组件
interface BatchOperationsBarProps {
  total: number;
  checkedCount: number;
  onSelectAll: (checked: boolean) => void;
  onBatchTag: (tags: string[]) => void;
  onBatchRename: (prefix: string, suffix: string) => void;
  allImportTags: string[];
}

const BatchOperationsBar: React.FC<BatchOperationsBarProps> = ({
  total, checkedCount, onSelectAll, onBatchTag, onBatchRename, allImportTags,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [batchTagInput, setBatchTagInput] = useState('');
  const [prefixInput, setPrefixInput] = useState('');
  const [suffixInput, setSuffixInput] = useState('');
  const allChecked = total > 0 && checkedCount === total;

  const handleApplyTag = () => {
    const tags = batchTagInput.split(/[,，、\s]+/).map(t => t.trim()).filter(Boolean);
    if (tags.length > 0) onBatchTag(tags);
    setBatchTagInput('');
  };

  const handleApplyRename = () => {
    onBatchRename(prefixInput, suffixInput);
  };

  return (
    <div style={{
      marginBottom: 8, padding: '8px 10px',
      background: 'var(--surface-3)', borderRadius: 8,
      border: '1px solid var(--border-default)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'default' }}>
          <Checkbox checked={allChecked} onChange={e => onSelectAll(e.target.checked)} />
          <span>全选 ({checkedCount}/{total})</span>
        </label>
        <Button size="small" onClick={() => setExpanded(!expanded)}>
          {expanded ? '收起批量操作' : '批量操作 ▼'}
        </Button>
      </div>

      {expanded && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* 批量加标签 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', width: 60 }}>批量标签</span>
            <Input
              size="small"
              value={batchTagInput}
              onChange={e => setBatchTagInput(e.target.value)}
              onPressEnter={handleApplyTag}
              placeholder="输入标签，逗号/空格分隔"
              style={{ flex: 1, minWidth: 120 }}
            />
            <Button size="small" type="primary" onClick={handleApplyTag} disabled={!batchTagInput.trim()}>
              应用到已选
            </Button>
            {allImportTags.length > 0 && (() => {
            const groupsConfig = getAssetTagGroupsSync();
            // 「其他标签」是默认兜底分组，合并到「未分组」中，不单独显示
            const realGroups = groupsConfig.groups.filter(g => g.id !== '_default_other' && g.name !== '其他标签' && g.name !== '其他');
            const grouped = realGroups.map(g => ({ ...g, tags: g.tags.filter(t => allImportTags.includes(t)) })).filter(g => g.tags.length > 0);
            const defaultGroup = groupsConfig.groups.find(g => g.id === '_default_other' || g.name === '其他标签' || g.name === '其他');
            const knownSet = new Set(realGroups.flatMap(g => g.tags));
            const ungrouped = allImportTags.filter(t => !knownSet.has(t));
            // 把兜底分组的标签也归入未分组
            if (defaultGroup) {
              defaultGroup.tags.filter(t => allImportTags.includes(t)).forEach(t => { if (!ungrouped.includes(t)) ungrouped.push(t); });
            }
            return (
              <div className="flex flex-col gap-1 max-h-[100px] overflow-y-auto" style={{ marginTop: 4 }}>
                {grouped.map(g => (
                  <div key={g.id} className="flex items-start gap-1" style={{ marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', marginTop: 2, minWidth: 48 }}>{g.name}</span>
                    <div className="flex flex-wrap gap-1">
                      {g.tags.map(t => (
                        <Tag key={t} className="" style={{ fontSize: 10, margin: 0 }} onClick={() => onBatchTag([t])}>+{t}</Tag>
                      ))}
                    </div>
                  </div>
                ))}
                {ungrouped.length > 0 && (
                  <div className="flex items-start gap-1">
                    <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', marginTop: 2, minWidth: 48 }}>未分组</span>
                    <div className="flex flex-wrap gap-1">
                      {ungrouped.map(t => (
                        <Tag key={t} className="" style={{ fontSize: 10, margin: 0 }} onClick={() => onBatchTag([t])}>+{t}</Tag>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          </div>

          {/* 批量命名 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', width: 60 }}>批量命名</span>
            <Input
              size="small"
              value={prefixInput}
              onChange={e => setPrefixInput(e.target.value)}
              placeholder="前缀"
              style={{ width: 100 }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>文件名</span>
            <Input
              size="small"
              value={suffixInput}
              onChange={e => setSuffixInput(e.target.value)}
              placeholder="后缀"
              style={{ width: 100 }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>.json</span>
            <Button size="small" type="primary" onClick={handleApplyRename}
              disabled={!prefixInput && !suffixInput}>
              应用到已选
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManager;
