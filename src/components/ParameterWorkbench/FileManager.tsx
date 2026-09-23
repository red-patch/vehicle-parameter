// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Upload, Modal, Checkbox, Button, message, Tooltip, Input, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { readFileAsWorkbook, previewWorkbook, detectWorkbookOrientation } from '../../utils/excelParser';
import { parseWithConfigAsync, parseExcelAsync } from '../../utils/excelParserAsync';
import type { SheetData, SheetPreview, SheetParseConfig } from '../../types';
import ExcelPreviewDialog from './ExcelPreviewDialog';
import AssetListDrawer from '../AssetLibrary/AssetListDrawer';
import SheetPickerModal from './SheetPickerModal';
import { FolderOpenOutlined } from '@ant-design/icons';
import { saveAssetFile, loadAssetTags, setAssetFileTags } from '../../utils/assetManager';
import { ensureTagsInDefaultGroup, getAssetTagGroupsSync } from '../../utils/assetTagGroups';
import TagSelector from '../common/TagSelector';

interface FileManagerProps {
    hiddenAssetButton?: boolean;
    onSelectFile?: (fileName: string | null) => void;
    focusedFile?: string | null;
}
const FileManager: React.FC<FileManagerProps> = ({ hiddenAssetButton, onSelectFile, focusedFile }) => {

  const [uploading, setUploading] = useState(false);
  const { assetLibraryPath, addActiveAsset, bumpAssetVersion, bumpAssetTagGroupsVersion } = useVehicleStore();

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
    const workbook = await readFileAsWorkbook(file);
    // 全横向格式（参数为列、车型为行，如"产品准入导出"）：列角色配置无法表达，
    // 直接自动解析进入车型确认弹窗
    if (detectWorkbookOrientation(workbook) === 'horizontal') {
      await importHorizontalDirectly(file);
      return;
    }
    const previews = previewWorkbook(workbook);
    setPendingFileName(file.name);
    setPreviewData(previews);
    if (previews.length > 1) {
      setSheetPickerData(previews.map(p => ({ name: p.sheetName, totalRows: p.totalRows })));
      setSheetPickerOpen(true);
    } else {
      setPreviewOpen(true);
    }
  };

  const importHorizontalDirectly = async (file: File) => {
    try {
      const data = await parseExcelAsync(file);
      const productCount = new Set(data.data.map(p => p.productName)).size;
      message.info(`检测到横向格式（参数为列、车型为行），已解析出 ${productCount} 个车型`);
      showProductConfirm(data, file.name);
    } catch (err) {
      message.error('解析失败：' + (err instanceof Error ? err.message : String(err)));
    }
  };

  /** 按产品分组并弹出「确认导入车型」弹窗（预览配置路径与横向快捷路径共用） */
  const showProductConfirm = (data: SheetData, fileName: string) => {
    const productGroups = new Map<string, typeof data.data>();
    data.data.forEach(p => {
      const key = p.productName || data.fileName;
      if (!productGroups.has(key)) productGroups.set(key, []);
      productGroups.get(key)!.push(p);
    });
    setPendingProducts(Array.from(productGroups.entries()).map(([name, params]) => ({ name, count: params.length, checked: true })));
    setPendingProductData(data.data);
    setPendingPendingFileName(fileName);
    setConfirmModalVisible(true);
    setPreviewOpen(false);
  };

  const handlePreviewConfirm = async (configs: SheetParseConfig[]) => {
    const cachedFile = fileCache.get(pendingFileName);
    if (!cachedFile) { message.error('文件缓存过期'); return; }
    const data = await parseWithConfigAsync(cachedFile, configs);
    showProductConfirm(data, pendingFileName);
  };

  const handleConfirmSave = async () => {
    if (!assetLibraryPath) { message.error('请先设置资产库路径'); return; }
    const selected = pendingProducts.filter(p => p.checked !== false);
    if (selected.length === 0) { message.warning('请至少选择一个车型'); return; }
    // 收集所有新产品中出现的新标签，同步到标签分组的"其他"组
    const allNewTags = new Set<string>();
    for (const prod of selected) {
      const params = pendingProductData.filter(p => (p.productName || pendingPendingFileName) === prod.name);
      const fileNameBase = prod.customName || prod.name;
      const fileNameJson = fileNameBase + '.json';
      await saveAssetFile(assetLibraryPath, fileNameBase, fileNameBase, params);
      addActiveAsset(fileNameJson, fileNameBase);
      if (prod.tags && prod.tags.length > 0) {
        await setAssetFileTags(assetLibraryPath, fileNameJson, prod.tags);
        prod.tags.forEach(t => allNewTags.add(t));
      }
    }
    // 新建标签同步到标签分组的"其他"分组
    if (allNewTags.size > 0 && assetLibraryPath) {
      const groupsUpdated = await ensureTagsInDefaultGroup(assetLibraryPath, Array.from(allNewTags));
      if (groupsUpdated) bumpAssetTagGroupsVersion();
    }
    bumpAssetVersion();
    setConfirmModalVisible(false);
    setPendingFileName('');
    message.success('已保存 ' + selected.length + ' 个车型至资产库');
  };

  const [fileCache, setFileCache] = useState<Map<string, File>>(new Map());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<SheetPreview[]>([]);
  const [pendingFileName, setPendingFileName] = useState('');
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const [sheetPickerData, setSheetPickerData] = useState<{ name: string; totalRows: number }[]>([]);
  const [preselectedDisabledSheets, setPreselectedDisabledSheets] = useState<Set<string>>(new Set());
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingProducts, setPendingProducts] = useState<{ name: string; count: number; checked?: boolean; customName?: string; tags?: string[] }[]>([]);
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
  };
  return (
    <>
      <Upload beforeUpload={handleUpload} showUploadList={false} accept=".xlsx,.xls">
        <Button type="primary" icon={<PlusOutlined />} loading={uploading} block size="small">导入车型数据</Button>
      </Upload>

      <ExcelPreviewDialog open={previewOpen} previews={previewData} fileName={pendingFileName}
        onConfirm={handlePreviewConfirm} onCancel={() => setPreviewOpen(false)} preselectedDisabledSheets={preselectedDisabledSheets} />
      <SheetPickerModal open={sheetPickerOpen} sheets={sheetPickerData}
        onConfirm={handleSheetPickerConfirm} onSkip={handleSheetPickerSkip} onCancel={handleSheetPickerCancel} />
      
      {/* 多车型导入确认弹窗 */}
      {confirmModalVisible && (
        <Modal
          open={confirmModalVisible}
          title="确认导入车型"
          width={520}
          onCancel={() => { setConfirmModalVisible(false); setPendingProductData([]); }}
          footer={[
            <Button key="cancel" onClick={() => { setConfirmModalVisible(false); setPendingProductData([]); }}>取消</Button>,
            <Button key="confirm" type="primary" onClick={handleConfirmSave}>
              保存至资产库 ({pendingProducts.filter(p => p.checked !== false).length})
            </Button>,
          ]}
        >
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-2)' }}>
            解析发现 {pendingProducts.length} 个车型，请选择需要保存到资产库的车型：
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

          {pendingProducts.map((prod, idx) => (
            <div key={idx}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px',
                borderBottom: prod.tags && prod.tags.length > 0 ? 'none' : '1px solid var(--border-default)'
              }}>
                <Checkbox
                  checked={prod.checked !== false}
                  onChange={e => {
                    const next = [...pendingProducts];
                    next[idx] = { ...next[idx], checked: e.target.checked };
                    setPendingProducts(next);
                  }}
                />
                <span style={{ flex: 1, fontSize: 13 }}>{prod.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{prod.count} 个参数</span>
                <Input
                  size="small"
                  defaultValue={prod.name}
                  onChange={e => {
                    const next = [...pendingProducts];
                    next[idx] = { ...next[idx], customName: e.target.value };
                    setPendingProducts(next);
                  }}
                  style={{ width: 160 }}
                  placeholder="输入文件名"
                  onClick={e => e.stopPropagation()}
                  addonAfter=".json"
                />
                <TagSelector
                  selected={prod.tags || []}
                  availableTags={allImportTags}
                  onChange={tags => {
                    const next = [...pendingProducts];
                    next[idx] = { ...next[idx], tags };
                    setPendingProducts(next);
                    // 新建的标签立即加入可用列表，关闭再打开也能看见
                    setAllImportTags(prev => {
                      const merged = new Set(prev);
                      tags.forEach(t => merged.add(t));
                      return Array.from(merged).sort();
                    });
                  }}
                />
              </div>
              {(prod.tags || []).length > 0 && (
                <div style={{ display: 'flex', gap: 4, padding: '2px 30px 6px', borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
                  {prod.tags!.map(tag => (
                    <span key={tag} style={{
                      fontSize: 11, padding: '1px 6px', borderRadius: 3,
                      background: 'var(--brand-weak)', color: 'var(--brand)',
                    }}>{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-3)' }}>
            保存后车型将自动加入待分析工作区
          </div>
        </Modal>
      )}

      <AssetListDrawer visible={assetDrawerVisible} onClose={() => setAssetDrawerVisible(false)} />
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
