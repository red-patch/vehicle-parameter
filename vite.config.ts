import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * `npm run dev:mock`（`vite --mode mock`）：在 <head> 最前注入 Tauri 模拟层，
 * 让没有 Tauri 运行时的浏览器也能打开完整界面（见 scripts/dev-mock/tauri-mock.js）。
 * 只作用于 dev server，且只在 mock 模式；`npm run dev` / `tauri dev` / 构建都不受影响。
 */
const tauriMock = (): Plugin => ({
  name: 'vpw-tauri-mock',
  apply: (_config, { command, mode }) => command === 'serve' && mode === 'mock',
  transformIndexHtml: () => [
    { tag: 'script', attrs: { src: '/scripts/dev-mock/tauri-mock.js' }, injectTo: 'head-prepend' },
  ],
})

export default defineConfig({
  plugins: [react(), tauriMock()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-antd': ['antd', '@ant-design/icons'],
          'vendor-xlsx': ['xlsx'],
        },
      },
    },
  },
})
