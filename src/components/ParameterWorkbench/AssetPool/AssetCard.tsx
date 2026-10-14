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
 * 车型卡片（设计文档 2026-10-13-asset-pool-fluid-iter-design §3.3）：
 * - 行1：状态点（最新版=品牌色圆点）+ 名称 + 信号图标 + 激活按钮
 * - 行2：指标带（参数总数/完成率/空值，@container 自适应简化）+ 缺必填 chip
 * - 行3：标签 chips（3+N，左）+ 更新日期（右）
 * 视觉遵守曜蓝 v4.1：色彩是信号不是填充；三层表面；文字四级；--ease-ui。
 * 根节点挂 @container：窄卡（多列/窄窗）时指标带去文字标签只留数字。
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
    /** 反向定位锚点（data-asset-file；Grid 化后挂在卡片根节点） */
    fileName: string;
    requiredMissingCount: number;
    onFocus: () => void;
    onToggleActive: () => void;
    onOpenInspector?: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    batchMode?: boolean;
    batchChecked?: boolean;
    onBatchCheck?: (checked: boolean) => void;
}

const MAX_VISIBLE_TAGS = 3;

/** 完成率按档着色（口径同 AssetStatsBadge.fillRateTone） */
const fillRateTone = (rate: number) =>
    rate >= 95 ? 'text-success-text' : rate >= 60 ? 'text-warning-text' : 'text-danger-text';

const AssetCard: React.FC<AssetCardProps> = ({
    info,
    tags,
    metaStatus,
    isLatest,
    isActive,
    isFocused,
    displayName: displayNameProp,
    fileName,
    requiredMissingCount,
    onFocus,
    onToggleActive,
    onOpenInspector,
    onContextMenu,
    batchMode,
    batchChecked,
    onBatchCheck,
}) => {
    const displayName = displayNameProp ?? getAssetDisplayName(info.fileName, info.productName);
    const namingValidation = validateAssetName(info.fileName, info.announceNos || []);
    const isKeyVehicle = tags.includes(KEY_VEHICLE_TAG);

    const emptyParams = info.totalParams - info.filledParams;
    const fillRate = info.totalParams > 0
        ? Math.round((info.filledParams / info.totalParams) * 100)
        : 0;

    // 标签 chips：关键车型已用星标表达，标签行里不重复
    const nonKeyTags = tags.filter(t => t !== KEY_VEHICLE_TAG);
    const visibleTags = nonKeyTags.slice(0, MAX_VISIBLE_TAGS);
    const extraTagCount = nonKeyTags.length - visibleTags.length;

    return (
        <div
            data-asset-file={fileName}
            className={`
                @container relative rounded-lg border px-3 py-2.5 cursor-pointer h-full
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

            {/* 第一行：状态点 + 名称 + 信号图标 + 激活按钮 */}
            <div className="flex items-center gap-2">
                {batchMode && (
                    <span onClick={e => e.stopPropagation()} className="flex-shrink-0">
                        <Checkbox
                            checked={batchChecked}
                            onChange={e => onBatchCheck?.(e.target.checked)}
                        />
                    </span>
                )}

                {/* 状态点：最新版 = 品牌色圆点（v4.1 信号纪律：点，不是块） */}
                {isLatest && (
                    <Tooltip title="最新版">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
                    </Tooltip>
                )}

                <div
                    className={`flex-1 min-w-0 truncate text-title ${isFocused ? 'font-semibold' : 'font-medium'} text-1`}
                    title={displayName}
                >
                    {displayName}
                </div>

                {/* 信号图标（关键/命名问题/驳回/历史/废弃） */}
                {isKeyVehicle && (
                    <Tooltip title="关键车型">
                        <StarOutlined className="text-[12px] text-warning flex-shrink-0" />
                    </Tooltip>
                )}
                {!namingValidation.valid && (
                    <Tooltip title={namingValidation.errors.join('；')}>
                        <WarningOutlined className="text-[12px] text-warning-text flex-shrink-0 cursor-help" />
                    </Tooltip>
                )}
                {info.approvalStatus === '驳回' && (
                    <Tooltip title="准入审批驳回">
                        <CloseCircleOutlined className="text-[12px] text-danger-text flex-shrink-0" />
                    </Tooltip>
                )}
                {metaStatus === 'superseded' && (
                    <Tooltip title="历史版本">
                        <HistoryOutlined className="text-[12px] text-3 flex-shrink-0" />
                    </Tooltip>
                )}
                {metaStatus === 'deprecated' && (
                    <Tooltip title="已废弃">
                        <StopOutlined className="text-[12px] text-3 flex-shrink-0" />
                    </Tooltip>
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

            {/* 第二行：指标带（参数总数/完成率/空值）+ 缺必填 chip（行动信号） */}
            <div className="flex items-center gap-2 mt-1.5 text-aux text-3 flex-wrap">
                <Tooltip title="完成率 = 非空值参数 ÷ 参数总数（与待分析列表口径一致）">
                    <span className="tabular-nums cursor-help">
                        <span className="hidden @[300px]:inline mr-1">参数</span>
                        <span className="text-1 font-medium">{info.totalParams}</span>
                        <span className="mx-1 opacity-40">·</span>
                        <span className="hidden @[300px]:inline mr-1">完成率</span>
                        <span className={`font-medium ${fillRateTone(fillRate)}`}>{fillRate}%</span>
                        <span className="mx-1 opacity-40">·</span>
                        <span className="hidden @[300px]:inline mr-1">空值</span>
                        <span className="text-2 font-medium">{emptyParams}</span>
                    </span>
                </Tooltip>
                {requiredMissingCount > 0 && (
                    <Tag
                        icon={<ExclamationCircleOutlined className="text-[10px]" />}
                        className="m-0 text-caption leading-[16px] px-1.5 rounded font-medium text-danger-text border-danger"
                    >
                        缺必填 {requiredMissingCount}
                    </Tag>
                )}
            </div>

            {/* 第三行：标签 chips（左）+ 日期（右）；两者皆无则整行不渲染 */}
            {(visibleTags.length > 0 || info.updatedAt) && (
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {visibleTags.map(tag => (
                        <Tag
                            key={tag}
                            className="m-0 text-caption leading-[16px] px-1.5 rounded surface-inset border-default text-3"
                        >
                            {tag}
                        </Tag>
                    ))}
                    {extraTagCount > 0 && (
                        <span className="text-caption text-4">+{extraTagCount}</span>
                    )}
                    {info.updatedAt && (
                        <span className="ml-auto tabular-nums text-caption text-4">
                            {new Date(info.updatedAt).toLocaleDateString('zh-CN')}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default AssetCard;
