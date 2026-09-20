/**
 * 曜蓝 Obsidian Blue · v4.1 — Tailwind 色阶与字体扩展（含暗色阶）
 *
 * 用法（tailwind.config.js，项目为 ESM："type": "module"）：
 *   import tokens from './docs/design-v4-obsidian-blue/tailwind.tokens.js'
 *   export default {
 *     darkMode: 'class',                    // 暗色走 .dark 类，跟随 Tauri 主题
 *     theme: {
 *       extend: {
 *         colors: { ...tokens.colors, ...tokens.colorsDark },
 *         ...tokens.theme,
 *       }
 *     }
 *   }
 *
 * 与 tokens.css 的分工（重要，别搞反）：
 *   - CSS 变量语义类（surface-* / text-1~4 / bg-brand-weak …）= **会随明暗翻转**，
 *     一律优先用它。组件里 95% 的用色都应该走这条。
 *   - tailwind 静态色阶（brand-600、success-500 …）= **不翻转**，
 *     只用于：色卡展示、图表配置、SVG fill、打印/导出、以及明暗都不变的场景。
 *   - 暗色专用静态阶用 `dark-` 前缀 + `dark:` 变体，例如
 *     `dark:bg-dark-surface-2`、`dark:text-dark-text-3`，仅在无法用 CSS 变量时使用。
 *
 * v4.1 变更：
 *   1. 新增 colorsDark：暗色专用色阶（表面/文字/品牌/语义/业务），
 *      与 tokens.css 的 .dark 块一一对应，改色两边同步。
 *   2. 新增 chart：明/暗两套 6 色图表序列（ECharts 之类的 JS 配置读不到
 *      CSS 变量，必须给数组）。
 *   3. 新增 semantic 速查表：每个语义族的「文字/图形/背景」三件套，
 *      亮暗成对，避免再有人拿 500 阶当文字色用。
 */

/* ---------- 亮色 / 明暗通用静态阶 ---------- */
const colors = {
  // 主色 · 曜蓝（600 = 品牌主色，on #FFF 7.1:1 AAA）
  brand: {
    50:  '#EFF3FE', 100: '#E2E8FD', 200: '#C7D1FB', 300: '#A0AFF8',
    400: '#7386F1', 500: '#4D64E9', 600: '#2F44D8', 700: '#2738B4',
    800: '#23308F', 900: '#1F2A71', 950: '#131833',
  },
  // 中性 · 岩灰（去蓝紫味的 slate 改良）
  graphite: {
    50:  '#F7F8FA', 100: '#F1F3F6', 200: '#E4E7EC', 300: '#CCD1D9',
    400: '#9AA1AF', 500: '#6B7280', 600: '#4B5261', 700: '#3A4150',
    800: '#262B38', 900: '#1A1D26', 950: '#101218',
  },
  // 语义 · 松绿（文字用 600/700，图形用 500，背景用 50）
  success: { 50: '#E9F7F0', 500: '#0C9A68', 600: '#0A7A52', 700: '#086144' },
  // 语义 · 琥珀（文字必须 700；橙色系为警告专属，禁作装饰）
  warning: { 50: '#FEF4E2', 500: '#E8930C', 600: '#B96F07', 700: '#9A5806' },
  // 语义 · 茜红（文字 600，图形 500）
  danger:  { 50: '#FDECEC', 500: '#E5484D', 600: '#C92A2A', 700: '#A32222' },
  // 语义 · 青碧（信息 / 公告来源）
  info:    { 50: '#E4F4F7', 600: '#0E7C8C', 700: '#0B6370' },
  // 辅助 · 资产库来源标识（仅此一处用途）
  asset:   { 50: '#F0EBFB', 600: '#7048C8' },
};

/* ---------- 暗色专用静态阶（前缀 dark-） ----------
   取色规则：底不用纯黑；表面越上层越亮；品牌抬到 300-400 阶；
   语义降纯抬明；文字层落 L 75-85。
   每一档都标了对 surface-2 (#161B23) 的对比度，方便直接判断能不能当文字。 */
const colorsDark = {
  'dark-surface': {
    1: '#0E1116',   // layout
    2: '#161B23',   // container
    3: '#202734',   // inset / hover / elevated
    4: '#191F28',   // 斑马纹
    5: '#10151C',   // 代码块（比 layout 更沉）
  },
  'dark-text': {
    1: '#E6E9EF',   // 14.2:1
    2: '#AAB2C0',   //  8.1:1
    3: '#8A93A5',   //  5.6:1  ← 表头/辅助文字的底线
    4: '#5E6675',   //  3.0:1  禁用态
    disabled: '#4A5160', // 2.2:1 仅用于"明确不可用"的图标
  },
  'dark-border': {
    default: '#2C3442',  // 1.4:1 装饰性分隔
    strong:  '#3A4354',  // 1.7:1 装饰性强调
    control: '#5B6684',  // 3.0:1 控件描边（输入框/下拉/复选）
    popover: '#333C4D',
  },
  'dark-brand': {
    300: '#A0AFF8',      // 8.2:1 聚焦环
    400: '#8DA1F7',      // 7.1:1 文字/链接/描边 ← 暗色主色
    strong: '#A8B7F9',   // 8.9:1 按下/悬停文字
    fill: '#4D64E9',     // 实色填充（白字 4.9:1）
    fillHover: '#5569EB',// 白字 4.6:1
  },
  'dark-success': { 400: '#5BD0A2', 500: '#3DBD8A' },  // 文字 9.0:1 / 图形 7.3:1
  'dark-warning': { 400: '#F5BC66', 500: '#F0A83C' },  // 10.1:1 / 8.5:1
  'dark-danger':  { 400: '#F58A8D', 500: '#F06A6E' },  //  7.3:1 / 5.8:1
  'dark-info':    { 400: '#63BECB', 500: '#3FA8B8' },  //  8.0:1 / 6.3:1
  'dark-asset':   { 400: '#B79CED', 500: '#9678DC' },  //  7.4:1
  'dark-code': {
    bg: '#10151C', text: '#D6DBE5', comment: '#7C8698',
    keyword: '#8DA1F7', string: '#7FD8A4',
  },
};

/* ---------- 图表序列（JS 侧用；必须配 纹理/线型 双编码） ----------
   亮色：对 #FFFFFF 全部 ≥3.4:1（琥珀特例下沉到 600 阶 #C87A08）
   暗色：对 #161B23 全部 ≥5.8:1，且比底色亮 —— 暗色下"线是发光的" */
const chart = {
  seriesLight: ['#2F44D8', '#0C9A68', '#C87A08', '#E5484D', '#0E7C8C', '#7048C8'],
  seriesDark:  ['#8DA1F7', '#3DBD8A', '#F0A83C', '#F06A6E', '#63BECB', '#B79CED'],
  // 第七条（"其他"）一律用中性灰，不占语义色
  otherLight: '#9AA1AF',
  otherDark:  '#6B7280',
  // 线型 / 纹理：色盲安全兜底，与上面序列一一对应
  dashPatterns: ['solid', 'dashed', [6, 3, 2, 3], 'solid', 'dashed', [2, 3]],
  // 差异/状态图例：直接用业务 token，不新增色
  diffLight: { added: '#0C9A68', removed: '#E5484D', modified: '#E8930C', same: '#CCD1D9' },
  diffDark:  { added: '#3DBD8A', removed: '#F06A6E', modified: '#F0A83C', same: '#3A4354' },
};

/* ---------- 语义三件套速查（亮暗成对） ----------
   纪律：文字只用 text 档，图形（点/线/图标）用 graphic 档，
   大面积底色只在「差异列表」用 rowBg。暗色的 rowBg/chipBg 是 alpha 叠加，
   随所在层自动适配，所以下面写的是"合成后的参考值"。 */
const semantic = {
  light: {
    success: { text: '#0A7A52', graphic: '#0C9A68', bg: '#E9F7F0' },
    warning: { text: '#9A5806', graphic: '#E8930C', bg: '#FEF4E2' },
    danger:  { text: '#C92A2A', graphic: '#E5484D', bg: '#FDECEC' },
    info:    { text: '#0E7C8C', graphic: '#0E7C8C', bg: '#E4F4F7' },
    brand:   { text: '#2F44D8', graphic: '#4D64E9', bg: '#EFF3FE' },
  },
  dark: {
    success: { text: '#5BD0A2', graphic: '#3DBD8A', bg: 'rgba(61,189,138,.12)  /* ≈ #1B2E2F */' },
    warning: { text: '#F5BC66', graphic: '#F0A83C', bg: 'rgba(240,168,60,.12)  /* ≈ #302C26 */' },
    danger:  { text: '#F58A8D', graphic: '#F06A6E', bg: 'rgba(240,106,110,.12) /* ≈ #30242C */' },
    info:    { text: '#63BECB', graphic: '#3FA8B8', bg: 'rgba(63,168,184,.14)  /* ≈ #1C2F38 */' },
    brand:   { text: '#8DA1F7', graphic: '#8DA1F7', bg: 'rgba(141,161,247,.14)' },
  },
};

const theme = {
  // 字体族：系统栈零加载（Tauri 桌面端原生观感）；
  // mono 用于公告号 / VIN / 文件路径 / 版本号 / 导出文件名
  fontFamily: {
    sans: [
      '-apple-system', 'BlinkMacSystemFont', '"PingFang SC"',
      '"Hiragino Sans GB"', '"Microsoft YaHei"', '"Noto Sans CJK SC"',
      'sans-serif',
    ],
    mono: [
      '"SF Mono"', 'ui-monospace', 'Menlo', 'Consolas',
      '"Liberation Mono"', 'monospace',
    ],
  },
  // 字号阶梯：基准 13px，数据密度优先；组件禁止阶梯外字号（暗色不例外）
  fontSize: {
    caption: ['11px', { lineHeight: '1.5' }],
    aux:     ['12px', { lineHeight: '1.5' }],
    body:    ['13px', { lineHeight: '1.5' }],
    title:   ['14px', { lineHeight: '1.5',  fontWeight: '600' }],
    section: ['16px', { lineHeight: '1.25', fontWeight: '600' }],
    page:    ['20px', { lineHeight: '1.25', fontWeight: '700' }],
    stat:    ['26px', { lineHeight: '1.25', fontWeight: '700' }],
    hero:    ['32px', { lineHeight: '1.25', fontWeight: '700' }],
  },
  // 数据密度基调：数值等宽防抖动（配合 .tabular-nums 工具类）
  fontVariantNumeric: { tnum: 'tabular-nums' },
  // 暗色下禁用投影式抬升（深底上看不见），层级靠表面亮度 + 描边
  boxShadow: {
    popover:  '0 4px 16px rgba(16,18,24,.10), 0 1px 3px rgba(16,18,24,.06)',
    'popover-dark': '0 6px 20px rgba(0,0,0,.55)',
  },
};

export default { colors, colorsDark, chart, semantic, theme };
export { colors, colorsDark, chart, semantic, theme };
