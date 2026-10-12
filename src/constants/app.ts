/**
 * 应用层常量。
 *
 * APP_NAME 是产品名的单一来源——界面标题、导出报告、页面 <title> 均引用它。
 * 注意：Rust 侧（`src-tauri/src/lib.rs` 的 macOS 菜单）与构建配置
 * （`src-tauri/tauri.conf.json` 的 productName / 窗口 title）无法共享本常量，
 * 改名时须一并更新。完整落点清单见 AGENTS.md「产品名落点」。
 */
export const APP_NAME = '整车产品工作台';
