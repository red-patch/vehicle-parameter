export interface FieldSearchResult {
  name: string
  alreadySelected: boolean
  score: number
}

export const normalizeFieldName = (value: string): string => value.trim()

export const parseFieldBatchInput = (input: string): string[] => {
  const seen = new Set<string>()

  return input
    .split(/[\n,，；;]+/)
    .map(normalizeFieldName)
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
