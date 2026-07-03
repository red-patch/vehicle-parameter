export interface FieldSearchResult {
  name: string
  alreadySelected: boolean
  score: number
}

export const normalizeFieldName = (value: string): string => value.trim()

export const parseFieldBatchInput = (input: string): string[] => {
  const seen = new Set<string>()

  // 按指定分隔符切分，但跳过括号内的分隔符
  // 例如 "直流充电时间（常温,SOC:20%-100%）（h）" 不应被逗号拆开
  const fields: string[] = []
  let current = ''
  let openParens = 0 // 括号栈：中文（英文(都+1，中文）英文)都-1

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '（' || ch === '(') {
      openParens++
      current += ch
    } else if (ch === '）' || ch === ')') {
      if (openParens > 0) openParens--
      current += ch
    } else if (openParens === 0 && (ch === '\n' || ch === '；' || ch === ';')) {
      // 在括号外遇到分隔符 → 切分（中文逗号「，」不作为分隔符，字段名常包含它）
      fields.push(normalizeFieldName(current))
      current = ''
    } else {
      current += ch
    }
  }
  if (current) fields.push(normalizeFieldName(current))

  return fields
    .filter(Boolean)
    .filter((name) => {
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
}

export const buildFieldSearchResults = (
  keyword: string,
  candidates: string[],
  selected: string[]
): FieldSearchResult[] => {
  const normalizedKeyword = normalizeFieldName(keyword)
  const lowerKeyword = normalizedKeyword.toLowerCase()

  if (!lowerKeyword) return []

  return candidates
    .filter((name) => name.toLowerCase().includes(lowerKeyword))
    .map((name) => ({
      name,
      alreadySelected: selected.includes(name),
      score: name === normalizedKeyword ? 0 : name.startsWith(normalizedKeyword) ? 1 : 2,
    }))
    .sort((left, right) => left.score - right.score || left.name.localeCompare(right.name, 'zh-CN'))
}
