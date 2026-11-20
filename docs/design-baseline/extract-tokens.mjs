#!/usr/bin/env node
/**
 * 视觉基线 token 提取器
 *
 * 只读源码、不猜值：所有颜色 / 字号 / 间距 / 圆角 / 阴影都从
 *   - src/index.css        （CSS 自定义属性，明暗两套）
 *   - src/theme/themeConfig.ts（antd token 与组件级覆盖）
 *   - tailwind.config.js   （工具类阴影，仅登记）
 * 解析出来，并记录每个变量的来源行号，输出 design-baseline.json。
 *
 * 用法（仓库根目录）：node docs/design-baseline/extract-tokens.mjs
 * 改完主题后重跑本脚本，review JSON diff 即可看出视觉层动了什么。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const lines = (text) => text.split('\n');

/** 找到 selector 对应的块，返回 { startLine (1-based), body, bodyStartLine } */
function findBlock(text, selector) {
  const all = lines(text);
  const start = all.findIndex((l) => l.trim().startsWith(selector));
  if (start === -1) throw new Error(`block not found: ${selector}`);
  let depth = 0;
  let started = false;
  const body = [];
  for (let i = start; i < all.length; i++) {
    const line = all[i];
    for (const ch of line) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') depth--;
    }
    if (started) body.push(line);
    if (started && depth === 0) break;
  }
  return { startLine: start + 1, body: body.join('\n') };
}

/** 解析一个块里的 --var: value;，允许多条声明同一行（fs 就是一行多条） */
function parseVars(block) {
  const out = {};
  const re = /(--[\w-]+)\s*:\s*([^;{}]+);/g;
  let m;
  while ((m = re.exec(block.body))) {
    const before = block.body.slice(0, m.index);
    const line = block.bodyStartLine + (before.match(/\n/g)?.length ?? 0);
    out[m[1]] = {
      value: m[2].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim(),
      line,
    };
  }
  return out;
}

function blockVars(text, selector) {
  const block = findBlock(text, selector);
  block.bodyStartLine = block.startLine;
  return parseVars(block);
}

/** 在一段 TS 源码里找对象字面量的字段及其行号 */
function findConst(text, name) {
  const all = lines(text);
  const start = all.findIndex((l) => l.includes(`const ${name}`));
  if (start === -1) throw new Error(`const not found: ${name}`);
  let depth = 0;
  let started = false;
  const body = [];
  for (let i = start; i < all.length; i++) {
    const line = all[i];
    for (const ch of line) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') depth--;
    }
    if (started) body.push(line);
    if (started && depth <= 0) break;
  }
  return { startLine: start + 1, body: body.join('\n') };
}

function paletteEntries(text, name) {
  const b = findConst(text, name);
  const out = {};
  const re = /^\s*(\w+)\s*:\s*'([^']*)'\s*,/gm;
  let m;
  while ((m = re.exec(b.body))) {
    const before = b.body.slice(0, m.index);
    out[m[1]] = {
      value: m[2],
      line: b.startLine + (before.match(/\n/g)?.length ?? 0),
    };
  }
  return out;
}

/** 取某个字段首次出现的行号（用于 themeConfig 里的散落字面量） */
function lineOf(text, re) {
  const all = lines(text);
  for (let i = 0; i < all.length; i++) {
    if (re.test(all[i])) return i + 1;
  }
  return null;
}

/** 在 anchor 所在行之后找字段，避免同名 token 串号（如 token / Button 都有 borderRadius） */
function lineOfWithin(text, anchorRe, re) {
  const all = lines(text);
  const anchor = all.findIndex((l) => anchorRe.test(l));
  if (anchor === -1) return null;
  for (let i = anchor; i < all.length; i++) {
    if (re.test(all[i])) return i + 1;
  }
  return null;
}

const css = read('src/index.css');
const theme = read('src/theme/themeConfig.ts');
const tailwind = read('tailwind.config.js');

const root = blockVars(css, ':root {');
const small = blockVars(css, ":root[data-font-scale='small']");
const large = blockVars(css, ":root[data-font-scale='large']");
const dark = blockVars(css, '.dark {');

// 第二批 :root（表格度量）会被 blockVars(':root {') 漏掉，单独合并
const allRootBlocks = [];
{
  const all = lines(css);
  for (let i = 0; i < all.length; i++) {
    if (/^:root\s*\{/.test(all[i].trim())) {
      const b = findBlock(css, ':root {');
      // 逐块定位：用 index 前缀切片再找
      const slice = all.slice(i).join('\n');
      const blk = findBlock(slice, ':root {');
      blk.bodyStartLine = i + 1;
      allRootBlocks.push(parseVars(blk));
      i += blk.body.split('\n').length - 1;
    }
  }
}
const rootMerged = Object.assign({}, ...allRootBlocks);

// ---------------- 分类 ----------------
const COLOR_PREFIXES = [
  'surface', 'border', 'text', 'brand', 'success', 'warning', 'danger', 'info',
  'diff', 'conf', 'req', 'src', 'table', 'mask', 'scrollbar', 'selection',
  'code', 'toast', 'swatch', 'chart', 'asset-active',
];
const isColorVar = (name) => {
  const key = name.replace(/^--/, '');
  if (/^table-(head|row)-h$/.test(key)) return false; // 尺寸，不是颜色
  return COLOR_PREFIXES.some((p) => key === p || key.startsWith(`${p}-`));
};
const isTypographyVar = (name) =>
  /^--(font|fs|lh)-/.test(name);

function pick(source, predicate) {
  return Object.fromEntries(Object.entries(source).filter(([k]) => predicate(k)));
}

const color = {
  cssVariables: {
    light: pick(rootMerged, isColorVar),
    dark: pick(dark, isColorVar),
  },
  antd: {
    light: paletteEntries(theme, 'LIGHT'),
    dark: paletteEntries(theme, 'DARK'),
  },
};

// antd Palette → token 名的映射（写死在 themeConfig 的 getThemeConfig 里，这里显式登记）
const ANTD_TOKEN_MAP = {
  primary: 'colorPrimary', info: 'colorInfo', success: 'colorSuccess',
  warning: 'colorWarning', error: 'colorError', textBase: 'colorTextBase',
  text: 'colorText', text2: 'colorTextSecondary', text3: 'colorTextTertiary',
  text4: 'colorTextQuaternary', bgLayout: 'colorBgLayout',
  bgContainer: 'colorBgContainer', bgElevated: 'colorBgElevated',
  fillAlter: 'colorFillAlter', border: 'colorBorder',
  borderSecondary: 'colorBorderSecondary', mask: 'colorBgMask',
  tableHeaderBg: 'Table.headerBg', layoutHeaderBg: 'Layout.headerBg',
  tabsSelected: 'Tabs.itemSelectedColor', buttonFill: 'Button.colorPrimary',
  buttonFillHover: 'Button.colorPrimaryHover',
};

const antdTokens = {
  light: Object.fromEntries(Object.entries(color.antd.light).map(([k, v]) => [ANTD_TOKEN_MAP[k] ?? k, v])),
  dark: Object.fromEntries(Object.entries(color.antd.dark).map(([k, v]) => [ANTD_TOKEN_MAP[k] ?? k, v])),
};

// ---------------- 字号 ----------------
const fontLadder = (() => {
  // FONT_LADDER 的泛型里有花括号，findConst 会提前收尾；改为按行匹配整个档案
  const all = lines(theme);
  const start = all.findIndex((l) => l.includes('const FONT_LADDER'));
  const out = {};
  const re = /^\s*(\d+):\s*\{\s*aux:\s*(\d+),\s*title:\s*(\d+)\s*\},/;
  for (let i = start; i < all.length && i < start + 12; i++) {
    const m = all[i].match(re);
    if (m) out[m[1]] = { aux: +m[2], title: +m[3] };
  }
  return out;
})();

const fontSansLine = lineOf(theme, /export const FONT_SANS/);
const fontSansValue = (() => {
  const m = theme.match(/export const FONT_SANS =\s*\n?\s*'([^']+)'/);
  return m ? m[1] : null;
})();

const typography = {
  fontFamily: {
    sans: { value: rootMerged['--font-sans']?.value ?? null, line: rootMerged['--font-sans']?.line },
    mono: { value: rootMerged['--font-mono']?.value ?? null, line: rootMerged['--font-mono']?.line },
    antdFontSans: { value: fontSansValue, line: fontSansLine, note: 'themeConfig.ts 显式覆盖 antd fontFamily，与 --font-sans 同值' },
  },
  scale: {
    normal: pick(rootMerged, isTypographyVar),
    small: small,
    large: large,
  },
  antd: {
    fontSizeOptions: Object.keys(fontLadder).map(Number),
    defaultFontSize: 13,
    fontSizeSMByOption: Object.fromEntries(Object.entries(fontLadder).map(([k, v]) => [k, v.aux])),
    cardHeaderByOption: Object.fromEntries(Object.entries(fontLadder).map(([k, v]) => [k, v.title])),
    tableCellFontSize: '与界面字号同档（Table.cellFontSize = fontSize）',
    tableHeaderFontSize: 'var(--fs-aux)',
    tableHeaderFontWeight: 600,
  },
};

// ---------------- 间距 ----------------
const TABLE_DENSITY = (() => {
  const m = theme.match(/TABLE_DENSITY = \{\s*cellPaddingBlock:\s*(\d+),\s*cellPaddingInline:\s*(\d+)\s*\}/);
  return m ? { cellPaddingBlock: +m[1], cellPaddingInline: +m[2] } : null;
})();

const spacing = {
  theme: {
    tableCellPaddingBlock: { value: TABLE_DENSITY.cellPaddingBlock, unit: 'px', source: 'src/theme/themeConfig.ts TABLE_DENSITY' },
    tableCellPaddingInline: { value: TABLE_DENSITY.cellPaddingInline, unit: 'px', source: 'src/theme/themeConfig.ts TABLE_DENSITY' },
    tableHeadHeight: { value: rootMerged['--table-head-h']?.value, source: 'src/index.css :root --table-head-h', line: rootMerged['--table-head-h']?.line },
    tableRowHeight: { value: rootMerged['--table-row-h']?.value, source: 'src/index.css :root --table-row-h', line: rootMerged['--table-row-h']?.line },
    controlHeight: { value: 32, unit: 'px', source: 'src/theme/themeConfig.ts Button.controlHeight', line: lineOf(theme, /controlHeight:\s*32/) },
    layoutHeaderHeight: { value: 48, unit: 'px', source: 'src/theme/themeConfig.ts Layout.headerHeight', line: lineOf(theme, /headerHeight:\s*48/) },
    cardPaddingLG: { value: 16, unit: 'px', source: 'src/theme/themeConfig.ts Card.paddingLG', line: lineOf(theme, /paddingLG:\s*16/) },
  },
  components: {
    chipPadding: { value: '0 8px', source: 'src/index.css .ant-tag.chip-md', line: lineOf(css, /padding:\s*0 8px;/) },
    contextMenuPadding: { value: '4px 0', source: 'src/index.css .vp-context-menu', line: lineOf(css, /padding:\s*4px 0;/) },
    contextMenuItemPadding: { value: '5px 12px', source: 'src/index.css .vp-context-menu__item', line: lineOf(css, /padding:\s*5px 12px;/) },
    scrollbarWidth: { value: '8px', source: 'src/index.css ::-webkit-scrollbar', line: lineOf(css, /width:\s*8px;/) },
  },
};

// ---------------- 圆角 ----------------
const radius = {
  global: { value: 6, unit: 'px', source: 'src/theme/themeConfig.ts token.borderRadius', line: lineOf(theme, /^\s*borderRadius:\s*6,/) },
  button: { value: 6, unit: 'px', source: 'src/theme/themeConfig.ts Button.borderRadius', line: lineOfWithin(theme, /Button:\s*\{/, /borderRadius:\s*6,/) },
  card: { value: 8, unit: 'px', source: 'src/theme/themeConfig.ts Card.borderRadiusLG', line: lineOfWithin(theme, /Card:\s*\{/, /borderRadiusLG:\s*8,/) },
  table: { value: 8, unit: 'px', source: 'src/theme/themeConfig.ts Table.borderRadiusLG', line: lineOfWithin(theme, /Table:\s*\{/, /borderRadiusLG:\s*8,/) },
  chip: { value: '6px', source: 'src/index.css .ant-tag.chip-md', line: lineOf(css, /border-radius:\s*6px;/) },
  contextMenu: { value: '8px', source: 'src/index.css .vp-context-menu', line: lineOf(css, /border-radius:\s*8px;/) },
  focusRing: { value: '4px', source: 'src/index.css :focus-visible', line: lineOf(css, /border-radius:\s*4px;/) },
  scrollbar: { value: '4px', source: 'src/index.css ::-webkit-scrollbar-thumb', line: lineOf(css, /border-radius:\s*4px;/) },
  legendBar: { value: '3px', source: 'src/index.css .legend-bar', line: lineOf(css, /border-radius:\s*3px;/) },
};

// ---------------- 阴影 ----------------
const shadow = {
  popover: {
    light: { value: rootMerged['--shadow-popover']?.value, line: rootMerged['--shadow-popover']?.line },
    dark: { value: dark['--shadow-popover']?.value, line: dark['--shadow-popover']?.line },
    source: 'src/index.css',
  },
  primaryButtonHover: {
    value: '0 2px 6px var(--brand-weak)',
    source: 'src/index.css .ant-btn-primary:hover',
    line: lineOf(css, /box-shadow:\s*0 2px 6px var\(--brand-weak\)/),
  },
  tailwind: {
    sm: { value: "0 1px 2px 0 rgba(0, 0, 0, 0.05)", source: 'tailwind.config.js boxShadow.sm', note: '列表区护栏禁用 shadow-sm' },
    md: { value: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", source: 'tailwind.config.js boxShadow.md' },
  },
};

const baseline = {
  meta: {
    baselineDate: '2026-11-20',
    product: '整车产品工作台 VPW',
    theme: '曜蓝 Obsidian Blue v4.1',
    extraction: '由 ../extract-tokens.mjs 从源码解析，非手工抄录',
    sources: [
      { file: 'src/index.css', role: 'CSS 自定义属性（明暗两套）+ 组件级样式' },
      { file: 'src/theme/themeConfig.ts', role: 'antd v6 token、组件覆盖、字号阶梯、表格密度' },
      { file: 'tailwind.config.js', role: '工具类阴影与语义色入口（仅登记阴影）' },
    ],
    notes: [
      '颜色/字号以 src/index.css 的 CSS 变量为运行时事实源；themeConfig 的 Palette 与它同值同步（文件头注明「改色两边同步」）。',
      '暗色块只覆盖差异变量，未列出的变量继承 :root（如 --font-* / --fs-* / --lh-* / --ease-ui）。',
      '间距没有独立 token 体系，只有表格密度、控件高度、组件内边距等散落在 themeConfig 与 index.css 的具体值。',
      '本 JSON 只覆盖桌面端（≥1024px）基线；窄屏布局断点为 index.css 的 max-width: 1360px（仅收紧导航内边距）。',
    ],
  },
  color: { cssVariables: color.cssVariables, antdTokens },
  typography,
  spacing,
  radius,
  shadow,
};

const out = path.join(ROOT, 'docs/design-baseline/design-baseline.json');
fs.writeFileSync(out, JSON.stringify(baseline, null, 2) + '\n');
console.log(`wrote ${path.relative(ROOT, out)}`);
console.log(
  `light vars=${Object.keys(color.cssVariables.light).length}, dark vars=${Object.keys(color.cssVariables.dark).length}, ` +
  `fs=${Object.keys(typography.scale.normal).length}, palette=${Object.keys(color.antd.light).length}`,
);
