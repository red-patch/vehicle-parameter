import { createContext, useContext } from 'react';

/**
 * 当前模块页是否可见（设计：docs/plans/2026-10-23-列表页表头固定-design.md §2.1）。
 *
 * App 里所有模块常驻挂载、用 `display:none` 切页（避免切换时重建整棵树）。代价是
 * **隐藏期间量不到任何布局**：`offsetParent` 为 null、`getBoundingClientRect()` 全 0。
 * 而切到该页时浏览器不会发 `resize`，`ResizeObserver` 在 `display:none → visible`
 * 上也未必补报（实测没报），于是「挂载时量高度」的页面一旦在后台挂载就再也量不出来。
 *
 * 这里把「可见性」做成显式信号，让按视口/容器取高度的 hook 在该页真正显示时重跑。
 * 默认 `true`：弹窗、抽屉、测试渲染没有这个 Provider 时按可见处理。
 */
export const ModuleActiveContext = createContext(true);

export const useModuleActive = (): boolean => useContext(ModuleActiveContext);

export default useModuleActive;
