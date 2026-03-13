import React, { useMemo, useState } from 'react'
import { Button, Empty, Input, Tag, Typography } from 'antd'
import { DeleteOutlined, ImportOutlined, SearchOutlined } from '@ant-design/icons'
import { buildFieldSearchResults, parseFieldBatchInput } from './coreFieldRules'

const { Text } = Typography
const { TextArea } = Input

interface CoreFieldRuleComposerProps {
  title: string
  description: string
  selectedFields: string[]
  candidateFields: string[]
  recentFields: string[]
  onChange: (next: string[]) => void
}

const CoreFieldRuleComposer: React.FC<CoreFieldRuleComposerProps> = ({
  title,
  description,
  selectedFields,
  candidateFields,
  recentFields,
  onChange,
}) => {
  const [keyword, setKeyword] = useState('')
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchInput, setBatchInput] = useState('')
  const [batchSummary, setBatchSummary] = useState('')

  const searchResults = useMemo(
    () => buildFieldSearchResults(keyword, candidateFields, selectedFields),
    [keyword, candidateFields, selectedFields]
  )

  const visibleRecent = useMemo(
    () => recentFields.filter((field) => !selectedFields.includes(field)).slice(0, 8),
    [recentFields, selectedFields]
  )

  const addField = (field: string) => {
    if (selectedFields.includes(field)) return
    onChange([...selectedFields, field])
  }

  const removeField = (field: string) => {
    onChange(selectedFields.filter((item) => item !== field))
  }

  const sortFields = () => {
    onChange([...selectedFields].sort((left, right) => left.localeCompare(right, 'zh-CN')))
  }

  const dedupeFields = () => {
    onChange(Array.from(new Set(selectedFields)))
  }

  const clearFields = () => {
    onChange([])
  }

  const importBatch = () => {
    const parsed = parseFieldBatchInput(batchInput)
    const existing = new Set(selectedFields)
    const additions = parsed.filter((field) => !existing.has(field))
    const duplicateCount = parsed.length - additions.length
    onChange([...selectedFields, ...additions])
    setBatchSummary(`新增 ${additions.length} 项，重复 ${duplicateCount} 项`)
    setBatchInput('')
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-lg font-bold text-slate-900">{title}</div>
          <Text type="secondary">{description}</Text>
        </div>

        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索字段并加入规则"
          prefix={<SearchOutlined className="text-gray-400" />}
          allowClear
        />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 min-h-[220px]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-700">搜索与推荐</div>
              {keyword.trim() && <Tag className="m-0">{searchResults.length} 条命中</Tag>}
            </div>

            {keyword.trim() ? (
              searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((item) => (
                    <div key={item.name} className="flex items-center justify-between gap-3 rounded-lg border border-white bg-white px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{item.name}</div>
                        {item.alreadySelected && <div className="text-[11px] text-blue-500">已加入当前规则</div>}
                      </div>
                      <Button
                        size="small"
                        type={item.alreadySelected ? 'default' : 'primary'}
                        disabled={item.alreadySelected}
                        onClick={() => addField(item.name)}
                        aria-label={`加入 ${item.name}`}
                      >
                        {item.alreadySelected ? '已加入' : '加入'}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到结果" />
              )
            ) : visibleRecent.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {visibleRecent.map((field) => (
                  <Tag key={field} className="cursor-pointer m-0 px-3 py-1 text-xs" onClick={() => addField(field)}>
                    + {field}
                  </Tag>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="输入关键词开始查找字段" />
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="text-sm font-semibold text-slate-700">已选字段池</div>
              <Tag color="blue" className="m-0">已选字段数 {selectedFields.length}</Tag>
            </div>

            <div className="flex flex-wrap gap-2 min-h-[84px] max-h-[220px] overflow-y-auto pr-1">
              {selectedFields.length > 0 ? (
                selectedFields.map((field) => (
                  <Tag
                    key={field}
                    closable
                    onClose={(event) => {
                      event.preventDefault()
                      removeField(field)
                    }}
                    className="m-0 px-2 py-1 text-xs rounded-md"
                  >
                    {field}
                  </Tag>
                ))
              ) : (
                <Text type="secondary">暂未加入任何字段</Text>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="small" aria-label="去重" onClick={dedupeFields}>去重</Button>
              <Button size="small" aria-label="排序" onClick={sortFields}>排序</Button>
              <Button size="small" danger aria-label="清空" icon={<DeleteOutlined />} onClick={clearFields}>清空</Button>
              <Button size="small" aria-label="批量导入" icon={<ImportOutlined />} onClick={() => setBatchOpen((prev) => !prev)}>批量导入</Button>
            </div>

            {batchOpen && (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3">
                <TextArea
                  rows={4}
                  value={batchInput}
                  onChange={(event) => setBatchInput(event.target.value)}
                  placeholder="粘贴字段列表，支持换行、逗号、分号"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <Text type="secondary" className="text-xs">支持一次性批量录入后自动去重</Text>
                  <Button type="primary" size="small" aria-label="导入并去重" onClick={importBatch}>导入并去重</Button>
                </div>
                {batchSummary && <div className="mt-2 text-xs text-slate-500">{batchSummary}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CoreFieldRuleComposer
