import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { hydrateSessionFromDisk, initSessionPersistence } from './utils/sessionPersistence'

// 平台标记：macOS 启用毛玻璃透出 / 红绿灯避让等专属样式
if (/Mac/i.test(navigator.userAgent)) {
  document.documentElement.classList.add('is-macos')
}

// 生产环境禁用 WebView 默认右键菜单（输入框除外；应用自定义右键菜单不受影响）
if (import.meta.env.PROD) {
  window.addEventListener('contextmenu', (e) => {
    const t = e.target as HTMLElement | null
    if (t?.closest('input, textarea, [contenteditable="true"]')) return
    e.preventDefault()
  })
}

// 先恢复数据池会话再渲染，保持与旧版 localStorage 同步恢复一致的体验；
// 非 Tauri 环境下 hydrate 为 no-op，不会阻塞
void hydrateSessionFromDisk().finally(() => {
  initSessionPersistence()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
