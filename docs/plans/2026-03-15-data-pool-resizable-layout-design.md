# Data Pool Resizable Layout Design

**Date:** 2026-03-15

## Goal

Improve readability of the data-pool page by making the left asset column wider by default, increasing asset-library typography, and allowing users to manually resize both the main split and the left-column internal split with persisted preferences.

## Scope

This design applies only to `参数工作台 > 数据池`.

Included:

1. Main left-right resizable split
2. Left-column top-bottom resizable split
3. Persisted layout preferences
4. Reset-to-default action
5. Asset-library typography and spacing refresh

Excluded:

1. Global split system for the whole app
2. Resizable layouts in compare/fill/multi/purify tabs
3. Third-party split-pane dependency

## Chosen Approach

Implement the layout directly in the existing data-pool components using pixel-based sizes plus clamp helpers. Persist only the two data-pool layout values in Zustand. Keep the implementation local and explicit rather than abstracting into a global layout engine.

## Layout Model

Two persisted values:

1. `poolSidebarWidth`
2. `poolWorkspaceHeight`

Both are stored in pixels.

Runtime behavior:

1. Clamp values against container and safety min/max constraints
2. Persist only after drag updates
3. Provide reset to defaults

## Default Values

1. Left sidebar default width should be wider than the current hard-coded layout
2. Left top workspace default height should be slightly smaller than current so asset library gets more vertical room
3. Asset cards should use slightly larger type and more breathing room

## Component Ownership

1. `ParameterWorkbench`
   - main left-right split
   - sidebar width drag handle
2. `DataSourcePanel`
   - top-bottom split inside left column
   - workspace height drag handle
   - reset-layout entry
   - asset-library typography refresh

## Risk Controls

1. Use pixels rather than percentages for persistence
2. Clamp on render so old saved values cannot break layout after window resizing
3. Keep drag handlers local, no global layout refactor
