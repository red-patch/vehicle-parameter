# 公告中心 — 公告参数/PDF 归档 + 资产公告比对 — 设计方案

> 日期：2026-10-01 ｜ 状态：P1–P5 已实施（同日落码；33 个新单测 + 迁移 dry-run 13/13 通过。实机 UI 交互与真实迁移点击待用户验证）
> 前置文档：`2026-09-28-asset-governance-primary-design.md`（治理模型）、`2026-09-30-asset-facets-lifecycle-design.md`（多维筛选）。
> 领域术语已登记 `CONTEXT.md`（公告记录 / 公告中心 / 公告批次 / 公告比对）。

## 1. 背景与目标

现状：公告查询 = 外部浏览器 + 书签脚本 + 粘贴回传（`AnnouncementQuery.tsx`，431 行）；解析出的公告参数作为「公告数据」标签资产存入资产库（现存 **13 个**），与真实车型资产混杂——公告参数少、生命周期与车型完全不同，混在一起导致管理混乱。

目标：
1. **公告记录独立管理**：公告参数与公告 PDF 统一归档为公告记录，彻底撤出资产库；
2. **PDF 规范化归档**：手动/引导拾取浏览器下载的 PDF，按 `{车型名}_{公告号}_{批次}` 命名；
3. **自动关联**：车型资产 ↔ 公告记录按公告号运行时 join（多对一），资产面板一键查看 PDF；
4. **公告比对**：专用 diff 面板，以公告为准逐项核对资产参数，找出资产错误项。

## 2. 领域模型（Q5、Q14 裁定）

- **公告记录 (AnnouncementRecord)** = 元数据 + 参数集 + 可选 PDF，是公告中心的最小单位。一个公告号可有多个批次记录。
- 公告记录**不进资产库**：不参与资产扫描、治理、facet、去重、标签、生命周期。
- **关联 = 纯公告号运行时 join**：资产侧 `effectiveAnnounceNos` ↔ `record.announceNo`。多对一（同公告号多个 ZR 重报资产共享一份公告记录）。关联关系不落任何存储，永不人工指定。
- **本地优先**（Q4、Q11）：查询先查公告中心记录，命中则不跳浏览器；PDF 仅归档供人查看，**不做 PDF 内容解析**，参数仍来自书签脚本。

## 3. 数据设计

### 3.1 目录与命名（Q2、Q3、Q14 裁定）

```
{assetLibraryPath}/
  公告PDF/                                  ← 平铺，无中央索引
    远程V8E_DNC5037XXYBEVP1_第389批.pdf
    远程V8E_DNC5037XXYBEVP1_第389批.json    ← 唯一事实源（元数据+参数）
    ...
```

- 每条公告 = **同名 .json + .pdf 一对**；JSON 存在即记录存在，PDF 可缺（只参数、或迁移来的）。
- 批次缺省时文件名省略批次段：`{车型名}_{公告号}.json/.pdf`。
- 文件名清洗：`/ \ : * ? " < > |` 及控制字符；不同公告号撞名 → `(2)` 序号后缀（Q2）。
- JSON 同名配对：只有 PDF 无 JSON 的孤儿文件在列表中显示为「待认领」，一键按文件名反解预填建档。
- v1 不提供重命名（删了重导；与资产「永不改文件名」同理，避免 JSON/PDF 双文件同步问题）。

### 3.2 公告记录 JSON schema

```jsonc
{
  "version": "1.0",
  "announceNo": "DNC5037XXYBEVP1",     // 关联键
  "batch": "第389批",                   // 可空；取参数「批次」或导入时人工填（Q7）
  "vehicleName": "远程V8E",             // 文件名车型名；预填链：参数「产品名称」→ 人工填（Q2）
  "sourceUrl": "https://service.miit-eidc.org.cn/...",
  "importedAt": "2026-10-01T10:00:00+08:00",
  "pdfFile": "远程V8E_DNC5037XXYBEVP1_第389批.pdf",  // 同目录文件名，可空
  "parameters": [ /* VehicleParameter[]，与粘贴导入产出同构 */ ]
}
```

### 3.3 读取路径

- Rust 新命令 `scan_announcements(path) -> Vec<AnnouncementInfo>`：扫 `公告PDF/*.json` 元数据（announceNo/batch/vehicleName/importedAt/hasPdf/paramCount），**不含 parameters 全量**——参数按需 `readTextFile` 懒加载（与 `scan_asset_library` 同风格）。
- `scan_asset_library` 需确认跳过 `公告PDF/` 子目录（实施时验证当前是否递归）。
- capabilities 无需新增：fs scope 已是 `**`，opener 已有 `open-path`/`reveal-item-in-dir`。

## 4. 功能设计

### 4.1 公告中心（AnnouncementQuery.tsx 升级，Q6）

**布局（2026-10-01 用户反馈后重排）**：主体 = **公告归档列表**（全宽，紧跟操作区）；顶部一行两张紧凑小卡（查询公告号 / 粘贴导入），「安装提取工具」降级为按需打开的抽屉（书签装一次就不再需要）；**数据预览 = 右侧抽屉**，粘贴导入后自动弹出、也可随时点「数据预览(N)」打开，无数据时完全不占版面（此前常驻 600px 空白卡、归档垫底，本末倒置——用户裁定修正）。

查询/导入行为（在三步流程上增量）：

- **查询按钮本地优先**（Q11）：先按公告号查记录；命中 → 不跳浏览器，原地显示「本地已归档」面板（**载入参数** / **打开 PDF**（无 PDF 则禁用）/ **仍要跳网页**）；未命中 → 照旧 `openUrl`。同公告号多批次记录全部列出，最新在前。载入参数 = 把记录 parameters 装回现有内存态 `miitData`（比对目标、CSV 导出流程不动）。
- **粘贴导入成功后**（Q10）：「保存至资产库」替换为「保存到公告中心」（创建/更新记录 JSON）；同屏拾取提示「刚在浏览器下载了 PDF？[选择文件…]」引导导入。**存参数与归档 PDF 是两个独立动作，互不强制**。

下半部 → **主体**：**已归档公告列表**。

- 列：车型名 / 公告号 / 批次 / 有无 PDF / 参数数 / 关联资产数 / 导入时间；搜索（车型名/公告号/批次）+ PDF 有无筛选。
- 行操作：打开 PDF（`openPath`）、**复制**（PDF 文件引用进系统剪贴板，微信/邮件/Finder 直接粘贴，Rust 命令走 osascript 写 `POSIX file`）、**参数**（抽屉查看记录参数字段，懒加载）、在 Finder 中显示（`revealItemInDir`）、删除（§4.3）、查看关联资产（跳资产面板并按公告号过滤）。
- 关联资产数 = 运行时 join 资产扫描结果（按文件去重）。

### 4.2 PDF 导入弹窗（Q1、Q9、Q12）

- 预填：车型名（参数「产品名称」）/ 公告号（当前查询上下文）/ 批次（参数「批次」，缺省人工填）；独立入口（不经粘贴流程）时三字段人工填。
- 动作：**复制**到 `公告PDF/`（fs `copyFile`）+ 可选勾选「归档后把原文件移到废纸篓」。
- 冲突：同公告号+同批次再次导入 → **默认替换**（确认弹窗，可改选并存 `(2)`）；其余撞名 → `(2)` 后缀。
- v1 单文件导入；拖拽与 Downloads 自动监听（fs `watchImmediate` 现成）为后续增强。

### 4.3 删除（Q8）

确认弹窗 → **JSON 与 PDF 一起移入 macOS 废纸篓**（Rust 新命令 `move_to_trash`，`trash` crate——fs 插件 2.4.4 无 trash API，已验证）+ 移除记录。无 PDF 则仅移 JSON。

### 4.4 资产侧关联 UI（Q5、Q17）

- 资产行右键菜单（`buildAssetContextMenu`）新增两项：
  - **查看公告 PDF**：按 effectiveAnnounceNos 找记录，未命中 → 提示「未归档」+ 跳公告中心查询；命中多条批次 → 弹选择（默认最新）。
  - **与公告对比**（§4.5）。
- 聚焦详情区加同款按钮；GroupFileRow hover 区不加（右键菜单已够）。
- 批次不落到资产上——只存在记录 JSON 与文件名里。

### 4.5 公告比对（Q16、Q17、Q18）

- 专用轻量抽屉（`AnnouncementDiffDrawer`），**不跳通用 DiffViewer**。
- 流程：按公告号定位记录（多批次默认最新、可切换）→ 参数配对 → 逐项渲染：参数名 ｜ 资产值 ｜ 公告值（基准列）｜ 一致/不一致；不一致标红。
- 顶部汇总：共 N 项可比，M 项不一致；单侧独有参数分「仅公告有 / 仅资产有」两组。
- 配对口径：参数名精确匹配（trim 后）起步，跑一轮看命中率，命中率低再上别名映射表。
- **v1 只读**；「以公告为准修正写回资产」是紧随其后的独立迭代（写回资产文件需单独设计确认流程）。
- 配对/diff 逻辑独立纯函数模块 `src/utils/announcementCompare.ts`，可测。

## 5. 模块改动清单

**Rust（src-tauri）**
- `lib.rs`：注册 `move_to_trash(path)`、`scan_announcements(path)`；Cargo.toml 加 `trash` crate。
- `assets.rs` / `scan_asset_library`：确认排除 `公告PDF/` 子目录。

**前端**
- `src/components/AnnouncementQuery/`：`AnnouncementQuery.tsx` 升级为公告中心壳；新拆 `AnnouncementArchiveList.tsx`、`AnnouncementImportModal.tsx`（PDF 导入弹窗）、`AnnouncementPickupPrompt.tsx`（拾取提示）。
- `src/utils/announcementRecord.ts`（纯函数）：记录读写、文件名生成/清洗/反解、重名与冲突策略。
- `src/utils/announcementCompare.ts`（纯函数）：参数配对 + diff。
- `src/store/`：公告记录状态独立轻量 store（列表/加载/CRUD），**不**继续膨胀 vehicleStore。
- `src/components/ParameterWorkbench/`：右键菜单两项、详情区按钮、`AnnouncementDiffDrawer.tsx`。
- 迁移完成后退役（§6）：`effectiveAnnounceNos` 的公告数据特例、SaveAssetModal 公告流程、`assetSourceTags.announcement` 仅保留读旧数据。

## 6. 存量迁移（Q15，一次性工具）

- 入口：公告中心工具栏「从资产库迁移公告数据」。
- 范围：`_asset_tags.json` 中带「公告数据」标签的资产（现存 **13 个**）。
- 每文件 → 公告记录 JSON：announceNo 取该资产公告号（公告数据资产即 vehicleModel 口径）、batch 取参数「批次」（缺省空）、vehicleName 取「产品名称」（缺省文件名首段）、pdfFile 空、parameters 全量带入、importedAt 取资产 updatedAt。
- 确认清单弹窗 → 执行：写公告 JSON + 原资产文件移入废纸篓。
- 迁移完成后退役 §5 末列出的公告数据特例代码，资产库回归「一个文件 = 一辆真实的车」。

## 7. 非目标（明确不做）

- 应用内 PDF 预览（pdf.js + asset protocol）——后续可选，v1 用系统 Preview；
- Downloads 自动监听拾取、窗口拖拽导入——后续增强；
- PDF 内容解析出参数——参数永远来自书签脚本；
- 人工指定资产↔公告关联——纯公告号自动 join；
- 对比结果一键修正写回——下一迭代单独设计；
- 扩展书签脚本抓批次——参数里有就用，没有人工填。

## 8. 实施顺序与验证

| 阶段 | 内容 | 验证 |
|---|---|---|
| P1 | 记录 schema + announcementRecord.ts + Rust 两命令 + 公告中心列表 | lint + test + build |
| P2 | PDF 导入弹窗 + 拾取提示 + 查询本地优先 | lint + test + build |
| P3 | 资产侧右键菜单/详情按钮 + 关联跳转 | lint + test + build |
| P4 | announcementCompare.ts + 对比抽屉 | lint + test + build |
| P5 | 迁移工具 + 特例退役 | lint + test + build + 真机迁移 13 个文件 |

热点文件约束：不改 `DataSourcePanel.tsx` 主体，新增逻辑全部落独立文件；右键菜单/详情按钮是既有扩展点的小增量。
