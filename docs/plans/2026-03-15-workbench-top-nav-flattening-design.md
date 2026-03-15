# Workbench Top Nav Flattening Design

**Date:** 2026-03-15

## Goal

Reduce navigation friction by removing the extra `参数工作台`一级入口 and promoting its five core modules directly into the main navigation bar.

## Scope

Included:

1. Promote `数据池 / 版本对比 / 智能填报 / 多车型管理 / 数据体检与修复` to top-level navigation
2. Remove `参数工作台` as a separate main-nav shell
3. Remove `属性去重` from main navigation
4. Preserve shared workbench state and cross-module quick-repair jumps

Excluded:

1. Deleting attribute-dedup implementation
2. Refactoring shared Zustand workbench state
3. Route-system overhaul

## Chosen Approach

Keep a shared workbench shell/context, but let the top-level app navigation switch directly between the five workbench modules. This preserves data-pool sharing, repair jumps, and focused state while removing one layer of tabs.

## Principles

1. Flatten navigation, not state
2. Keep repair jump behavior intact
3. Preserve data-pool-first workflow
4. Avoid redundant entry points
