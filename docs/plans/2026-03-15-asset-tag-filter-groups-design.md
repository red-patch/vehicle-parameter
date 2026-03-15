# Asset Tag Filter Groups Design

**Date:** 2026-03-15

## Goal

Redesign asset-library tag filtering so mutually exclusive tag groups are modeled explicitly in the UI, making filtering more understandable and efficient.

## Scope

This change affects only the asset-library filter UI and filtering logic in the data-pool page.

Included:

1. Source filter
2. Vehicle family filter group
3. Manufacturer filter group
4. Other tags multi-select group

Excluded:

1. Changing asset tag storage
2. Enforcing mutual exclusion during tag editing
3. Global tag taxonomy refactor

## Chosen Approach

Keep tags stored as free-form strings, but add frontend-only group rules for `车型族群` and `厂商`. The filter UI presents those groups separately as single-select chips, while all remaining tags stay in a multi-select intersection group.

## Filter Rules

1. Source: single-select
2. Vehicle family: single-select, mutually exclusive
3. Manufacturer: single-select, mutually exclusive
4. Other tags: multi-select, intersection
5. Search text remains an additional filter layer

## Terminology

Use `车型族群` instead of `车型级别`.

## Benefits

1. Users no longer need to guess which tags are mutually exclusive
2. Invalid compound selections like `大面 + 小卡` are prevented at the interaction level
3. Existing asset data remains untouched
