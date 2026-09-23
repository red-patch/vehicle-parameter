import { useRef, useCallback, useEffect } from 'react';

export interface UseLongPressOptions {
    /** 触发阈值（毫秒），默认 500 */
    delay?: number;
    /** 允许的位移半径（像素），超出视为拖动而非长按，默认 8 */
    moveTolerance?: number;
}

export interface UseLongPressResult {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
    /** 长按命中后吞掉紧随的 click，避免误触元素自身的点击行为；挂在目标元素的捕获阶段 */
    onClickCapture: (e: React.MouseEvent) => void;
}

/**
 * 长按 hook（仅主键）。
 *
 * 用法：
 * const longPress = useLongPress(() => enterBatchMode(fileName));
 * <div
 *   onPointerDown={longPress.onPointerDown}
 *   onPointerMove={longPress.onPointerMove}
 *   onPointerUp={longPress.onPointerUp}
 *   onPointerLeave={longPress.onPointerLeave}
 *   onPointerCancel={longPress.onPointerCancel}
 *   onClickCapture={longPress.onClickCapture}
 *   onClick={...原有点击行为...}
 * />
 *
 * 长按达到阈值后触发回调，并抑制松开时随之而来的 click；
 * 未达到阈值松开、或按住后拖动超出容差，则一切如常（正常 click 生效）。
 */
export function useLongPress(callback: () => void, options: UseLongPressOptions = {}): UseLongPressResult {
    const { delay = 500, moveTolerance = 8 } = options;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const triggeredRef = useRef(false);
    const startPosRef = useRef<{ x: number; y: number } | null>(null);
    const callbackRef = useRef(callback);
    // 渲染期不可写 ref；长按只会在事件回调里触发，effect 后写入不影响时效
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        startPosRef.current = null;
    }, []);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        // 仅主键长按；右键留给上下文菜单
        if (e.button !== 0) return;
        triggeredRef.current = false;
        clearTimer();
        startPosRef.current = { x: e.clientX, y: e.clientY };
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            startPosRef.current = null;
            triggeredRef.current = true;
            callbackRef.current();
        }, delay);
    }, [clearTimer, delay]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (timerRef.current === null || startPosRef.current === null) return;
        const dx = e.clientX - startPosRef.current.x;
        const dy = e.clientY - startPosRef.current.y;
        if (Math.hypot(dx, dy) > moveTolerance) {
            clearTimer();
        }
    }, [clearTimer, moveTolerance]);

    const onPointerUp = useCallback(() => {
        clearTimer();
    }, [clearTimer]);

    const onPointerLeave = useCallback(() => {
        clearTimer();
    }, [clearTimer]);

    const onPointerCancel = useCallback(() => {
        clearTimer();
    }, [clearTimer]);

    const onClickCapture = useCallback((e: React.MouseEvent) => {
        if (triggeredRef.current) {
            e.preventDefault();
            e.stopPropagation();
            triggeredRef.current = false;
        }
    }, []);

    return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onPointerCancel, onClickCapture };
}
