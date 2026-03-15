# Parameter Workbench Compact Layout Design

**Date:** 2026-03-15

## Goal

Reduce non-functional whitespace inside the parameter workbench so users can see more useful content per screen without changing the information architecture.

## Scope

This change applies only inside `参数工作台` and covers:

1. Workbench page header
2. Data pool page
3. Compare view
4. Smart fill view
5. Multi-vehicle view
6. Data purify view

## Chosen Approach

Keep the main Chinese workbench title, remove the decorative English subtitle block, and compress repeated top spacing across the workbench child views. Prioritize removing decorative whitespace and oversized empty states rather than deleting functional toolbars.

## Principles

1. Keep the core information hierarchy intact
2. Remove decorative header space first
3. Reduce empty-state height before touching functional controls
4. Keep all modules visually consistent

## Concrete Adjustments

1. Workbench shell
   - remove English subtitle
   - reduce top padding and header spacing
2. Shared view rhythm
   - reduce top gaps between sections
   - use smaller card bodies where appropriate
3. Data pool
   - tighten left/right panel padding
   - reduce oversized empty-state height
4. Compare / Smart Fill / Multi-Vehicle / Purify
   - tighten top spacing and card padding
   - reduce textarea height where it does not hurt usability
