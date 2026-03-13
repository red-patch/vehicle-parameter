import React, { useState } from 'react';
import { Input, Button, Card, Typography, Space, Alert, message, Steps } from 'antd';
import { SearchOutlined, ImportOutlined, CheckCircleOutlined, CopyOutlined, DownloadOutlined, SaveOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import ParametersTable from '../DiffViewer/ParametersTable';
import type { SheetData } from '../../types';
import { saveAssetFile } from '../../utils/assetManager';
import { ASSET_SOURCE_TAGS } from '../../utils/assetSourceTags';
import SaveAssetModal from '../AssetLibrary/SaveAssetModal';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

/**
 * 工信部公告查询URL
 */
const MIIT_QUERY_URL = 'https://service.miit-eidc.org.cn/miitxxgk/gonggao/xxgk/index';

/**
 * 构建查询URL
 */
const buildQueryUrl = (announcementNo: string): string => {
    return `${MIIT_QUERY_URL}?querylb=cp&querydata=${encodeURIComponent(announcementNo)}`;
};

/**
 * 书签脚本代码
 */
const BOOKMARKLET_CODE = `javascript:(function(){try{const table=document.querySelector('table.query_result_table');if(!table){alert('未找到参数表，请确保在参数详情页使用此书签。');return;}const results=[];const rows=Array.from(table.querySelectorAll('tr'));rows.forEach(row=>{const cells=Array.from(row.querySelectorAll('td'));if(cells.length>=4){const k1=cells[0].innerText.trim();const v1=cells[1].innerText.trim();const k2=cells[2].innerText.trim();const v2=cells[3].innerText.trim();if(k1)results.push({name:k1,value:v1,group:'工信部数据'});if(k2)results.push({name:k2,value:v2,group:'工信部数据'});}else if(cells.length>=2){const k=cells[0].innerText.trim();const v=cells[1].innerText.trim();if(k)results.push({name:k,value:v,group:'工信部数据'});}});const data={source:'miit-helper',parameters:results};const json=JSON.stringify(data);navigator.clipboard.writeText(json).then(()=>{alert('已成功复制 '+results.length+' 条参数到剪贴板！\\n请返回车辆参数工具粘贴导入。');}).catch(err=>{const i=document.createElement('textarea');i.value=json;document.body.appendChild(i);i.select();document.execCommand('copy');document.body.removeChild(i);alert('已成功复制 '+results.length+' 条参数到剪贴板！');});}catch(e){alert('发生错误: '+e.message);}})();`;

const AnnouncementQuery: React.FC = () => {
    const [announcementNo, setAnnouncementNo] = useState<string>('');
    const [importJson, setImportJson] = useState<string>('');
    const { setMiitData, miitData, setTargetFile, setCompareMode, addFile, assetLibraryPath } = useVehicleStore();
    const bookmarkLinkRef = React.useRef<HTMLAnchorElement>(null);
    const [saveModalVisible, setSaveModalVisible] = useState(false);

    React.useEffect(() => {
        if (bookmarkLinkRef.current) {
            bookmarkLinkRef.current.href = BOOKMARKLET_CODE;
        }
    }, []);

    const handleQuery = async () => {
        if (!announcementNo.trim()) return;
        const url = buildQueryUrl(announcementNo.trim());
        
        // 尝试使用 Tauri opener API（桌面应用）
        try {
            const { openUrl } = await import('@tauri-apps/plugin-opener');
            await openUrl(url);
        } catch {
            // Fallback 到 window.open（Web 环境或 Tauri 未配置时）
            window.open(url, '_blank');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleQuery();
    };

    const handleImport = () => {
        try {
            if (!importJson.trim()) return;
            const data = JSON.parse(importJson);
            
            if (data.source !== 'miit-helper' || !Array.isArray(data.parameters)) {
                message.error('数据格式不正确，请确保复制的是书签脚本生成的数据');
                return;
            }

            const sheetData: SheetData = {
                fileName: announcementNo.trim() || `工信部数据导入_${new Date().toLocaleTimeString()}`,
                rawHeaders: ['参数名', '值'],
                data: []
            };

            const parsedData: any[] = [];
            
            data.parameters.forEach((p: any, index: number) => {
                // 处理及拆分"其它"字段
                if (p.name === '其它' && p.value) {
                    // 保留原始字段
                    parsedData.push({
                        id: `miit-${index}-origin`,
                        name: p.name,
                        value: p.value,
                        group: p.group || '基础信息',
                        row: index + 1,
                        col: 1,
                        originSheet: '工信部官网'
                    });

                    // 拆分子字段：优先按分号分隔；如果无效，则尝试按点号分隔（排除小数点）
                    let parts = p.value.split(/;|；/);
                    if (parts.length <= 1 && p.value.includes('.')) {
                         // 尝试按点号分隔，但排除数字中间的点号（如 3.5, 1.5L）
                         parts = p.value.split(/\.(?!\d)/);
                    }

                    parts.forEach((part: string, subIndex: number) => {
                        const trimmed = part.trim();
                        if (!trimmed) return;

                        // 尝试匹配 "序号.key:value" 或 "key:value" 格式
                        // 匹配规则：可选(数字+点)+任意字符+冒号+任意字符
                        const match = trimmed.match(/^(?:(\d+)\.)?([^:：]+)[:：](.+)$/);
                        
                        if (match) {
                            parsedData.push({
                                id: `miit-${index}-sub-${subIndex}`,
                                name: match[2].trim(), // 键
                                value: match[3].trim(), // 值
                                group: '其它-详细参数',
                                row: index + 1,
                                col: 1,
                                originSheet: '工信部官网'
                            });
                        } else {
                            // 尝试匹配纯文本 "1.text" 或 纯文本
                            const simpleMatch = trimmed.match(/^(?:(\d+)\.)?(.+)$/);
                            if (simpleMatch) {
                                // 如果有序号，使用序号；否则使用 "其它-索引"
                                const suffix = simpleMatch[1] ? simpleMatch[1] : `${subIndex + 1}`;
                                parsedData.push({
                                    id: `miit-${index}-sub-${subIndex}`,
                                    name: `其它-${suffix}`, 
                                    value: simpleMatch[2].trim(),
                                    group: '其它-详细参数',
                                    row: index + 1,
                                    col: 1,
                                    originSheet: '工信部官网'
                                });
                            }
                        }
                    });
                } else {
                    // 普通字段
                    parsedData.push({
                        id: `miit-${index}`,
                        name: p.name,
                        value: p.value || '',
                        group: p.group || '基础信息',
                        row: index + 1,
                        col: 1,
                        originSheet: '工信部官网'
                    });
                }
            });

            sheetData.data = parsedData;

            setMiitData(sheetData);

            // 同时送入数据池，使其可被各业务模块使用
            addFile(sheetData);

            message.success(`成功导入 ${sheetData.data.length} 条参数`);
            setImportJson('');
        } catch (e) {
            message.error('解析JSON失败，请检查粘贴内容');
        }
    };


    const handleSetAsTarget = () => {
        if (miitData) {
            setTargetFile(miitData);
            setCompareMode('miit');
            message.success('已将工信部数据设置为新版本用于比对，并切换至公告对比模式');
        }
    };
    
    // 生成CSV内容
    const generateCsvContent = () => {
        if (!miitData || miitData.data.length === 0) return '';
        
        // CSV Header
        const header = ['参数名', '值', '分组'].join(',');
        
        // CSV Rows - 过滤掉空值的行
        const rows = miitData.data
            .filter(item => item.value !== null && item.value !== undefined && String(item.value).trim() !== '')
            .map(item => {
                // 处理包含逗号、换行符的值，用双引号包裹，并转义内部双引号
                const escapeCsv = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;
                return [
                    escapeCsv(item.name),
                    escapeCsv(String(item.value)),
                    escapeCsv(item.group)
                ].join(',');
            });

        return [header, ...rows].join('\n');
    };

    const handleCopyCsv = () => {
        const content = generateCsvContent();
        if (!content) return;
        
        navigator.clipboard.writeText(content).then(() => {
            message.success('已复制 CSV 数据到剪贴板');
        }).catch(() => {
            message.error('复制失败');
        });
    };

    const handleDownloadCsv = async () => {
        const content = generateCsvContent();
        if (!content) return;
        
        const { downloadCsv } = await import('../../utils/downloadCsv');
        await downloadCsv(content, `${miitData?.fileName || '工信部数据'}.csv`);
    };

    const copyBookmarkCode = () => {
        navigator.clipboard.writeText(BOOKMARKLET_CODE).then(() => {
            message.success('书签代码已复制，您可以手动新建书签并粘贴代码');
        });
    };

    // 示例公告号
    const exampleNumbers = [
        { label: 'DNC5037XXYBEVP1', desc: '吉利四川商用车（远程牌）' },
        { label: 'CA5037XXYPEV82', desc: '一汽解放（解放牌）' },
    ];

    return (
        <div className="space-y-6">
            <Steps
                current={miitData ? 3 : 0}
                items={[
                    { title: '查询公告号', description: '输入公告号跳转查询' },
                    { title: '提取数据', description: '在详情页使用书签脚本' },
                    { title: '导入数据', description: '粘贴JSON并解析' },
                ]}
                className="mb-8"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 左侧：查询与工具 */}
                <div className="space-y-6">
                    <Card title="1. 查询公告号" className="shadow-sm">
                        <Space.Compact style={{ width: '100%' }}>
                            <Input
                                size="large"
                                placeholder="请输入车辆公告号"
                                value={announcementNo}
                                onChange={(e) => setAnnouncementNo(e.target.value)}
                                onKeyPress={handleKeyPress}
                                suffix={<SearchOutlined className="text-gray-400" />}
                            />
                            <Button 
                                type="primary" 
                                size="large"
                                onClick={handleQuery}
                                disabled={!announcementNo.trim()}
                            >
                                查询
                            </Button>
                        </Space.Compact>
                        <div className="mt-3">
                            <Text type="secondary" className="text-xs">热门示例：</Text>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {exampleNumbers.map((item) => (
                                    <Button
                                        key={item.label}
                                        size="small"
                                        type="dashed"
                                        onClick={() => setAnnouncementNo(item.label)}
                                    >
                                        {item.label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </Card>

                    <Card title="2. 安装提取工具" className="shadow-sm">
                        <Alert
                            message="方法一：拖拽安装"
                            description="将下方蓝色按钮直接拖拽到浏览器书签栏。"
                            type="info"
                            showIcon
                            className="mb-4"
                        />
                        <div className="flex justify-center py-4 bg-gray-50 rounded border border-dashed border-gray-300">
                            <a 
                                ref={bookmarkLinkRef}
                                className="ant-btn ant-btn-primary ant-btn-lg cursor-grab"
                                title="拖拽我看书签栏"
                                onClick={() => { 
                                    message.info('请将此按钮拖动到书签栏，而不是直接点击哦'); 
                                }}
                            >
                                🚙 提取车辆参数
                            </a>
                        </div>
                        
                        <div className="mt-4">
                             <Alert
                                message="方法二：手动创建"
                                description={
                                    <div className="mt-2">
                                        <p>如果拖拽无效，请点击复制下方代码，手动新建一个书签并将代码粘贴到“网址”栏中。</p>
                                        <Button 
                                            size="small" 
                                            icon={<CopyOutlined />} 
                                            onClick={copyBookmarkCode}
                                            className="mt-2"
                                        >
                                            复制代码
                                        </Button>
                                    </div>
                                }
                                type="warning"
                                showIcon
                                className="mb-4"
                            />
                        </div>
                        
                        <Paragraph className="mt-2 text-xs text-gray-400 text-center">
                            (支持 Chrome, Edge, Safari, Firefox)
                        </Paragraph>
                    </Card>

                    <Card title="3. 粘贴导入数据" className="shadow-sm">
                        <TextArea
                            rows={4}
                            placeholder="请在此处粘贴书签脚本复制的JSON数据..."
                            value={importJson}
                            onChange={(e) => setImportJson(e.target.value)}
                            className="mb-3"
                        />
                        <Button 
                            type="primary" 
                            block 
                            icon={<ImportOutlined />} 
                            onClick={handleImport}
                            disabled={!importJson.trim()}
                        >
                            解析并导入
                        </Button>
                    </Card>
                </div>

                {/* 右侧：数据预览 */}
                <div className="space-y-6">
                    <Card 
                        title={
                            <div className="flex justify-between items-center">
                                <span>数据预览 {miitData && <Text type="secondary">({miitData.data.length} 参数)</Text>}</span>
                                {miitData && (
                                    <Space>
                                        <Button
                                            size="small"
                                            icon={<CopyOutlined />}
                                            onClick={handleCopyCsv}
                                        >
                                            复制CSV
                                        </Button>
                                        <Button
                                            size="small"
                                            icon={<DownloadOutlined />}
                                            onClick={handleDownloadCsv}
                                        >
                                            下载CSV
                                        </Button>
                                        <Button
                                            size="small"
                                            icon={<SaveOutlined />}
                                            disabled={!assetLibraryPath}
                                            onClick={() => setSaveModalVisible(true)}
                                        >
                                            保存至资产库
                                        </Button>
                                        <Button 
                                            type="primary" 
                                            size="small" 
                                            ghost 
                                            icon={<CheckCircleOutlined />}
                                            onClick={handleSetAsTarget}
                                        >
                                            设为新版本比对
                                        </Button>
                                    </Space>
                                )}
                            </div>
                        } 
                        className="shadow-sm h-full"
                        bodyStyle={{ padding: 0, height: '600px', overflowY: 'auto' }}
                    >
                        {miitData ? (
                            <ParametersTable data={miitData.data} />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <ImportOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                                <p>暂无数据，请先导入</p>
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            <SaveAssetModal
                visible={saveModalVisible}
                onClose={() => setSaveModalVisible(false)}
                onSave={async (fileName) => {
                    if (!assetLibraryPath || !miitData) return;
                    await saveAssetFile(assetLibraryPath, fileName, fileName, miitData.data);
                    message.success(`已保存至资产库: ${fileName}`);
                }}
                defaultName={announcementNo.trim() || miitData?.fileName || `公告_${new Date().toISOString().slice(0, 10)}`}
                defaultTags={[ASSET_SOURCE_TAGS.announcement]}
            />
        </div>
    );
};

export default AnnouncementQuery;
