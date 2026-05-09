// @ts-nocheck
import React, { useState } from 'react';
import { Upload, Modal, Checkbox, Button, message, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { readFileAsWorkbook, previewWorkbook } from '../../utils/excelParser';
import { parseWithConfigAsync } from '../../utils/excelParserAsync';
import type { SheetPreview, SheetParseConfig } from '../../types';
import ExcelPreviewDialog from './ExcelPreviewDialog';
import AssetListDrawer from '../AssetLibrary/AssetListDrawer';
import SheetPickerModal from './SheetPickerModal';
import { FolderOpenOutlined } from '@ant-design/icons';
import { saveAssetFile } from '../../utils/assetManager';

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
      await saveAssetFile(assetLibraryPath, fileNameBase, prod.name, params);
      addActiveAsset(fileNameJson, prod.name);
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
  const [pendingProducts, setPendingProducts] = useState<{ name: string; count: number; checked?: boolean; customName?: string }[]>([]);
  const [pendingProductData, setPendingProductData] = useState<import('../../types').VehicleParameter[]>([]);
  const [pendingPendingFileName, setPendingPendingFileName] = useState('');
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
              <input
                type="text"
                value={prod.customName || prod.name + '.json'}
                onChange={e => {
                  const next = [...pendingProducts];
                  next[idx] = { ...next[idx], customName: e.target.value.replace(/\.json$/i, '') };
                  setPendingProducts(next);
                }}
                style={{
                  fontSize: 11, width: 180, padding: '1px 4px',
                  border: '1px solid #d9d9d9', borderRadius: 3, outline: 'none', color: '#333'
                }}
                onClick={e => e.stopPropagation()}
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
