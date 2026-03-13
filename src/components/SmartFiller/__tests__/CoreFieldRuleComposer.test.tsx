import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CoreFieldRuleComposer from '../CoreFieldRuleComposer'

afterEach(() => {
  cleanup()
})

describe('CoreFieldRuleComposer', () => {
  it('adds a suggested field into selected list', async () => {
    const onChange = vi.fn()

    render(
      <CoreFieldRuleComposer
        title="系统必填规则"
        description="desc"
        selectedFields={[]}
        candidateFields={['快充', '慢充']}
        recentFields={[]}
        onChange={onChange}
      />
    )

    await userEvent.type(screen.getByPlaceholderText('搜索字段并加入规则'), '快')
    await userEvent.click(screen.getByRole('button', { name: '加入 快充' }))

    expect(onChange).toHaveBeenCalledWith(['快充'])
  })

  it('imports fields from batch paste', async () => {
    const onChange = vi.fn()

    render(
      <CoreFieldRuleComposer
        title="质量验车规则"
        description="desc"
        selectedFields={['快充']}
        candidateFields={['快充', '慢充', '动力电池包厂商']}
        recentFields={[]}
        onChange={onChange}
      />
    )

    await userEvent.click(screen.getAllByRole('button', { name: '批量导入' })[0])
    await userEvent.type(screen.getByPlaceholderText('粘贴字段列表，支持换行、逗号、分号'), '慢充\n动力电池包厂商')
    await userEvent.click(screen.getByRole('button', { name: '导入并去重' }))

    expect(onChange).toHaveBeenCalledWith(['快充', '慢充', '动力电池包厂商'])
  })
})
