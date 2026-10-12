# 字段关联方案：规则置顶 + 方案选择双向联动 — 设计方案

> 日期：2026-10-12 ｜ 状态：**已实施**
> 来源：用户实操反馈。截图中「字段关联方案管理」抽屉有 16 条规则，要调顺序只能靠 ↑ 逐格移动，字段一多就难以操作；且抽屉内选中的方案与外层「智能填报 · 多车取数」的方案下拉互不相干，外面选好的方案进抽屉后还要再切一次。
> 关联：[BidMappingDrawer.tsx](../../src/components/ParameterWorkbench/BidMappingDrawer.tsx)、[BidPullView.tsx](../../src/components/ParameterWorkbench/BidPullView.tsx)、`src/utils/bidFieldMapping.ts`、`AGENTS.md`（纯函数优先放 `src/utils/`；热点文件约束）

## 1. 问题

两处，都在同一个抽屉内：

**(a) 排序成本随字段数线性上升。** [BidMappingDrawer.tsx:136](../../src/components/ParameterWorkbench/BidMappingDrawer.tsx:136) 只提供 `moveRule(ruleId, ±1)`，即 `renderRule` 里的 ↑ / ↓ 两个按钮。把第 12 条移到第 1 条需要点 11 次；批量添加（`handleBatchAdd`）按用户粘贴的顺序追加到末尾，导出的 CSV / Excel 也按此顺序出行，所以顺序错位的代价是**导出文件的行序不对**，必须纠正。

**(b) 方案选择不联动。** 抽屉的草稿在挂载时初始化：

```ts
const [activeSchemeId, setActiveSchemeId] = useState<string | null>(() => getBidSchemesSync()[0]?.id ?? null);
```

写死取**第一个**方案，完全不读 store 里已持久化的 `bidPullSchemeId`（[vehicleStore.ts:566](../../src/store/vehicleStore.ts:566)）。后果：用户在外部取数面板选好「资产托管地上铁推荐车型目录（16 项）」，点「管理方案」进来看到的却是方案列表的第一项，得再切一次才落到目标方案。

## 2. 目标与非目标

**目标**

1. 单条规则可一步移到首位，保留现有 ↑↓ 做相邻微调。
2. 抽屉与外部取数面板共用「当前方案」这一状态：外面选好 → 打开抽屉直接落在该方案；抽屉里切换 → 外部取数矩阵同步切换。

**非目标**

- 不引入拖拽排序（需 HTML5 DnD 或新依赖，jsdom 下难测，本轮不做）。
- 不加「置底」、批量重排、按名称排序、字母/拼音排序。
- 不改方案的数据格式与落盘结构（`custom_bid_field_mappings.json` 不变）。
- 不动外部取数矩阵的取数、修正、导出逻辑。

## 3. 设计

### 3.1 规则置顶

纯函数进 `src/utils/bidFieldMapping.ts`（本仓库约定：逻辑放 utils 便于测试）：

```ts
/** 把指定 id 的规则移到首位；id 不存在或已在首位时返回原数组引用 */
export function moveRuleToFront<T extends { id: string }>(rules: T[], ruleId: string): T[] {
    const index = rules.findIndex((rule) => rule.id === ruleId);
    if (index <= 0) return rules;
    return [rules[index], ...rules.slice(0, index), ...rules.slice(index + 1)];
}
```

- 泛型 + 仅依赖 `id`，便于用纯数据单测，不牵扯 antd 组件。
- 未命中 / 已在首位时**返回原引用**，让 `setSchemes` 的更新可被 `Object.is` 识别为无变化，避免无意义重渲染。

抽屉侧（[BidMappingDrawer.tsx:136](../../src/components/ParameterWorkbench/BidMappingDrawer.tsx:136) 附近）新增：

```ts
const moveRuleToTop = (ruleId: string) =>
    updateSchemes((scheme) => ({ ...scheme, rules: moveRuleToFront(scheme.rules, ruleId) }));
```

UI（`renderRule`，[BidMappingDrawer.tsx:234](../../src/components/ParameterWorkbench/BidMappingDrawer.tsx:234)）：在 ↑ 左侧插入一个置顶按钮，复用现有按钮规格。

```tsx
<Button size="small" type="text" title="置顶" icon={<VerticalAlignTopOutlined />}
        disabled={index === 0} onClick={() => moveRuleToTop(rule.id)} />
```

- 图标用 `@ant-design/icons` 的 `VerticalAlignTopOutlined`（已有依赖，无新增包）。
- 禁用条件与 ↑ 一致（`index === 0`），无需额外文案解释。
- 规则序号、`{0}/{1}` 来源下标都由数组位置实时推导，置顶后模板占位符自动随之重排，无额外处理。

### 3.2 方案选择双向联动

现状两处状态各自为政：抽屉的 local `activeSchemeId`（草稿态）与 store 的 `bidPullSchemeId`（外部选中态）。

**改法**：让 store 的 `bidPullSchemeId` 成为「当前方案」的唯一真源，抽屉不再自持 `activeSchemeId`。

```ts
// SchemeEditor 内
const { bidPullSchemeId, setBidPullSchemeId } = useVehicleStore(useShallow((s) => ({
    bidPullSchemeId: s.bidPullSchemeId,
    setBidPullSchemeId: s.setBidPullSchemeId,
})));
// bidPullSchemeId 为空（首次使用 / 指向的方案已被删）时回退首个方案
const activeSchemeId = bidPullSchemeId ?? schemes[0]?.id ?? null;
```

`schemes` 仍是挂载时的深拷贝草稿（`cloneSchemes(getBidSchemesSync())`），只把「选中哪个方案」这一维上移。回退值只在**读取**时生效，不回写 store——回写交给 [BidPullView.tsx:138](../../src/components/ParameterWorkbench/BidPullView.tsx:138) 已有的兜底 effect 完成，避免两处同时回写。行为对照：

| 动作 | 改后行为 |
|---|---|
| 外部选方案 B → 打开抽屉 | 抽屉直接落在 B |
| 抽屉里切到 C | 外部取数矩阵同步切到 C |
| 新建 / 复制方案 | 照旧切到新方案，外部同步跟随 |
| 删除当前方案 | 切到剩余首个（现有 `handleRemoveScheme` 逻辑），外部同步跟随 |
| 点「取消」 | `schemes` 草稿丢弃；**当前方案 id 不回滚** |
| 点「保存方案」 | 现有流程不变：落盘 → `reloadBidMappings` → `bumpBidMappingsVersion()`，外部矩阵按新规则重算 |

两点需要说明：

- **取消不回滚方案 id**：取消槽位切换会撤销已经发生的浏览动作，而方案 id 本来就随交互实时持久化（`bidPullSchemeId` 在 `partialize` 白名单内，[vehicleStore.ts:603](../../src/store/vehicleStore.ts:603)），与「取消不校验、不撤销已保存数据」的通用取消语义一致。取消要丢的是未保存的规则编辑，这一点不受影响。
- **`handleRemoveScheme` 的写法要跟着改**：现在它在 `setSchemes` 的 updater 内部调用 `setActiveSchemeId`（[:119](../../src/components/ParameterWorkbench/BidMappingDrawer.tsx:119)），这是「在 updater 里做副作用」。改为先在 updater 外算出剩余方案，再分别 `setSchemes` 与 `setBidPullSchemeId`，避免在 React 严格模式下 updater 被调用两次导致的状态抖动。

外部无需改动：[BidPullView.tsx:138](../../src/components/ParameterWorkbench/BidPullView.tsx:138) 已有一条「记住的方案被删时回写首个方案 id」的兜底 effect，与新行为兼容。

## 4. 测试

改了逻辑（utils 纯函数 + 组件状态），四条验证命令全跑：`npm run lint` / `npm run typecheck` / `npm run test` / `npm run build`。

**新增测试**

1. `src/utils/__tests__/bidFieldMapping.test.ts` 补 `moveRuleToFront` 一节：置顶中间条 / 末条 / 首条（应返回原引用）/ id 不存在（应返回原引用）/ 空数组。
2. 抽屉联动：`src/components/ParameterWorkbench/__tests__/` 下新建，仿 `CompareView.mergeByFieldName.test.tsx` 的共享 `mockState` + `vi.mock('store/vehicleStore')` 写法，断言：
   - `bidPullSchemeId` 指向非首个方案时，抽屉下拉显示的是该方案；
   - `bidPullSchemeId` 为 `null` 时回退显示首个方案，且不回写 store；
   - 在抽屉里改选方案会调用 `setBidPullSchemeId`；
   - 点第 2 条的置顶按钮后，目标字段输入框的顺序变为「第 2 条在前」。默认方案 `createDefaultBidScheme()` 有 13 条固定规则，测试数据确定。

若 antd `Drawer` 在 jsdom 下的挂载成本过高（渲染慢或 Portal 行为异常），退一步只保留纯函数测试，联动改为手动验证，并在收尾报告里明说哪条没测。

## 5. 已知取舍

- 抽屉里切换方案会**立即改变外部取数矩阵**。这正是本轮要的效率，代价是误点下拉会当场换掉外面正在看的取数结果——不丢数据（切回即恢复），但属于「操作即时可见」而非「保存后生效」。
- 置顶按钮使每行多一个按钮（现在每行 4 个图标），在 720px 宽的抽屉里仍有余量。
