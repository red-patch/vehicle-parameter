# Asset Card Unified Identity Design

**Date:** 2026-03-15

## Goal

Simplify asset cards by unifying asset file name and product name into one user-facing identity, removing redundant rename actions and reducing card height.

## Scope

This change applies to asset cards in the data-pool asset library.

Included:

1. Single rename action for file and product name
2. Hide `.json` suffix from card title
3. Remove separate product-name row
4. Flatter card layout

Excluded:

1. Global asset schema changes
2. Batch renaming
3. Changes to save modal semantics

## Chosen Approach

Treat the editable asset identity as a single base name. When renamed, the system writes `baseName.json` as the file name and `baseName` as the product name. Cards show only the unified display name, without the `.json` suffix.

## UI Rules

1. One primary asset name on the card
2. No separate `车型名:` line
3. One rename button only
4. Core tags and timestamp stay visible, but in a flatter row

## Compatibility

Existing assets may still have mismatched file and product names. Cards should show the most human-meaningful display name, while new rename operations will bring them back into a unified state.
