import { describe, expect, it } from 'vitest'
import {
  buildFieldSearchResults,
  normalizeFieldName,
  parseFieldBatchInput,
} from '../coreFieldRules'

describe('parseFieldBatchInput', () => {
  // v4.5.10 起：换行/分号切分；逗号（含全角）不再切分——字段名常含逗号
  it('splits on newlines and semicolons and removes duplicates', () => {
    const result = parseFieldBatchInput('快充\n慢充；快充；电池包')
    expect(result).toEqual(['快充', '慢充', '电池包'])
  })

  it('keeps commas and semicolons inside parentheses intact', () => {
    const result = parseFieldBatchInput('直流充电时间（常温;SOC:20%-100%）（h）\n快充')
    expect(result).toEqual(['直流充电时间（常温;SOC:20%-100%）（h）', '快充'])
  })
})

describe('normalizeFieldName', () => {
  it('trims whitespace and keeps visible text stable', () => {
    expect(normalizeFieldName('  快充  ')).toBe('快充')
  })
})

describe('buildFieldSearchResults', () => {
  it('orders exact, prefix, and fuzzy matches', () => {
    const result = buildFieldSearchResults('快', ['快充', '慢充', '快充接口'], ['快充'])
    expect(result.map((item) => item.name)).toEqual(['快充', '快充接口'])
    expect(result[0].alreadySelected).toBe(true)
  })
})
