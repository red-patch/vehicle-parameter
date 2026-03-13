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

    expect(await screen.findAllByPlaceholderText('搜索字段并加入规则')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: '保存并应用' })).toBeInTheDocument()
  })
})
