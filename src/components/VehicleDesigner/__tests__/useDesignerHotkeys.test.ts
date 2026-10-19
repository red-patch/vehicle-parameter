import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDesignerHotkeys } from '../useDesignerHotkeys';

const setup = (enabled: boolean) => {
    const handlers = { onSelectView: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn() };
    const hook = renderHook(props => useDesignerHotkeys(props), { initialProps: { enabled, ...handlers } });
    return { ...handlers, hook };
};

const press = (init: KeyboardEventInit, target: EventTarget = document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

afterEach(() => {
    document.body.innerHTML = '';
});

describe('useDesignerHotkeys：整车设计快捷键只在本页可见时生效', () => {
    it('页面不可见（enabled=false）时 ⌘Z / 1 都不响应——别的页面按 ⌘Z 不得悄悄撤销设计参数', () => {
        const { onUndo, onSelectView } = setup(false);
        press({ key: 'z', metaKey: true });
        press({ key: '1' });
        expect(onUndo).not.toHaveBeenCalled();
        expect(onSelectView).not.toHaveBeenCalled();
    });

    it('可见时：裸键 1/2/3 切视图，⌘Z 撤销，⌘⇧Z 重做', () => {
        const { onUndo, onRedo, onSelectView } = setup(true);
        press({ key: '1' });
        press({ key: '2' });
        press({ key: '3' });
        expect(onSelectView.mock.calls.map(c => c[0])).toEqual(['side', 'front', '3d']);
        press({ key: 'z', ctrlKey: true });
        press({ key: 'Z', metaKey: true, shiftKey: true });
        expect(onUndo).toHaveBeenCalledTimes(1);
        expect(onRedo).toHaveBeenCalledTimes(1);
    });

    it('带修饰键的 ⌘1/Ctrl+2 不是本页的键（资产池的 ⌘1 等组合不得串到设计器）', () => {
        const { onSelectView } = setup(true);
        press({ key: '1', metaKey: true });
        press({ key: '2', ctrlKey: true });
        press({ key: '3', altKey: true });
        expect(onSelectView).not.toHaveBeenCalled();
    });

    it('输入框内输入数字、或有弹层打开时不拦截', () => {
        const { onSelectView, onUndo } = setup(true);
        const input = document.createElement('input');
        document.body.appendChild(input);
        press({ key: '1' }, input);
        press({ key: 'z', metaKey: true }, input);
        const modal = document.createElement('div');
        modal.className = 'ant-modal-wrap';
        document.body.appendChild(modal);
        press({ key: '2' });
        expect(onSelectView).not.toHaveBeenCalled();
        expect(onUndo).not.toHaveBeenCalled();
    });

    it('enabled 由 true 切到 false 后解绑监听', () => {
        const { onUndo, hook } = setup(true);
        hook.rerender({ enabled: false, onSelectView: vi.fn(), onUndo, onRedo: vi.fn() });
        press({ key: 'z', metaKey: true });
        expect(onUndo).not.toHaveBeenCalled();
    });
});
