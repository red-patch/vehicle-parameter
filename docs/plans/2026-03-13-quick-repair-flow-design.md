# Quick Repair Flow Design

**Date:** 2026-03-13

## Goal

Allow users to jump from analysis modules directly into the existing `数据体检与修复` workflow when they discover a bad data point, without duplicating editing logic across pages.

## Problem

Today users can discover problems in `版本对比`、`智能填报`、`多车型管理`, but the repair step lives separately in `数据体检与修复`. The gap forces context switching, manual re-selection of车型, and manual re-location of the broken field. This is slow and especially frustrating when the problem has already been precisely identified by the analysis module.

## Design Principles

1. Reuse the existing repair page instead of creating a second editor.
2. Only enable quick repair for assets that can be saved back safely.
3. Carry the minimum context needed to land the user on the right车型 and字段.
4. Keep the first version simple: single repair task, not a queue.

## Chosen Approach

Use a shared `repairContext` in store. Analysis modules write that context, switch to the `数据体检与修复` tab, and set the当前体检车型. The repair page reads the context, highlights the target field, shows a source banner, and offers save + return actions.

## Supported Entry Points

### Version Compare
- Show `快捷修复` for rows where the problem is tied to an asset-backed车型.
- Primary first-version focus: diff rows and obvious mismatches.

### Smart Fill
- Show `快捷修复` for enum mismatch rows and unmatched rows.
- Goal: let the user repair the source asset instead of repeatedly overriding output values.

### Multi Vehicle
- Show `快捷修复` for missing or suspicious per-vehicle values when the row maps to an asset-backed车型.

## Store Contract

Add a small repair context object to `vehicleStore`:

```ts
interface RepairContext {
  productName: string
  fieldName?: string
  sourceModule: 'compare' | 'smart_fill' | 'multi_vehicle'
  reason: 'diff' | 'unmatched' | 'enum_mismatch' | 'empty' | 'manual'
  sourceLabel: string
}
```

Supporting actions:
- `setRepairContext(context: RepairContext | null)`
- `clearRepairContext()`

## Navigation Flow

1. User clicks `快捷修复` in an analysis module.
2. App writes `repairContext`.
3. App switches to the `purify` tab.
4. App sets `currentPurifyProduct` to the target车型.
5. `数据体检与修复` reads the context and auto-focuses the field.
6. User repairs and saves.
7. User can either stay in repair mode or click `返回来源页面`.

## Repair Page Behavior

### Banner
Show a top banner in `数据体检与修复` with:
- 来源模块
- 车型名
- 字段名（if present）
- 问题类型

Example text:
- `来自版本对比 · 差异字段修复`
- `正在修复：大拿V1 / 快充 / 枚举异常`

### Field Focusing
- If `fieldName` exists, filter or scroll to the matching row.
- If multiple rows share the same field name, use the first match in v1.
- Keep a visible highlight state for the target row.

### Editing Rules
- Enum-backed fields continue using `Select`.
- Non-enum fields continue using `Input`.
- Non-standard field names continue using recommended replacement chips.

### Save Actions
- `保存并留在体检页`
- `保存后返回来源页面`
- `取消本次修复任务`

## Source Page Return

For v1, return behavior is lightweight:
- Store the source tab key in `repairContext.sourceModule`.
- Clicking `返回来源页面` switches tabs only.
- Do not attempt exact table scroll restoration in v1.

## Eligibility Rules

Only show `快捷修复` when the target车型 is asset-backed.

Reason:
- Asset-backed data can be safely written back.
- Pure workbook/import-only transient data should not suggest a durable repair path.

## Out of Scope

- Multi-field repair queues
- Exact row scroll restoration back into compare/fill/multi pages
- Inline repair dialogs inside analysis modules
- Rewriting the repair page into a new shared editor surface

## Risks

1. Same field name appearing multiple times may make focus ambiguous.
2. Some analysis rows may represent cross-product issues instead of a single asset problem.
3. Users may expect automatic recomputation after save; that should be triggered by normal store refresh, not custom repair logic.

## Implementation Notes

- Prefer reusing current store tab switching and current selected product state.
- Keep the quick repair CTA text identical across modules.
- Gate rendering carefully so non-asset entries do not show a broken repair action.
