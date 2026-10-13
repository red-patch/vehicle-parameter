import React from 'react';
import { Tag, Tooltip, Checkbox } from 'antd';
import {
    PlusOutlined, CheckOutlined, StarOutlined,
    WarningOutlined, HistoryOutlined, StopOutlined, CloseCircleOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { AssetFileInfo } from '../../../utils/assetManager';
import { getAssetDisplayName, validateAssetName } from '../../../utils/assetNaming';
import { KEY_VEHICLE_TAG } from '../../../utils/assetGovernance';

/**
 * 车型卡片（设计文档 2026-10-13-asset-panel-redesign-v2 §4.2.4）：
 * - 点卡片 = 选中（左侧 3px 品牌条 + inset 底）
 * - 点激活按钮 = 激活/移出购物车
 * 视觉遵守曜蓝 v4.1 纪律：色彩是信号不是填充；三层表面；文字四级；--ease-ui。
 */
export interface AssetCardProps {
    info: AssetFileInfo;
    tags: string[];
    metaStatus?: 'superseded' | 'deprecated';
    isLatest: boolean;
    isActive: boolean;
    isFocused: boolean;
    /** 显示名（别名解析后的卡片标题；缺省回退 getAssetDisplayName） */
    displayName?: string;
    requiredMissingCount: number;
    onFocus: () => void;
    onToggleActive: () => void;
    onOpenInspector?: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    batchMode?: boolean;
    batchChecked?: boolean;
    onBatchCheck?: (checked: boolean) => void;
}

const AssetCard: React.FC<AssetCardProps> = ({
    info,
    tags,
    metaStatus,
    isLatest,
    isActive,
    isFocused,
    requiredMissingCount,
    onFocus,
    onToggleActive,
    onOpenInspector,
    onContextMenu,
    batchMode,
    batchChecked,
    onBatchCheck,
    displayName: displayNameProp,
}) => {
    const displayName = displayNameProp ?? getAssetDisplayName(info.fileName, info.productName);
    // 原名：别名生效时 tooltip 仍回落到原名，保证原名可追溯（设计 §D4 与检查器口径一致）
    const originalName = getAssetDisplayName(info.fileName, info.productName);
    const namingValidation = validateAssetName(info.fileName, info.announceNos || []);
    const isKeyVehicle = tags.includes(KEY_VEHICLE_TAG);

    const fillRate = info.totalParams > 0
        ? Math.round((info.filledParams / info.totalParams) * 100)
        : 0;

    return (
        <div
            className={`
                relative rounded-lg border px-3.5 py-2.5 mb-1.5 cursor-pointer
                transition-colors duration-150 overflow-hidden
                ${isFocused
                    ? 'surface-inset border-brand'
                    : 'surface-container border-default hover:border-line-strong'
                }
            `}
            style={{ transitionTimingFunction: 'var(--ease-ui)' }}
            onClick={onFocus}
            onDoubleClick={onOpenInspector}
            onContextMenu={onContextMenu}
        >
            {/* 左侧 3px 选中条（信号：线，不填充） */}
            {isFocused && (
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-brand" />
            )}

            {/* 已激活常驻弱信号：右缘成功色条（沿用 --asset-active-bar 纪律） */}
            {isActive && !isFocused && (
                <div className="absolute right-0 top-0 bottom-0 w-[3px] bg-success opacity-60" />
            )}

            {/* 第一行：名称 + 徽章 + 激活按钮 */}
            <div className="flex items-center gap-2">
                {batchMode && (
                    <span onClick={e => e.stopPropagation()} className="flex-shrink-0">
                        <Checkbox
                            checked={batchChecked}
                            onChange={e => onBatchCheck?.(e.target.checked)}
                        />
                    </span>
                )}
                <div
                    className={`flex-1 min-w-0 truncate text-title ${isFocused ? 'font-semibold' : 'font-medium'} text-1`}
                    title={displayName === originalName ? displayName : `${displayName}\n${originalName}`}
                >
                    {displayName}
                </div>

                {/* 徽章：信号色只上文字/边/点 */}
                {isLatest && (
                    <Tag className="m-0 text-[11px] leading-[18px] px-1.5 rounded font-medium text-brand border-brand bg-brand-weak">
                        最新版
                    </Tag>
                )}
                {isKeyVehicle && (
                    <Tooltip title="关键车型">
                        <StarOutlined className="text-[13px] text-warning flex-shrink-0" />
                    </Tooltip>
                )}
                {!namingValidation.valid && (
                    <Tooltip title={namingValidation.errors.join('；')}>
                        <WarningOutlined className="text-[13px] text-warning-text flex-shrink-0 cursor-help" />
                    </Tooltip>
                )}
                {info.approvalStatus === '驳回' && (
                    <Tag icon={<CloseCircleOutlined className="text-[10px]" />} className="m-0 text-[11px] leading-[18px] px-1.5 rounded font-medium text-warning-text border-warning">
                        驳回
                    </Tag>
                )}
                {metaStatus === 'superseded' && (
                    <Tag icon={<HistoryOutlined className="text-[10px]" />} className="m-0 text-[11px] leading-[18px] px-1.5 rounded text-3 border-default">
                        历史
                    </Tag>
                )}
                {metaStatus === 'deprecated' && (
                    <Tag icon={<StopOutlined className="text-[10px]" />} className="m-0 text-[11px] leading-[18px] px-1.5 rounded text-3 border-default">
                        废弃
                    </Tag>
                )}

                {/* 激活按钮 */}
                <Tooltip title={isActive ? '移出工作集' : '激活进工作集'}>
                    <button
                        className={`
                            w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0
                            transition-colors duration-150
                            ${isActive
                                ? 'bg-brand border-brand text-white hover:opacity-90'
                                : 'surface-container border-line-strong text-3 hover:border-brand hover:text-brand'
                            }
                        `}
                        style={{ transitionTimingFunction: 'var(--ease-ui)' }}
                        onClick={e => {
                            e.stopPropagation();
                            onToggleActive();
                        }}
                    >
                        {isActive ? <CheckOutlined className="text-[11px]" /> : <PlusOutlined className="text-[11px]" />}
                    </button>
                </Tooltip>
            </div>

            {/* 别名生效时原名副行（设计 §D4：别名只改显示，原名可追溯） */}
            {displayName !== originalName && (
                <div className="mt-0.5 text-caption text-3 truncate" title={originalName}>
                    {originalName}
                </div>
            )}

            {/* 第二行：元信息（aux 字号，三级文字） */}
            <div className="flex items-center gap-3 mt-1 text-aux text-3">
                <span className="tabular-nums">
                    完成率 <span className="text-2 font-medium">{fillRate}%</span>
                </span>
                {requiredMissingCount > 0 && (
                    <span className="flex items-center gap-1 text-danger-text">
                        <ExclamationCircleOutlined className="text-[11px]" />
                        缺必填 <span className="font-medium">{requiredMissingCount}</span>
                    </span>
                )}
                {info.updatedAt && (
                    <span className="ml-auto tabular-nums">
                        {new Date(info.updatedAt).toLocaleDateString('zh-CN')}
                    </span>
                )}
            </div>
        </div>
    );
};

export default AssetCard;
