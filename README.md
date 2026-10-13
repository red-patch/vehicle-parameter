# 整车产品工作台 VPW

> 面向整车产品工作的桌面工具 —— 车型资产治理、公告记录归档与比对、法规标准库、参数导入与智能填报，一体化的本地工作台。

VPW 是一款基于 **Tauri 2 + React 19** 的桌面应用，把车辆工程与投标场景中反复出现的 Excel 参数表处理流程（版本比对、参数填报、去重体检、公告归档）收敛到一处，数据落在本机，不依赖云端。

## 功能特性

| 模块 | 说明 |
|---|---|
| **资产管理（ParameterWorkbench）** | 车型资产库的筛选、分组、标签与生命周期治理；受控属性分层，身份键唯一，更新永不静默覆盖 |
| **版本对比（DiffViewer）** | 秒级识别两个 Excel 版本间的参数新增 / 移除 / 变更 |
| **智能填报（SmartFiller）** | 招标参数表与本地参数库模糊匹配，自动完成填报 |
| **公告记录（AnnouncementQuery）** | 整车公告记录归档、按车型/公告号分组比对 |
| **法规标准库（RegulationLibrary）** | 法规标准条目的收录与检索 |
| **属性去重（AttributeDedup）** | 属性名归一化与重复项合并 |
| **数据体检（DataPurify）** | 参数数据一致性检查与修复 |
| **整车设计器（VehicleDesigner）** | 参数化设计视图，支持 2D/3D 可视化 |
| **参数导入（FileUpload）** | Excel / CSV 导入，Web Worker 异步解析 |
| **手机查看（只读）** | 本机只读 HTTP 服务，经隧道在手机浏览器查看资产 |

## 技术栈

- **界面**：React 19 · TypeScript 5.9 · Ant Design v6 · Tailwind CSS 3
- **3D / 可视化**：Three.js · @react-three/fiber · @react-three/drei
- **状态管理**：Zustand
- **构建**：Vite 7
- **桌面外壳**：Tauri 2（Rust 后端）
- **表格解析**：SheetJS (xlsx)
- **测试**：Vitest + Testing Library (jsdom)

## 快速开始

环境要求：**Node.js 20+**、**Rust 工具链**（桌面端构建）、macOS / Windows。

```bash
# 安装依赖
npm install

# 启动浏览器开发模式（Vite）
npm run dev

# 启动桌面应用（Tauri）
npm run tauri dev

# 生产构建
npm run build
```

## 开发命令

```bash
npm run lint       # ESLint
npm run typecheck  # TypeScript 类型检查
npm run test       # Vitest 单元测试
npm run build      # tsc -b + vite build
```

> 提示：dev 模式下页面切换会因 Vite 未优化而明显偏慢，性能测量请使用生产构建（`npm run preview`）。

## 目录结构

```
src/
├─ components/   功能模块（ParameterWorkbench / SmartFiller / DiffViewer / ...）
├─ store/        全局状态（Zustand）
├─ workers/      Web Worker（Excel 解析等重计算）
├─ utils/        纯函数工具（优先把逻辑放这里，便于测试）
└─ assets/       打包进应用的默认资源
src-tauri/       Rust 后端、Tauri 配置与权限
docs/            PRD、用户手册、架构决策（ADR）与设计方案
scripts/         开发与验证脚本
```

## 文档

- [CONTEXT.md](CONTEXT.md) —— 领域术语词汇表（资产 / 受控属性 / 身份键 / 公告记录 …）
- [docs/PRD.md](docs/PRD.md) —— 产品需求文档
- [docs/User_Manual.md](docs/User_Manual.md) —— 用户手册
- [docs/adr/](docs/adr/) —— 架构决策记录（ADR）
- [docs/plans/](docs/plans/) —— 设计方案与实施记录
- [AGENTS.md](AGENTS.md) —— 面向 AI coding agent 的项目入口与约定

## 说明

仓库内的示例数据均为脱敏演示数据，不含任何真实客户或企业信息。

## 许可

本项目尚未声明开源许可证（UNLICENSED）。如需在许可条款下使用，请联系仓库作者。
