// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Upload, Modal, Checkbox, Button, message, Tooltip, Input, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { readFileAsWorkbook, previewWorkbook } from '../../utils/excelParser';
import { parseWithConfigAsync } from '../../utils/excelParserAsync';
import type { SheetPreview, SheetParseConfig } from '../../types';
import ExcelPreviewDialog from './ExcelPreviewDialog';
import AssetListDrawer from '../AssetLibrary/AssetListDrawer';
import SheetPickerModal from './SheetPickerModal';
import { FolderOpenOutlined } from '@ant-design/icons';
import { saveAssetFile, loadAssetTags, setAssetFileTags } from '../../utils/assetManager';
import TagSelector from '../common/TagSelector';

interface FileManagerProps {
    hiddenAssetButton?: boolean;
    onSelectFile?: (fileName: string | null) => void;
    focusedFile?: string | null;
}
const FileManager: React.FC<FileManagerProps> = ({ hiddenAssetButton, onSelectFile, focusedFile }) => {

  const [uploading, setUploading] = useState(false);
  const { assetLibraryPath, addActiveAsset, bumpAssetVersion } = useVehicleStore();

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

  const handlePreviewConfirm = async (configs: SheetParseConfig[]) => {
    const cachedFile = fileCache.get(pendingFileName);
    if (!cachedFile) { message.error('文件缓存过期'); return; }
    const data = await parseWithConfigAsync(cachedFile, configs);
    const productGroups = new Map<string, typeof data.data>();
    data.data.forEach(p => {
      const key = p.productName || data.fileName;
      if (!productGroups.has(key)) productGroups.set(key, []);
      productGroups.get(key)!.push(p);
    });
    setPendingProducts(Array.from(productGroups.entries()).map(([name, params]) => ({ name, count: params.length, checked: true })));
    setPendingProductData(data.data);
    setPendingPendingFileName(pendingFileName);
    setConfirmModalVisible(true);
    setPreviewOpen(false);
  };

  const handleConfirmSave = async () => {
    if (!assetLibraryPath) { message.error('请先设置资产库路径'); return; }
    const selected = pendingProducts.filter(p => p.checked !== false);
    if (selected.length === 0) { message.warning('请至少选择一个车型'); return; }
    for (const prod of selected) {
      const params = pendingProductData.filter(p => (p.productName || pendingPendingFileName) === prod.name);
      const fileNameBase = prod.customName || prod.name;
      const fileNameJson = fileNameBase + '.json';
      // 文件名和产品名统一用 fileNameBase，让资产显示名与文件名一致
      await saveAssetFile(assetLibraryPath, fileNameBase, fileNameBase, params);
      addActiveAsset(fileNameJson, fileNameBase);
      // 保存标签
      if (prod.tags && prod.tags.length > 0) {
        await setAssetFileTags(assetLibraryPath, fileNameJson, prod.tags);
      }
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
          <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
            解析发现 {pendingProducts.length} 个车型，请选择需要保存到资产库的车型：
          </div>
          {pendingProducts.map((prod, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px',
              borderBottom: '1px solid #f0f0f0'
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
              <span style={{ fontSize: 12, color: '#999' }}>{prod.count} 个参数</span>
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
                }}
              />
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
            保存后车型将自动加入待分析工作区
          </div>
        </Modal>
      )}

      <AssetListDrawer visible={assetDrawerVisible} onClose={() => setAssetDrawerVisible(false)} />
    </>
  );
};

export default FileManager;
