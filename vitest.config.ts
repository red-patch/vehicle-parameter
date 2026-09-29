import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // AI 会话的 worktree 是陈旧代码快照，混进扫描会大幅拖慢测试并报假失败
    exclude: [...configDefaults.exclude, '.claude/worktrees/**'],
  },
})
