# Asset Upgrade Review Enhancements Design

**Date:** 2026-03-15

## Goal

Enhance the existing asset-upgrade flow with a save-before-preview experience and a PDF review export, so users can inspect the final merged outcome and retain an auditable review artifact before committing changes.

## Scope

This design extends the existing `资产升级导入` modal and does not introduce a second upgrade workflow.

Included:

1. Final merge preview summary
2. Expandable review detail list
3. PDF review export

Excluded:

1. Full dual-pane diff viewer
2. Excel export
3. Upgrade history persistence

## Design Principles

1. One draft, one truth: preview, export, and save must read the same upgrade draft.
2. Show summary first, details on demand.
3. Export is for review and audit, not for rebuilding the asset.
4. Do not create additional persisted state for preview/export.

## Chosen Approach

Extend the current upgrade draft pipeline with a pure preview builder. The modal consumes that preview for an on-screen summary and an expandable detail table. The PDF export uses the same preview result and generates a review document with summary, pending-risk warning, and change details.

## Preview Model

The preview is derived from `assetUpgradeDraft.items`.

It provides:

1. Summary counters:
   - total items
   - keep old
   - use new
   - pending
   - changed
   - new field
   - fill empty
   - conflict resolved
   - old only
2. Review items:
   - group
   - field name
   - old value
   - new value
   - category
   - decision
   - final value
   - changed

Rules:

1. `same` items are excluded from preview details.
2. `conflict` items remain visible even if the final decision keeps old value.
3. `pending` conflicts are treated as "keep old for safety" in preview final value, but remain marked as pending.

## UI Structure

Add a new block inside `AssetUpgradeModal` between the review table and the save panel:

1. `最终覆盖预览`
2. Summary cards visible by default
3. Expandable detail area for review items only

The save area adds one new action:

1. `导出升级审查 PDF`

## PDF Structure

The PDF is a review document with:

1. Title and export timestamp
2. Baseline asset info
3. Imported file info
4. Summary statistics
5. Pending conflict warning, if any
6. Review detail table

It does not include the full final asset parameter set.

## Error Handling

1. No draft: no preview, no export
2. Pending conflicts:
   - save stays disabled
   - export stays available
   - PDF shows warning
3. Export failure:
   - report error
   - keep current session untouched

## Testing Strategy

Focus automated tests on the pure preview builder:

1. summary counts reflect decisions
2. details exclude `same`
3. pending conflicts are surfaced correctly
4. final preview value matches merge semantics
