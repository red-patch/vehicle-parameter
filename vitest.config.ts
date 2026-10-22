import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // AI 会话的 worktree 是陈旧代码快照，混进扫描会大幅拖慢测试并报假失败
    exclude: [...configDefaults.exclude, '.claude/worktrees/**'],
    // 默认 5s 在并行负载下会误杀：同一条用例单独跑 ~1.5s，全量并发时超 5s。
    // 这是机器负载波动，不是用例慢——放宽到 15s，真卡死的用例仍会失败。
    testTimeout: 15000,
  },
})
