# 重构方案 A：性能优化与 Rust 下沉

> 版本：v1.2 · 2026-09-26 · 状态：Phase 1-6 已实施（Phase 6 结论：生产构建无需进一步优化）

## 背景

用户痛点为"整体迟缓 / 内存高"。排查结论：应用是"薄壳原生、重前端"形态（Rust 侧仅 32 行、0 个自定义 command），性能问题全部来自应用层实现，与 Tauri 平台天花板无关：

1. **zustand persist 把全量数据池同步写 localStorage**——`uploadedFiles` 等大数组在 partialize 里，每次任意 `set()` 都在主线程同步 `JSON.stringify` MB 级数据（最大元凶，且会撞 5-10MB 配额）
2. 7 个模块常驻挂载（display:none 切换）+ **7 处整店订阅**（无 selector，任何 state 变化都重渲染）
3. **0 处 React.memo / 无虚拟滚动**，columns 每次 render 重建，每格 15-40 DOM 节点
4. VehicleListPanel memo 失效 + 每次勾选车型都重读磁盘资产库
5. 多处主线程 `XLSX.read`、`JSON.parse(JSON.stringify())` 深拷贝

本方案六阶段，Phase 1-4 修应用层，Phase 5 把重计算下沉 Rust（Windows 同样受益）。

## Phase 0：基线测量（手动，验证用）

用 `docs/test_data/` 真实数据（典型 30-50KB xlsx × 3 + 527KB 属性池），记录改造前后：

| 指标 | 测法 | 改造前 | 改造后 |
|---|---|---|---|
| 连续编辑 10 格耗时 | 智能填报结果表连续输入 | ___ | ___ |
| 勾选/取消车型耗时 | 数据池侧栏连续勾选 5 次 | ___ | ___ |
| 导入 527KB 属性池耗时 | 属性池导入（观察 loading） | ___ | ___ |
| 空闲内存 | 活动监视器，导入数据后静置 1min | ___ | ___ |
| 冷启动 | 退出后重新打开，秒表 | ___ | ___ |

## Phase 1：数据层 ✅ 已实施

- `vehicleStore.ts` partialize 移除 5 个大数组（uploadedFiles/selectedProductNames/confirmedProducts/excludedProducts/ignoredProductNames），新增 `hydrateSession` action
- 新建 `src/utils/sessionPersistence.ts`：订阅 store → debounce 1s 异步写 `appDataDir/session.json`（Tauri plugin-fs）；启动时 `hydrateSessionFromDisk()` 恢复；session.json 缺失时从旧 localStorage 一次性迁移；损坏降级空数据池；非 Tauri 环境全 no-op
- `main.tsx`：启动先 hydrate 再渲染（与旧版同步恢复体验一致），beforeunload 兜底落盘

**行为变化**：数据池不再持久化进 localStorage（配额问题根治），改存 appDataDir；首次启动自动从旧 localStorage 迁移，用户无感。

## Phase 2：订阅与 memo ✅ 已实施

- 7 处整店订阅改 `useShallow` 精确订阅：ExcelUploader、ConfigManagerView、AssetListDrawer、SaveAssetModal、DiffResultView、AnnouncementQuery、FileManager
- VehicleListPanel：`activeVehicles/inactiveVehicles` 补 useMemo（原先每次 render 生成新数组，下游 `activeVehicleDetails` 的 useMemo 全失效）；资产目录 useEffect 依赖 `selectedProductNames` → `assetVersion`（勾选不再触发磁盘重读）

## Phase 3：渲染层 ✅ 已实施

- `updateManualValue`（vehicleStore）改行级更新：indexOf + slice 替换命中项，不再全量 map 重建 matchResults
- MatchResultTable：`triggerRepair`/`toggleManualMode` useCallback 化；columns useMemo 化（依赖全部稳定）
- DataPurifyView：`handleUpdateParam`/`handleDeleteParam` useCallback 化；columns useMemo 化；深拷贝换 `structuredClone`
- ParametersTable：删除遗留 console.log
- **virtual 试点**：DataTable 封装新增可选 `virtual` 透传；MatchResultTable 开启（scrollX=970 数值总宽 + scrollY=600 + 列宽全数字）。⚠️ 未做视觉回归验证，若发现分页/修复值单元格异常，删除该表 `virtual scrollX` 两行即可回退

## Phase 4：Worker 收敛 ✅ 已实施

- `excelParser.worker.ts` 新增 `readWorkbook` 任务（仅 XLSX.read，返回可结构化克隆的 WorkBook）
- `excelParserAsync.ts` 新增 `readWorkbookFromBufferAsync` / `readWorkbookAsync`（File 便捷版），postTask 泛型化
- 7 处主线程解析全部切换：FileManager、AssetUpgradeModal（原 readFileAsWorkbook 主线程版）、EnumImportModal（同时消除了逐字节转 binary string 的慢路径）、AttributeDedup、MultiVehicleView、SmartFillView
- 后处理（sheet_to_json 等）仍在主线程——相比 XLSX.read 解析本身是轻量操作，可接受

## Phase 5：重计算下沉 Rust ✅ 已实施（v1.1）

- **Rust 侧**（新增 `src-tauri/src/excel.rs`，lib.rs 注册 invoke_handler）：
  - `read_workbook(path)`：calamine（0.30.1，受 rust-version 1.77 约束的最新版）解析 xlsx/xls/ods，输出 **SheetJS WorkBook 兼容结构**（SheetNames + A1 寻址单元格矩阵 + !ref），前端 excelParser 逻辑零改动消费；`spawn_blocking` 跑在线程池
  - `export_xlsx(path, sheet_name, rows, col_widths)`：rust_xlsxwriter 直接写盘（AOA + 列宽，单位近似 wch）
  - `scan_asset_library(path)`（新增 `src-tauri/src/assets.rs`）：资产库元信息扫描——旧实现在 JS 侧对全部资产 JSON 逐个 readTextFile + **主线程 JSON.parse**（用户实测资产库 262 文件/44MB），现改为 Rust 线程池内读+解析+统计，只回传元信息（~50KB），主线程零解析；`assetManager.getAssetFilesWithInfo` 已切换（非 Tauri 回退 JS）
- **前端接线**：
  - `excelParserAsync.readWorkbookFromPathAsync(path)`：路径 invoke 封装（仅 Tauri 环境可用）
  - EnumImportModal（属性池导入）：dialog 路径直传 Rust——**文件二进制不再过任何 IPC**（原来是 plugin-fs readFile 整文件二进制 + worker）
  - MatchResultTable 车上云模板导出：Tauri 下改为保存对话框 + `export_xlsx` 命令；非 Tauri 环境回退浏览器 XLSX.writeFile
- **保持不变**：拖拽上传（webview File 对象拿不到磁盘路径）仍走 Web Worker 路径；匹配引擎暂留 TS（Fuse WeakMap 缓存 + debounce 已够用）
- **验证**：`cargo check` 通过；lint/test/build 前端三件套与基线一致；测试基线 5 失败（含 2 个 worktree 副本）不变

## Phase 6：页面切换卡顿专项（v1.2，实测驱动）

**用户反馈**：切换顶部模块仍卡。经 Computer Use 实机测量 + React Profiler + 生产构建对照，完整结论：

| 场景 | dev 模式（tauri dev） | 生产构建（vite build，同 WebKit 引擎实测） |
|---|---|---|
| fill/pool 首次显示 | commit 2000-2900ms | **37ms / 22ms** |
| 二次切换 | ~40-70ms | 17-25ms |
| 纯布局（display 往返） | 838-865ms | 4-21ms |

1. **React 侧已无罪**：Profiler 实证二次切换渲染 1ms、生产首挂 37ms。此前实施的 memo/订阅修复全部生效
2. **dev 模式本身放大 ~100 倍**：vite 未打包 ESM + antd dev 构建 + HMR runtime。**日常使用请以打包版为准，dev 下的切换卡顿不代表真实性能**
3. 首挂优化的两项保险已顺带落地：App 的 `themeConfig` useMemo 化（避免 ConfigProvider context 每次切换变化绕过 memo）、四大顶层面板 memo 隔离（MemoWorkbench 用 workbenchTab 状态保持 props 稳定）
4. **结论：无需进一步优化。建议用户打包实测带真实数据的体验**

**期间顺带修复**（工作区并行编辑造成的损坏，与本方案无关但阻塞验证）：
- `src/utils/compareReport.ts`：`interface X {} & Record<...>` 非法语法 → 改为 `type` 别名（曾挂掉 CompareView 全部 5 个测试）
- `src/components/ParameterWorkbench/CompareView.tsx`：未用的 `Button` import 移除（tsc 报错）

## 验证

- 每阶段：`npm run lint && npm run test && npm run build`
- 测试失败集与基线对比：基线为 5 失败 / 296 通过（其中 2 个来自 `.claude/worktrees` 旧副本，3 个为 HEAD 存量失败），本次改造不允许新增失败
- Phase 0 表格复测，确认编辑/勾选卡顿消除
