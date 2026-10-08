# 动效打磨计划索引

来源：2026-09-30 improve-animations 动画审计（Emil Kowalski 动效规范）。

| 计划 | 状态 | 内容 |
| --- | --- | --- |
| [001-overlay-motion-tuning](001-overlay-motion-tuning.md) | DONE | 弹层动效调教：antd Modal 缩放起点 0.2→0.96、右键菜单 token 化+入场、抽屉空壳、reduced-motion 保留反馈 |
| [002-hover-and-reveals](002-hover-and-reveals.md) | DONE | 高频 hover 手感（行按钮占位渐显/行 hover 去渐变/拖拽区 150ms/按压 0.98）、瞬跳补动效（模块/Tab fade、分组 reveal、批量工具栏落位、治理采纳折叠）、死动效代码清理 |

审计中记录但刻意不做的：themeConfig motionDuration*/motionEase* token 双接线（antd 默认值已核实全部在预算内）；DataSourcePanel 批量模式行缩进过渡（多行 padding 布局动画，放弃）；Tooltip `zoom-big-fast` 起点 0.8（0.1s fast 下感知轻微）。
