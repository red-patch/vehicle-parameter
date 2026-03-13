import { describe, expect, it } from 'vitest'
import {
  buildFieldSearchResults,
  normalizeFieldName,
  parseFieldBatchInput,
} from '../coreFieldRules'

describe('parseFieldBatchInput', () => {
  it('splits mixed separators and removes duplicates', () => {
    const result = parseFieldBatchInput('快充\n慢充, 快充，电池包')
    expect(result).toEqual(['快充', '慢充', '电池包'])
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
