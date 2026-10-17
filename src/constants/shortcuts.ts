/**
 * 快捷键注册表 —— 全应用键盘快捷键的**单一事实源**（设计：docs/plans/2026-10-15-快捷键管理-design.md）。
 *
 * 为什么要有它：快捷键此前散落在 6 处 handler，每处各写各的 `if (mod && e.key === …)`；
 * 而面向用户的「速查列表」是第三处手写副本，已经漂移过（⌘S/⌘K 行曾与实际绑定不符）。
 * 本文件把**人类可读的真相**收敛到一处，设置面板与冲突检测都从这里读，不再手写第二份。
 *
 * 定位：**描述性**，不是执行性——它不拦截、不分发按键。6 处 handler 仍各自绑定
 * （各有作用域守卫，贸然接管 `preventDefault` 与 antd 弹层语义风险大）。代价是
 * 「注册表 vs 实现」两处真相，由后续的审计测试兜底（见设计 §6）。
 *
 * combo 语法：`mod`（macOS ⌘ / Windows Ctrl）、`shift`、`alt`；键名小写，
 * 特殊键用 `enter` / `space` / `escape` / `arrowup|down|left|right`；`,` `/` 等符号照写。
 * 一个 entry 可绑多个键（如方向键四向），`combo` 收数组。
 */

/** 快捷键的界面作用域。顺序即设置面板的分组顺序。 */
export type ShortcutScope = 'global' | 'assetPool' | 'vehicleDesigner' | 'system';

export interface ShortcutEntry {
    /** 稳定 id（冲突检测与测试的锚点；改文案不改它） */
    id: string;
    scope: ShortcutScope;
    combo: string | readonly string[];
    /** 中文说明（一句，面向用户） */
    description: string;
    /** 平台 / 实现差异的补充说明（可选，一句） */
    note?: string;
}

export const SHORTCUT_SCOPES: readonly { key: ShortcutScope; label: string }[] = [
    { key: 'global', label: '全局' },
    { key: 'assetPool', label: '车型资产池' },
    { key: 'vehicleDesigner', label: '整车设计' },
    { key: 'system', label: '系统菜单（macOS）' },
];

export const SHORTCUTS: readonly ShortcutEntry[] = [
    // ── 全局（MainLayout / useSettingsHotkey / useGlobalSearchHotkey，任何页面可用） ──
    { id: 'global.search', scope: 'global', combo: 'mod+f', description: '聚焦页面内的搜索框' },
    {
        id: 'global.save',
        scope: 'global',
        combo: 'mod+s',
        description: '点击当前页面的保存按钮',
        note: '只认当前可见页面（或最顶层弹窗）里的保存按钮；macOS 上 ⌘S 已让给系统菜单的「保存视图」',
    },
    {
        id: 'global.close-overlay',
        scope: 'global',
        combo: 'mod+w',
        description: '关闭最顶层的弹窗 / 抽屉',
        note: 'macOS 上 ⌘W 由系统菜单关闭窗口，此绑定不生效',
    },
    { id: 'global.escape', scope: 'global', combo: 'escape', description: '关闭最顶层的弹窗 / 抽屉' },
    { id: 'global.settings', scope: 'global', combo: 'mod+,', description: '打开设置面板' },
    { id: 'global.global-search', scope: 'global', combo: 'mod+k', description: '打开全局搜索面板' },

    // ── 车型资产池（useAssetPoolHotkeys，仅资产面板可见时生效） ──
    { id: 'pool.save-view', scope: 'assetPool', combo: 'mod+shift+s', description: '保存当前视图' },
    { id: 'pool.toggle-sidebar', scope: 'assetPool', combo: 'mod+b', description: '隐藏 / 显示左侧导航' },
    {
        id: 'pool.switch-view',
        scope: 'assetPool',
        combo: ['mod+1', 'mod+2', 'mod+3'],
        description: '切换到第 1 / 2 / 3 个视图',
    },
    { id: 'pool.batch', scope: 'assetPool', combo: 'mod+shift+a', description: '进入批量选择' },
    { id: 'pool.cart', scope: 'assetPool', combo: 'mod+shift+c', description: '已选工作集 开 / 关' },
    { id: 'pool.refresh', scope: 'assetPool', combo: 'mod+r', description: '刷新资产库' },
    { id: 'pool.cheatsheet', scope: 'assetPool', combo: 'mod+/', description: '快捷键速查' },
    { id: 'pool.compare', scope: 'assetPool', combo: 'mod+enter', description: '去对比' },
    {
        id: 'pool.move-focus',
        scope: 'assetPool',
        combo: ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'],
        description: '在卡片间移动焦点',
    },
    { id: 'pool.inspector', scope: 'assetPool', combo: 'enter', description: '打开资产检查器' },
    { id: 'pool.toggle-active', scope: 'assetPool', combo: 'space', description: '激活 / 移出工作集' },
    {
        id: 'pool.escape',
        scope: 'assetPool',
        combo: 'escape',
        description: '退出当前态（浮层 → 批量 → 焦点）',
    },

    // ── 整车设计（VehicleDesigner，仅设计器可见时生效） ──
    { id: 'designer.side', scope: 'vehicleDesigner', combo: '1', description: '切换到侧视图' },
    { id: 'designer.front', scope: 'vehicleDesigner', combo: '2', description: '切换到前视图' },
    { id: 'designer.3d', scope: 'vehicleDesigner', combo: '3', description: '切换到 3D 视图' },
    { id: 'designer.undo', scope: 'vehicleDesigner', combo: 'mod+z', description: '撤销' },
    { id: 'designer.redo', scope: 'vehicleDesigner', combo: 'mod+shift+z', description: '重做' },

    // ── 系统菜单（macOS 原生；Windows 无应用菜单，相关键由 JS 绑定兜底） ──
    {
        id: 'system.save-view',
        scope: 'system',
        combo: 'mod+s',
        description: '保存当前视图（原生菜单通道）',
        note: '占住系统保留键，避免 WKWebView 弹「保存页面」；转发给前端',
    },
];

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** 键名 → 显示（macOS 用符号，其他平台用词） */
function keyLabel(key: string, mac: boolean): string {
    switch (key) {
        case 'enter': return mac ? '↩' : 'Enter';
        case 'space': return 'Space';
        case 'escape': return 'Esc';
        case 'arrowup': return '↑';
        case 'arrowdown': return '↓';
        case 'arrowleft': return '←';
        case 'arrowright': return '→';
        default: return key.length === 1 ? key.toUpperCase() : key;
    }
}

/** 单个 combo → 显示串（macOS：`⌘⇧A`；其他：`Ctrl+Shift+A`） */
export function formatShortcut(combo: string, mac: boolean = MAC): string {
    const parts = combo.split('+');
    const mods: string[] = [];
    let key = '';
    for (const p of parts) {
        if (p === 'mod') mods.push(mac ? '⌘' : 'Ctrl');
        else if (p === 'shift') mods.push(mac ? '⇧' : 'Shift');
        else if (p === 'alt') mods.push(mac ? '⌥' : 'Alt');
        else key = p;
    }
    const sep = mac ? '' : '+';
    return [...mods, keyLabel(key, mac)].join(sep);
}

/** combo（可能是数组，如方向键四向）→ 显示串 */
export function formatCombos(combo: string | readonly string[], mac: boolean = MAC): string {
    const list = Array.isArray(combo) ? combo : [combo as string];
    return list.map(c => formatShortcut(c, mac)).join(' ');
}

/** entry.combo 归一为数组 */
export function combosOf(entry: ShortcutEntry): string[] {
    return Array.isArray(entry.combo) ? [...entry.combo] : [entry.combo as string];
}
