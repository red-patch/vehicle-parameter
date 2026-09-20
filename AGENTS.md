# AGENTS.md — 车辆参数配置工具

> 本文件是所有 AI coding agent（Codex / Claude / Alma 等）的项目入口。改代码前必读。

## 项目简介

车辆整车参数配置与管理桌面工具：参数导入（Excel/CSV）、智能填报、属性去重、数据净化、版本对比、导出。
技术栈：**Tauri 2 + React 19 + TypeScript + Vite 7 + Tailwind 3**，后端逻辑在 Rust（src-tauri）。

## 验证命令（改完代码必须跑）

```bash
npm run lint    # ESLint
npm run test    # Vitest（jsdom + Testing Library）
npm run build   # tsc + vite build，类型错误在这里暴露
```

- 只改了 UI 文案/样式：至少跑 `npm run lint`
- 改了逻辑/解析/导出：三条全跑
- `npm run release` 走 `scripts/release.sh`，**不要在 agent 会话里执行发布**

## 目录地图

| 路径 | 说明 |
|---|---|
| `src/components/` | 功能模块（ParameterWorkbench / SmartFiller / DiffViewer / AttributeDedup / DataPurify / AssetLibrary / AnnouncementQuery / FileUpload） |
| `src/store/` | 全局状态 |
| `src/workers/` | Web Worker（解析等重计算） |
| `src/utils/` | 纯函数工具，优先把逻辑放这里方便测试 |
| `src-tauri/` | Rust 后端、Tauri 配置、capabilities 权限 |
| `scripts/` | 一次性脚本（debug_*/test_*/verify_* 多为临时验证用） |
| `docs/` | PRD.md、User_Manual.md、设计方案、测试数据 |

## 热点文件（大文件，改动需格外小心）

| 文件 | 行数 | 改动后必跑 |
|---|---|---|
| `src/components/SmartFiller/ConfigManagerView.tsx` | ~1260 | lint + test + build |
| `src/components/ParameterWorkbench/DataSourcePanel.tsx` | ~920 | lint + test + build |
| `src/components/DiffViewer/DiffResultView.tsx` | ~730 | lint + test |

原则：这些文件已经接近需要拆分的阈值，**新增逻辑优先写到独立文件/子组件，不要再往里面堆**。

## 边界与约定

- 真实车辆数据（docs/ 下的 .xlsx/.csv）只读，不要改原始数据文件
- `docs/PRD.md` 是需求基准，功能改动与 PRD 冲突时先确认再动手
- 不要提交 `settings.local.json`、`.env`、任何凭证文件
- `verify_export.csv` 一类根目录验证产物是临时的，可清理
- Excel 临时锁文件（`~$*.xlsx`）直接删除即可

## 已知坑

- README.md 还是 Vite 模板原文，不代表项目实际内容（以本文件和 docs/PRD.md 为准）
- `docs/交互优化设计方案.md` 里有 3 个 TODO，属于待定的设计方案，不是代码债
