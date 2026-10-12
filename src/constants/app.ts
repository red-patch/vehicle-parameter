/**
 * 应用层常量。
 *
 * APP_NAME 是产品名的单一来源——界面标题、导出报告、页面 <title> 均引用它。
 *
 * 名字尾部刻意保留拉丁后缀「VPW」：macOS Spotlight 按整词注音索引，纯中文名
 * 只能被中文或全拼（zhengche）搜到，拼音首字母（zc / gzt）搜不到；带上字面
 * 拉丁字符后，中文、拉丁、全拼三条检索通道才能全通（实测结论）。
 *
 * 注意：Rust 侧（`src-tauri/src/lib.rs` 的 macOS 菜单）与构建配置
 * （`src-tauri/tauri.conf.json` 的 productName / 窗口 title）无法共享本常量，
 * 改名时须一并更新。完整落点清单见 AGENTS.md「产品名落点」。
 */
export const APP_NAME = '整车产品工作台 VPW';
