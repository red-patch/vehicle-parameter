import { afterEach, describe, expect, it } from 'vitest';
import {
    findSaveButton,
    findSearchInput,
    findTopmostCloseButton,
    getTopmostOverlay,
    isElementVisible,
    isInsideOverlay,
} from '../hotkeyScope';

const mount = (html: string) => {
    document.body.innerHTML = html;
};

afterEach(() => {
    document.body.innerHTML = '';
});

describe('hotkeyScope：只认用户看得见的元素', () => {
    it('祖先 display:none / hidden 属性都算不可见（常驻挂载的隐藏模块）', () => {
        mount(`
            <div style="display:none"><input id="a" /></div>
            <div hidden><input id="b" /></div>
            <div><input id="c" /></div>
        `);
        expect(isElementVisible(document.getElementById('a'))).toBe(false);
        expect(isElementVisible(document.getElementById('b'))).toBe(false);
        expect(isElementVisible(document.getElementById('c'))).toBe(true);
        expect(isElementVisible(null)).toBe(false);
    });

    it('⌘F：跳过隐藏模块的搜索框，命中当前页声明了 data-hotkey 的搜索框', () => {
        mount(`
            <div style="display:none"><input id="hidden" placeholder="搜索字段" /></div>
            <div><input id="pool" data-hotkey="search" placeholder="搜名字、公告号、标签" /></div>
        `);
        expect(findSearchInput()?.id).toBe('pool');
    });

    it('⌘F：未声明时回退到占位符含「搜」的可见输入框（不再要求必须含「搜索」）', () => {
        mount(`<div><input id="other" placeholder="名称" /><input id="kw" placeholder="搜名字…" /></div>`);
        expect(findSearchInput()?.id).toBe('kw');
    });

    it('⌘F：有弹层时只在最顶层弹层内找', () => {
        mount(`
            <div><input id="page" data-hotkey="search" placeholder="搜索" /></div>
            <div class="ant-modal-wrap"><input id="modal" data-hotkey="search" placeholder="搜索" /></div>
        `);
        expect(findSearchInput()?.id).toBe('modal');
    });

    it('⌘S：不点隐藏页的主按钮，也不点文案不含「保存」的主按钮', () => {
        mount(`
            <div style="display:none"><button id="hiddenSave" class="ant-btn-primary">保存</button></div>
            <div>
                <button id="add" class="ant-btn-primary">新增业务字典</button>
                <button id="save" class="ant-btn-primary">保存配置</button>
            </div>
        `);
        expect(findSaveButton()?.id).toBe('save');
    });

    it('⌘S：data-hotkey="save" 优先于文案匹配；禁用的按钮不点', () => {
        mount(`
            <div>
                <button id="text" class="ant-btn-primary">保存</button>
                <button id="declaredDisabled" data-hotkey="save" disabled>覆盖原资产</button>
                <button id="declared" data-hotkey="save">覆盖原资产</button>
            </div>
        `);
        expect(findSaveButton()?.id).toBe('declared');
    });

    it('⌘S：页面没有保存按钮时返回 null（不乱点别的主按钮）', () => {
        mount(`<div><button class="ant-btn-primary">导出 CSV</button></div>`);
        expect(findSaveButton()).toBeNull();
    });

    it('Esc / ⌘W：叠两层弹层时只取最顶层的关闭钮；已关闭（隐藏）的抽屉不算', () => {
        mount(`
            <div class="ant-modal-wrap"><button id="bottom" class="ant-modal-close"></button></div>
            <div class="ant-modal-wrap"><button id="top" class="ant-modal-close"></button></div>
            <div class="ant-drawer" style="display:none"><button id="closedDrawer" class="ant-drawer-close"></button></div>
        `);
        expect(getTopmostOverlay()?.querySelector('button')?.id).toBe('top');
        expect(findTopmostCloseButton()?.id).toBe('top');
    });

    it('没有弹层时关闭钮为 null；isInsideOverlay 识别弹层内的事件目标', () => {
        mount(`<div><input id="page" /></div><div class="ant-drawer"><input id="inDrawer" /></div>`);
        expect(isInsideOverlay(document.getElementById('inDrawer'))).toBe(true);
        expect(isInsideOverlay(document.getElementById('page'))).toBe(false);
        document.querySelector('.ant-drawer')!.remove();
        expect(findTopmostCloseButton()).toBeNull();
    });
});
