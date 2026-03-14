# Asset Upgrade Import Design

**Date:** 2026-03-14

## Goal

Let users take an already-maintained asset, import a newer manufacturer file, compare the two, review upgrade recommendations, and then choose whether to overwrite or save as a new asset version.

## Problem

Today the system supports:
- saving cleaned data into assets
- loading assets for reuse
- importing new manufacturer Excel files

But it does not support the real-life workflow where:
1. an existing asset has already been repaired and enriched manually
2. the manufacturer provides a newer version later
3. the user wants to merge the new version carefully instead of blindly overwriting or redoing all maintenance manually

## Design Principles

1. Treat this as an upgrade workflow, not a normal import.
2. Protect manual maintenance work by default.
3. Automate only low-risk updates.
4. Force review for conflicting fields.
5. Keep v1 to a single-asset, single-import upgrade flow.

## Chosen Approach

Create a dedicated `资产升级导入` flow. Users select an existing asset, upload a new Excel file, and the system generates an upgrade draft with categorized field differences. The UI presents recommended actions for low-risk categories and requires explicit review for conflicts before save.

## Workflow

1. Choose an existing asset as baseline.
2. Import the new manufacturer Excel file.
3. Parse the new file into the standard `SheetData` format.
4. Generate an upgrade draft.
5. Review categorized differences.
6. Preview the final merged result.
7. Save either:
   - overwrite original asset
   - save as a new asset version

## Difference Categories

### same
- Old asset value equals new imported value.
- No action required.

### new_field
- New file has a field that the old asset does not contain.
- Default recommendation: use new value.

### fill_empty
- Old asset field exists but value is empty.
- New file provides a value.
- Default recommendation: use new value.

### conflict
- Both old asset and new file have non-empty values, but they differ.
- Default recommendation: pending manual review.

### old_only
- Old asset has a field missing from the new file.
- Default recommendation: keep old value.

## Data Model

```ts
type UpgradeDecision = 'keep_old' | 'use_new' | 'pending'

interface AssetUpgradeItem {
  key: string
  fieldName: string
  group: string
  oldValue: string
  newValue: string
  category: 'same' | 'new_field' | 'fill_empty' | 'conflict' | 'old_only'
  decision: UpgradeDecision
  required: boolean
}

interface AssetUpgradeDraft {
  assetFileName: string
  assetProductName: string
  importedFileName: string
  items: AssetUpgradeItem[]
  summary: {
    same: number
    newField: number
    fillEmpty: number
    conflict: number
    oldOnly: number
  }
}
```

## Comparison Rules for v1

Use simple, explicit comparison rules only:
- stringify both values
- trim whitespace
- compare exact string equality

Do not do unit normalization, fuzzy value matching, or semantic merging in v1.

## UI Structure

### Entry Point
Add a new action on each asset card in the asset library area:
- `升级导入`

### Upgrade Workspace
A dedicated modal or page with four sections:

1. Baseline asset summary
   - asset file name
   - product name
   - current tags
   - last updated time

2. New file import panel
   - upload manufacturer Excel file
   - show parsed product count / field count

3. Upgrade review panel
   - tabs or segmented filters for categories
   - sortable table of field differences
   - per-row decision controls for conflicts

4. Save panel
   - overwrite original asset
   - save as new version
   - final summary before apply

## Decision UX

### Low-risk categories
Auto-preselect decisions:
- `new_field` -> `use_new`
- `fill_empty` -> `use_new`
- `old_only` -> `keep_old`
- `same` -> hidden by default or read-only

### Conflict category
Show three actions:
- keep old
- use new
- pending

The save button is disabled while any conflict remains `pending`.

## Save Strategy

### Default
Recommend `save as new version` first.

### Overwrite
Allow overwrite only after a confirmation modal.

### Suggested default tags when saving
- `资产升级`
- `厂商更新`
- retain previous source tags

## Out of Scope for v1

- bulk upgrade of multiple assets
- auto-detecting the correct target asset from file content
- version graph or upgrade history replay
- rollback snapshots inside the app
- semantic or fuzzy conflict resolution

## Risks

1. Some imported files may contain multiple products while the asset is single-product.
2. Same field name may appear in multiple groups.
3. Product name mismatch between asset and import may confuse mapping.

## Mitigations

- v1 requires explicit baseline asset selection.
- v1 uses `group + fieldName` where available for row keys.
- v1 surfaces parse stats early before merge decisions begin.
