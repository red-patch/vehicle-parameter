import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ConfigManagerView from '../ConfigManagerView'

vi.mock('../../store/vehicleStore', () => ({
  useVehicleStore: () => ({ assetLibraryPath: '/tmp/assets' })
}))

afterEach(() => {
  cleanup()
})

describe('ConfigManagerView core fields tab', () => {
  it('renders the composer-driven core field layout', async () => {
    render(<ConfigManagerView />)

    const tab = await screen.findByRole('tab', { name: '核心字段配置' })
    await userEvent.click(tab)

    expect(screen.getByText('字段配置组')).toBeInTheDocument()
    expect(screen.getAllByText('系统必填字段').length).toBeGreaterThan(0)
    expect(screen.getAllByText('质量验车字段').length).toBeGreaterThan(0)
    expect(screen.getAllByPlaceholderText('搜索或输入字段名称').length).toBeGreaterThan(0)
    expect(screen.getByText('快充')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存并应用' })).toBeInTheDocument()
  }, 15000)
})
