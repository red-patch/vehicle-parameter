/**
 * 曜蓝 Obsidian Blue · 色阶接入
 * 色板源：docs/design-v4-obsidian-blue/tailwind.tokens.js（专家提案，勿在本文件改色值）
 * 语义族保留 DEFAULT = CSS 变量（随明暗翻转），色阶用于不随主题翻转的静态场景，
 * 两套并存、各司其职——见 tokens 文件头注释。
 */
import obsidianBlue from './docs/design-v4-obsidian-blue/tailwind.tokens.js';
import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 语义族：DEFAULT 挂 CSS 变量（现有 text-brand / bg-success 等类不受影响）
        brand: { DEFAULT: 'var(--brand)', ...obsidianBlue.colors.brand },
        success: { DEFAULT: 'var(--success)', ...obsidianBlue.colors.success },
        warning: { DEFAULT: 'var(--warning)', ...obsidianBlue.colors.warning },
        danger: { DEFAULT: 'var(--danger)', ...obsidianBlue.colors.danger },
        info: { DEFAULT: 'var(--info)', ...obsidianBlue.colors.info },
        asset: obsidianBlue.colors.asset,
        graphite: obsidianBlue.colors.graphite,
        primary: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        surface: {
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        // 边框语义色（tailwind 键形式，支持 hover: 等变体；
        // 非 variant 场景用 index.css 的 .border-default/.border-strong）
        line: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
      },
      // 字体族 / 字号阶梯 / tabular-nums：全部来自专家 tokens（v4.1 字体方案），
      // 含 text-caption…text-hero 命名字号类（自带行高与字重）
      ...obsidianBlue.theme,
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      },
      // 动效：统一走 src/index.css 的 vp-* 动画与 --ease-ui 曲线（此处不再另立 token）
    },
  },
  // 该包导出的是 { handler, config } 插件对象，直接传数组（不要调用）
  plugins: [containerQueries],
}
