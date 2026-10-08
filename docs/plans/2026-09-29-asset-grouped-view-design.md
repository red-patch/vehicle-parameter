# 资产面板车型分组视图 + 车型组重命名

> 日期：2026-09-29　状态：已实施（未提交）

## 1. 车型分组视图（AssetGroupedView.tsx）

资产面板从"文件平铺列表"升级为"车型 → 文件"两级导航；平铺视图保留为切换项。

- **双视图**：`[车型|平铺]` Segmented 切换（`asset-panel-view-mode` localStorage，分组默认）。
- **组头**：车型名 + 级别计数（准入/开发）+ 状态角标（驳回数/废弃数/缺👑警告）+ ⚡一键激活主文件（缺👑时按体检建议激活并提示）+ hover 编辑按钮（重命名入口）+ 右键菜单。
- **组内紧凑行**：👑徽章 + 文件名 + 标签徽章（最多 2 个 + `+N`，悬停显示全量）+ 状态/级别图标 + 填充率% + 更新日期；hover 渐显"加入工作区/Finder"；右键菜单与平铺卡片共用 `buildAssetContextMenu`（单一来源）。
- **组内排序**：`sortGroupFiles` 纯函数——👑主文件 → 已审核准入 → 其它 → 历史 → 废弃；同级 updatedAt 新→旧 → 文件名。
- **筛选联动**：搜索/标签/公告号筛选命中即自动展开命中组，无命中组隐藏；"👑只看主文件"在分组视图=每组仅显示主文件行。
- **展开记忆**：`asset-panel-expanded-groups` localStorage；含激活资产的组自动展开。
- 数据源复用 `buildGovernanceReport(...).groups`（按筛选裁剪 + `sortGroupFiles`），无新增存储。

## 2. 车型组重命名（修正组显示名，与文件名解耦）

案例：`金龙8S-XMQ5035XXYBEVL04` 因品牌前缀剥离被推导为"8S"组，而真实车型名为"龙耀8S"；`白犀牛R3_20260309` 被推导为"R3"组。另有反例：`V6E（客运版）` 若整段替换会丢失"客运版"变体后缀。

**文件名与车型名彻底解耦，显示名同时是归组依据**：重命名只写 meta `groupName`，永不改动文件名（`buildGroupRenamePlan` 已删除）。归组键改为 `resolveVehicleGroupKey`——有 `groupName` 用 `normalizeGroupKey`（去空白+拉丁大写，与推导键同口径），缺省回落 `deriveVehicleGroupKey`。

- **同名自动合并**：把组改名成与既有组同名（无论对方是推导键还是人工显示名）→ 两组合并；弹窗实时预览"保存后两组合并（共 N 个文件）"，合并后多主文件时提示去治理体检处理。
- **异名自动拆出**：改成不同名 → 该组以新键独立成组。
- 弹窗按钮固定为"保存显示名"，含 `onCancel`；说明文案解释解耦与合并规则。
- `sanitizeGroupName` 放宽为仅 trim + 折叠空白（显示名允许任意字符）。
- 组头 tooltip 与治理报告弹窗均显示 `pickGroupAlias` 别名；tooltip 仅在别名≠归组键时标注归组键。

## 3. 验证

- `sortGroupFiles` / `sanitizeGroupName` / `resolveVehicleGroupKey` / `pickGroupAlias` 等纯函数测试 34 用例全过（含同名合并/异名拆分链路用例）。
- build ✓；lint 零新增（DataSourcePanel 存量 catch(e) 家族除外）。
