# AGENTS.md — 车辆参数配置工具

> 本文件是所有 AI coding agent（Codex / Claude / Alma 等）的项目入口。改代码前必读。

## 项目简介

车辆整车参数配置与管理桌面工具：参数导入（Excel/CSV）、智能填报、属性去重、数据净化、版本对比、导出。
技术栈：**Tauri 2 + React 19 + TypeScript + Vite 7 + Tailwind 3**，后端逻辑在 Rust（src-tauri）。

## 验证命令（改完代码必须跑）

```bash
npm run lint       # ESLint
npm run typecheck  # tsc 类型检查（tsconfig.app.json）
npm run test       # Vitest（jsdom + Testing Library）
npm run build      # tsc -b + vite build
```

- 只改了 UI 文案/样式：至少跑 `npm run lint`
- 改了逻辑/解析/导出：四条全跑
- 裸跑 `tsc --noEmit` 检查零个文件（根 tsconfig 是 solution 文件），类型检查一律走 `npm run typecheck`
- `npm run release` 走 `scripts/release.sh`，**不要在 agent 会话里执行发布**

## 执行纪律

- 同一步骤失败两次：停下、记录卡点、重新计划，不要第三次硬试
- 修因不修表：禁止靠压制报错、放宽断言、跳过检查让问题消失
- 没跑的检查不算通过：报告里明说哪些跑了、哪些没跑
- **多个 AI 会话会并行改同一工作树**：动手前重读目标文件现状（不能凭本会话早前的读取）；验证失败先分诊是不是并行会话的在制品，再决定修不修
- 收尾报告 2-3 行：选了什么、放弃了什么、为什么；权衡时兼顾 UX（用户）、DX（后续开发者）、AX（下一个代理）

## 导航指针

- **领域术语**：[CONTEXT.md](CONTEXT.md) 是词汇表（资产/受控属性/身份键/公告记录…），读设计文档或写用户文案前先对齐；`_Avoid:_` 行是禁用叫法
- **架构决策**：`docs/adr/0001-0003`（受控属性分层、身份键与永不静默覆盖、主文件退役）
- **设计方案**：`docs/plans/YYYY-MM-DD-主题-design.md`，带「日期｜状态」头与前置文档链；新设计照此体例落盘，实施完把状态头改为「已实施」
- **资产管理页组件链**：`MainLayout('pool')` → `ParameterWorkbench` → `DataSourcePanel`；`src/components/AssetLibrary/` 只装筛选面板和弹窗抽屉，不是页面入口

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
| `src/components/ParameterWorkbench/DataSourcePanel.tsx` | ~1680 | lint + test + build |
| `src/components/DiffViewer/DiffResultView.tsx` | ~730 | lint + test |

原则：这些文件已经超过需要拆分的阈值，**新增逻辑优先写到独立文件/子组件，不要再往里面堆**。资产对象级动作（重命名/激活/删除/标签/公告关联）已抽到 `src/components/ParameterWorkbench/useAssetActions.tsx`，新动作加在那里，别堆回 DataSourcePanel。

## 边界与约定

- 面向用户的文案不解释内部实现（存储格式、文件机制、内部文件名）；提示仅在用户需要据此行动或了解后果时出现，且以一句为限
- 真实车辆数据（docs/ 下的 .xlsx/.csv）只读，不要改原始数据文件
- `docs/PRD.md` 是需求基准，功能改动与 PRD 冲突时先确认再动手
- 不要提交 `settings.local.json`、`.env`、任何凭证文件
- `verify_export.csv` 一类根目录验证产物是临时的，可清理
- Excel 临时锁文件（`~$*.xlsx`）直接删除即可

## 已知坑

- README.md 还是 Vite 模板原文，不代表项目实际内容（以本文件和 docs/PRD.md 为准）
- `docs/交互优化设计方案.md` 里有 3 个 TODO，属于待定的设计方案，不是代码债
- `tauri dev` 旧二进制：改图标/版本号后 tauri dev 仍跑旧 app，`touch src-tauri/tauri.conf.json` 强制重链
- dev 模式性能放大百倍：页面切换 dev 下 2-3s、生产构建仅 17-70ms；性能测量必须用生产构建（vite preview）
- 测试里的 mock 数组/对象不要在每次渲染时新建（会拖垮 jsdom 甚至 OOM），用共享可变状态
- AI 会话的 worktree（`.claude/worktrees/`）是陈旧代码快照，vitest 扫描已将其排除（vitest.config.ts）；在主仓库跑测试报的假失败先看是不是这个原因
