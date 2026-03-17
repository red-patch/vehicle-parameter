# 待分析车型同步架构收口设计

**背景**

当前工作台已经把 `selectedProductNames` 作为“待分析车型”的全局工作集，但下游模块对它的继承还不完全一致：

- `CompareView`、`SmartFillView`、`DataPurifyView`、`MultiVehicleView` 都以 `selectedProductNames` 为候选来源
- 资产明细 `assetFiles` 的同步是异步完成的，候选集与真实数据会出现时间差
- 只有 `CompareView` 显式处理了“已选中但数据仍在同步”的中间态
- `CompareView` 与 `MultiVehicleView` 还共用了同一份局部选择状态
- 资产面板仍残留少量按纯车型名判断激活状态的旧逻辑

**目标**

- 4 个后续模块只继承「待分析车型」作为候选来源
- 每个模块保留自己的局部选择状态，但必须始终是待分析车型的子集
- 对“资产数据同步中”的中间态采用统一判断和统一提示
- 清理掉资产面板中残留的旧语义判断

**目标架构**

分三层：

1. 原始数据层  
   `uploadedFiles`、`activeAssets`、`assetFiles`

2. 全局工作集层  
   `selectedProductNames`
   这是 4 个后续模块唯一的候选车型来源

3. 模块局部选择层  
   - `currentCompareProducts`
   - `currentMultiVehicleProducts`
   - `currentSmartFillProduct`
   - `currentPurifyProduct`

这 4 份局部状态都必须由 `selectedProductNames` 自动剪枝。

**同步状态**

增加统一的“实例数据状态”判断：

- `ready`: 已能从 `uploadedFiles/assetFiles` 取到数据
- `pending`: 资产实例已进入工作集，但对应 `assetFiles` 还未同步完成
- `missing`: 候选存在，但当前既无数据也不处于有效同步中

由下游模块统一消费这套状态，而不是各自把“空数据”误判成“无结果”。

**影响范围**

- `vehicleStore`
- `DataSourcePanel`
- `CompareView`
- `SmartFillView`
- `DataPurifyView`
- `MultiVehicleView`

**验证标准**

- 4 个模块候选集都只来自 `selectedProductNames`
- `CompareView` 与 `MultiVehicleView` 的局部选择互不影响
- 当资产数据尚未同步完成时，4 个模块都能显示明确的“同步中”反馈
- 资产面板的“已激活/可批量激活”判断与实例键体系一致
