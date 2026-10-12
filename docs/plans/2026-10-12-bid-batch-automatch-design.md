# 批量添加目标字段时自动绑定来源 — 设计方案

> 日期：2026-10-12 ｜ 状态：**已实施**
> 来源：用户实操反馈。「智能匹配来源」现在只能逐条点，而批量添加恰恰是一次填 10 个字段的场景——10 次点击正是想省掉的。
> 关联：[BidMappingDrawer.tsx](../../src/components/ParameterWorkbench/BidMappingDrawer.tsx)、[matchingEngine.ts](../../src/utils/matchingEngine.ts)、[2026-10-12-bid-scheme-usability-design.md](./2026-10-12-bid-scheme-usability-design.md)（同一抽屉的上一轮改动）

## 1. 目标与非目标

**目标**：批量添加目标字段时，能唯一确定的直接绑好来源，用户只需处理没绑上的少数。

**非目标**

- 不做「一键给全部已有规则绑定」（批量添加是一次性入口，改历史规则是另一件事）。
- 不自动绑模糊匹配结果——模糊就是多候选，等于替用户在多个里猜。
- 不引入后台/异步匹配（候选集是内存里的全集，同步跑即可）。

## 2. 关键约束：「唯一确定」不等于 `matchType !== 'fuzzy'`

`findBestMatch` 的 `matchType` 有 `exact | normalized | alias | fuzzy | none`，直觉上「非 fuzzy 即确定」，但实测不成立——同义词库里有**跨组别名**，同一个名字属于多个组：

```
状态    → 停产日期、停售日期
乘员数  → 驾驶室准乘人数、额定载客(含驾驶员)
```

`findBestMatch` 遍历 `PARAMETER_ALIASES` 时返回**先遇到**的那一组，所以「状态」会稳定地绑到「停产日期」——看着像确定，其实是任意挑的。自动绑定必须自己判唯一性，不能复用 `findBestMatch` 的结论。

同一类坑还有归一化撞名：`轴距(mm)` 与 `轴距(cm)` 归一化后都是 `轴距`，而 `getOrCreateNormalizedMap` 对同名只留**首个**，照着它绑也会静默挑错。

## 3. 设计

新增纯函数 `findUniqueMatch(queryName, candidates)`（`src/utils/matchingEngine.ts`），只在唯一时返回候选，否则返回 `undefined`：

1. **完全同名** → 直接采用。名字一模一样是最强信号，与 `findBestMatch` 的优先级一致；此时不做唯一性检查（同名重复在语料里不出现，且用户看见的就是这个名字）。
2. **归一化同名** → 再查一次全量候选，**恰好一个**才采用；撞名（`轴距(mm)`/`轴距(cm)`）判不确定。
3. **同义词** → 查询名必须只属于**一个**组（跨组即不确定）；把组内全部名字（标准名 + 别名）能命中的候选汇总去重，**恰好一个**才采用。
4. 其余（含模糊相近）→ `undefined`。

为支持第 2、3 步的「全量同名候选」，另建 `candidatesByNormalizedName`（归一化名 → **全部**候选）。不能复用 `getOrCreateNormalizedMap`：它只留首个，正是撞名判不出来的原因。

结果只用于**预填** `rule.sources`，用户仍可改、可删、可加，所以判不准时留空（`undefined`）比猜一个更符合预期。

抽屉侧（`handleBatchAdd`）：在 `setSchemes` 的 updater **之外**算好新增规则（updater 在严格模式下会调用两次，往里塞副作用会重复计数——与上一轮 `handleRemoveScheme` 同一教训），提示语按自动绑定数量分化：

- 有自动绑定：`已添加 N 个目标字段，其中 M 个已自动匹配来源`
- 无：`已添加 N 个目标字段`
- 全部重名：`没有新增字段（与现有字段重名）`

现有的逐条「智能匹配来源」保留不动，用于补齐批量没绑上的少数。

## 4. 测试

- `src/utils/__tests__/findUniqueMatch.test.ts`（10 例）：精确优先于同组别名、归一化差异、别名唯一命中、组内多候选不确定、跨组别名（状态/乘员数）不确定、归一化撞名不确定、模糊不绑、空输入/无候选。
- `src/components/ParameterWorkbench/__tests__/BidMappingDrawer.autoMatch.test.tsx`：真实 store + 渲染抽屉，批量粘贴 `轴距 / 车长 / 状态`，断言前两条自动绑上、跨组的「状态」留空。

四条验证命令全绿：lint / typecheck / test（473 通过，56 文件）/ build。

## 5. 测试环境备忘（本轮新增）

- antd 会给**两个汉字**的按钮插一个空格再排版（「添加」渲染成「添 加」），按 `textContent` 找按钮时必须先去空白。
- 来源字段是 `AutoComplete`，placeholder 挂在展示层而非真 `input` 上，按 placeholder 取不到值；测试里按 `input.ant-select-input` 取（空值滤掉——未绑定的规则不渲染来源行）。
