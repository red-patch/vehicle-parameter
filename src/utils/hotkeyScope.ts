/**
 * 全局快捷键的「作用域定位」纯 DOM 工具（MainLayout 的 ⌘F / ⌘S / ⌘W / Esc 共用）。
 *
 * 为什么要有它：顶层 8 个模块全部常驻挂载、用 `display:none` 切换（见 App.tsx），
 * 而旧实现用 `document.querySelector` 取「DOM 里第一个」搜索框 / 主按钮 / 关闭钮——
 * 它会命中**看不见的模块**里的元素：
 * - ⌘F 在资产池无效（池内占位符是「搜名字…」不含「搜索」），在字段与词表聚焦到隐藏页的搜索框；
 * - ⌘S 在 Windows 上点「第一个主按钮」，可能是别的页面 / 非保存动作（如「新增业务字典」）；
 * - Esc 由 antd 弹层自己处理后，这里又点了 DOM 里第一个关闭钮——叠两层弹层时会一次关掉两层。
 *
 * 规则：**只认用户看得见的元素**，且有弹层时只在最顶层弹层内找。
 * 调用方可用 `data-hotkey="search" | "save"` 显式声明目标，比按文案猜更可靠。
 */

/** 弹层根：antd Modal 的 wrap 与 Drawer 根（Drawer 关闭后仍留在 DOM，靠可见性区分） */
const OVERLAY_SELECTOR = '.ant-modal-wrap, .ant-drawer';
const CLOSE_SELECTOR = '.ant-modal-close, .ant-drawer-close';

/**
 * 元素是否对用户可见：自身及祖先都没有 display:none / visibility:hidden / hidden 属性。
 * 不用 offsetParent / getClientRects —— jsdom 没有布局，测试里恒为空，会把一切判成不可见。
 */
export function isElementVisible(el: Element | null): boolean {
    if (!el || !el.isConnected) return false;
    const view = el.ownerDocument.defaultView;
    for (let node: Element | null = el; node; node = node.parentElement) {
        if (node.hasAttribute('hidden')) return false;
        const style = view?.getComputedStyle(node);
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    }
    return true;
}

/** 当前可见的最顶层弹层（portal 按打开顺序追加到 body，DOM 序最后者在最上） */
export function getTopmostOverlay(doc: Document = document): HTMLElement | null {
    const overlays = Array.from(doc.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)).filter(isElementVisible);
    return overlays.length > 0 ? overlays[overlays.length - 1] : null;
}

/** 快捷键的查找范围：有可见弹层 → 最顶层弹层；否则整个文档 */
export function getHotkeyScope(doc: Document = document): ParentNode {
    return getTopmostOverlay(doc) ?? doc;
}

/** 事件是否发生在某个弹层内部（此时 antd 自己会处理 Esc，外层不应再关一次） */
export function isInsideOverlay(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(OVERLAY_SELECTOR) !== null;
}

const firstVisible = <T extends Element>(scope: ParentNode, selector: string, accept: (el: T) => boolean = () => true): T | null =>
    Array.from(scope.querySelectorAll<T>(selector)).find(el => isElementVisible(el) && accept(el)) ?? null;

const isEnabled = (el: HTMLButtonElement | HTMLInputElement): boolean => !el.disabled;

/**
 * ⌘F 的目标：可见范围内第一个搜索框。
 * 优先显式声明的 `data-hotkey="search"`（SearchInput 自带），回退到占位符含「搜」的输入框。
 */
export function findSearchInput(doc: Document = document): HTMLInputElement | HTMLTextAreaElement | null {
    const scope = getHotkeyScope(doc);
    const declared = firstVisible<HTMLElement>(scope, '[data-hotkey="search"]');
    if (declared) {
        const field = declared.matches('input, textarea')
            ? declared
            : declared.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
        if (field && !(field as HTMLInputElement).disabled) return field as HTMLInputElement | HTMLTextAreaElement;
    }
    return firstVisible<HTMLInputElement>(
        scope,
        'input[placeholder*="搜"], input[placeholder*="Search"], textarea[placeholder*="搜"]',
        isEnabled,
    );
}

/**
 * ⌘S 的目标：可见范围内的「保存」按钮。
 * 优先 `data-hotkey="save"`；回退到文案含「保存」的主按钮——
 * 旧实现注释写着「含保存」却没过滤文案，会误点「新增业务字典」这类非保存主按钮。
 */
export function findSaveButton(doc: Document = document): HTMLButtonElement | null {
    const scope = getHotkeyScope(doc);
    return (
        firstVisible<HTMLButtonElement>(scope, 'button[data-hotkey="save"]', isEnabled) ??
        firstVisible<HTMLButtonElement>(
            scope,
            'button.ant-btn-primary:not(.ant-btn-background-ghost)',
            el => isEnabled(el) && (el.textContent ?? '').includes('保存'),
        )
    );
}

/** ⌘W / Esc 的目标：最顶层可见弹层的关闭钮（没有弹层则为 null） */
export function findTopmostCloseButton(doc: Document = document): HTMLButtonElement | null {
    const overlay = getTopmostOverlay(doc);
    if (!overlay) return null;
    return firstVisible<HTMLButtonElement>(overlay, CLOSE_SELECTOR);
}
