import React from 'react';
import { Tag, Tooltip } from 'antd';
import {
    PlusOutlined, CheckOutlined, StarOutlined,
    WarningOutlined, HistoryOutlined, StopOutlined, CloseCircleOutlined,
    BarChartOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { AssetFileInfo } from '../../../utils/assetManager';
import { getAssetDisplayName, validateAssetName } from '../../../utils/assetNaming';
import { KEY_VEHICLE_TAG } from '../../../utils/assetGovernance';

/**
 * 车型卡片（设计文档 2026-10-13-asset-panel-redesign-v2 §4.2.4）：
 * - 点卡片 = 选中（左侧 3px 蓝条 + 浅蓝底）
 * - 点激活按钮 = 激活/移出购物车
 * - 徽章：最新版/⭐关键/⚠️命名不规范/历史/废弃/驳回
 * - 元信息：完成率 + 缺必填 + 更新时间
 */
export interface AssetCardProps {
    info: AssetFileInfo;
    tags: string[];
    metaStatus?: 'superseded' | 'deprecated';
    isLatest: boolean;
    isActive: boolean;
    isFocused: boolean;
    requiredMissingCount: number;
    onFocus: () => void;
    onToggleActive: () => void;
    onOpenInspector?: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
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
}) => {
    const displayName = getAssetDisplayName(info.fileName, info.productName);
    const namingValidation = validateAssetName(info.fileName, info.announceNos || []);
    const isKeyVehicle = tags.includes(KEY_VEHICLE_TAG);

    const fillRate = info.totalParams > 0
        ? Math.round((info.filledParams / info.totalParams) * 100)
        : 0;

    return (
        <div
            className={`
                relative bg-[var(--surface)] border rounded-[10px] px-4 py-3.5 mb-2.5 cursor-pointer
                transition-all duration-200 overflow-hidden vp-card-hover
                ${isFocused
                    ? 'bg-[var(--brand-weak)] border-[var(--brand)] shadow-[0_0_0_1px_var(--brand),var(--shadow-sm)]'
                    : 'border-[var(--border)] hover:border-[var(--brand)]'
                }
            `}
            onClick={onFocus}
            onDoubleClick={onOpenInspector}
            onContextMenu={onContextMenu}
        >
            {/* 左侧 3px 蓝条（选中态） */}
            {isFocused && (
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--brand)] vp-slide-in-left" />
            )}

            {/* 第一行：名称 + 徽章 + 激活按钮 */}
            <div className="flex items-center gap-2.5 mb-1.5">
                <div className="flex-1 min-w-0 font-semibold text-[14px] text-1 truncate" title={displayName}>
                    {displayName}
                </div>

                {/* 徽章 */}
                {isLatest && (
                    <Tag className="m-0 text-[10px] leading-[16px] px-2 rounded-md font-semibold bg-[var(--brand-weak)] text-[var(--brand)] border-[var(--brand)]">
                        最新版
                    </Tag>
                )}
                {isKeyVehicle && (
                    <Tag icon={<StarOutlined className="text-[9px]" />} className="m-0 text-[10px] leading-[16px] px-2 rounded-md font-semibold bg-[var(--bg)] text-2 border-[var(--border)]">
                        关键
                    </Tag>
                )}
                {!namingValidation.valid && (
                    <Tooltip title={namingValidation.errors.join('；')}>
                        <Tag icon={<WarningOutlined className="text-[9px]" />} className="m-0 text-[10px] leading-[16px] px-2 rounded-md font-semibold bg-[#fef3c7] text-[#92400e] border-[#fde68a]">
                            命名不规范
                        </Tag>
                    </Tooltip>
                )}
                {info.approvalStatus === '驳回' && (
                    <Tag icon={<CloseCircleOutlined className="text-[9px]" />} className="m-0 text-[10px] leading-[16px] px-2 rounded-md font-semibold bg-[#fee2e2] text-[#991b1b] border-[#fecaca]">
                        驳回
                    </Tag>
                )}
                {metaStatus === 'superseded' && (
                    <Tag icon={<HistoryOutlined className="text-[9px]" />} className="m-0 text-[10px] leading-[16px] px-2 rounded-md font-semibold bg-[var(--bg)] text-3 border-[var(--border)]">
                        历史
                    </Tag>
                )}
                {metaStatus === 'deprecated' && (
                    <Tag icon={<StopOutlined className="text-[9px]" />} className="m-0 text-[10px] leading-[16px] px-2 rounded-md font-semibold bg-[var(--bg)] text-3 border-[var(--border)]">
                        废弃
                    </Tag>
                )}

                {/* 激活按钮 */}
                <Tooltip title={isActive ? '移出工作集' : '激活进工作集'}>
                    <button
                        className={`
                            w-7 h-7 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0
                            transition-all duration-200 text-[16px] leading-none vp-btn-scale
                            ${isActive
                                ? 'bg-[var(--brand)] border-[var(--brand)] text-white hover:bg-[var(--brand-hover)]'
                                : 'bg-[var(--surface)] border-[var(--border-strong)] text-2 hover:border-[var(--brand)] hover:text-[var(--brand)] hover:bg-[var(--brand-weak)]'
                            }
                        `}
                        onClick={e => {
                            e.stopPropagation();
                            onToggleActive();
                        }}
                    >
                        {isActive ? <CheckOutlined className="text-[12px]" /> : <PlusOutlined className="text-[12px]" />}
                    </button>
                </Tooltip>
            </div>

            {/* 第二行：元信息 */}
            <div className="flex items-center gap-3 text-[11px] text-3">
                <span className="flex items-center gap-1">
                    <BarChartOutlined className="text-[11px]" />
                    完成率 <span className="text-2 font-semibold">{fillRate}%</span>
                </span>
                {requiredMissingCount > 0 && (
                    <span className="flex items-center gap-1 text-[var(--danger)]">
                        <ExclamationCircleOutlined className="text-[11px]" />
                        缺必填 <span className="font-semibold">{requiredMissingCount}</span>
                    </span>
                )}
                {info.updatedAt && (
                    <span className="ml-auto text-[11px]">
                        更新于 {new Date(info.updatedAt).toLocaleDateString('zh-CN')}
                    </span>
                )}
            </div>
        </div>
    );
};

export default AssetCard;
