import type { ThemeConfig } from 'antd';

/**
 * 曜蓝 Obsidian Blue v4.1 — antd token 双模式配置
 *
 * 暗色不能只靠 darkAlgorithm 推导：本配置显式指定的 token 值
 * 优先于算法输出，因此亮/暗两套值都必须显式给出，
 * 且与 index.css 的 :root / .dark 变量保持同源（改色两边同步）。
 *
 * v4.1 校正（专家缺口清单 D-01~D-05）：
 * - D-05 品牌拆名：colorPrimary（暗色 #8DA1F7）只管文字/链接/选中，
 *   主按钮实色填充在 Button 组件级覆盖为 --brand-fill #4D64E9（白字 4.9:1），
 *   否则淡蓝底白字仅 1.9:1
 * - D-02 控件描边单列：colorBorder = 控件描边（浅 #CCD1D9 / 暗 #5B6684 = 3:1），
 *   colorBorderSecondary = 装饰性分隔（保持低对比）
 * - D-03/D-04 暗色 text3/text4 提对比度
 * - 遮罩 colorBgMask 明暗成对
 */

interface Palette {
  primary: string; info: string; success: string; warning: string; error: string;
  textBase: string;
  text: string; text2: string; text3: string; text4: string;
  bgLayout: string; bgContainer: string; bgElevated: string; fillAlter: string;
  border: string; borderSecondary: string; mask: string;
  tableHeaderBg: string; layoutHeaderBg: string; tabsSelected: string;
  /** D-05：主按钮实色填充（仅暗色与 primary 不同值） */
  buttonFill: string; buttonFillHover: string;
}

const LIGHT: Palette = {
  primary: '#2F44D8',   // 曜蓝 600（on #FFF = 7.1:1 AAA）
  info: '#2F44D8',
  success: '#0C9A68',   // 松绿 500（图形层）
  warning: '#E8930C',   // 琥珀 500
  error: '#E5484D',     // 茜红 500
  textBase: '#1A1D26',
  text: '#1A1D26',
  text2: '#454C5C',
  text3: '#6F7787',     // v4.1 D-01：4.5:1（原 #8A91A0 仅 3.2:1）
  text4: '#C3C8D2',
  bgLayout: '#F7F8FA',
  bgContainer: '#FFFFFF',
  bgElevated: '#FFFFFF',
  fillAlter: '#F1F3F6',
  border: '#CCD1D9',        // 控件描边 = --border-control
  borderSecondary: '#E4E7EC', // 装饰性分隔 = --border-default
  mask: 'rgba(16, 18, 24, 0.45)',
  tableHeaderBg: '#F1F3F6',
  layoutHeaderBg: '#FFFFFF',
  tabsSelected: '#2F44D8',
  buttonFill: '#2F44D8',
  buttonFillHover: '#2738B4',
};

const DARK: Palette = {
  primary: '#8DA1F7',   // 主色抬阶，只管文字/链接/选中（7.1:1 on #161B23）
  info: '#3FA8B8',
  success: '#3DBD8A',
  warning: '#F0A83C',
  error: '#F06A6E',
  textBase: '#E6E9EF',
  text: '#E6E9EF',
  text2: '#AAB2C0',
  text3: '#8A93A5',     // v4.1 D-03：5.6:1（原 #6B7280 仅 3.6:1）
  text4: '#5E6675',     // v4.1 D-04：3.0:1（原 #4A5160 仅 2.2:1）
  bgLayout: '#0E1116',
  bgContainer: '#161B23',
  bgElevated: '#202734',
  fillAlter: '#202734',
  border: '#5B6684',        // 控件描边 = --border-control（3.0:1，v4.1 D-02）
  borderSecondary: '#2C3442', // 装饰性分隔（刻意低对比 1.4:1）
  mask: 'rgba(0, 0, 0, 0.62)',
  tableHeaderBg: '#202734',
  layoutHeaderBg: '#161B23',
  tabsSelected: '#8DA1F7',
  buttonFill: '#4D64E9',     // D-05 拆名：实色填充白字 4.9:1
  buttonFillHover: '#5569EB', // 白字 4.6:1
};

export const getThemeConfig = (isDark: boolean): ThemeConfig => {
  const p = isDark ? DARK : LIGHT;
  return {
    token: {
      colorPrimary: p.primary,
      colorInfo: p.info,
      colorSuccess: p.success,
      colorWarning: p.warning,
      colorError: p.error,
      colorTextBase: p.textBase,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      borderRadius: 6,
      fontSize: 13,
      colorBgLayout: p.bgLayout,
      colorBgContainer: p.bgContainer,
      colorBgElevated: p.bgElevated,
      colorBgMask: p.mask,
      colorBorder: p.border,
      colorBorderSecondary: p.borderSecondary,
      colorText: p.text,
      colorTextSecondary: p.text2,
      colorTextTertiary: p.text3,
      colorTextQuaternary: p.text4,
      colorFillAlter: p.fillAlter,
    },
    components: {
      Button: {
        fontWeight: 500,
        controlHeight: 32,
        borderRadius: 6,
        // D-05：主按钮实色填充与全局 primary 拆名（暗色下二者必须不同值）
        colorPrimary: p.buttonFill,
        colorPrimaryHover: p.buttonFillHover,
        colorPrimaryActive: p.buttonFillHover,
        colorTextLightSolid: '#FFFFFF',
      },
      Card: {
        borderRadiusLG: 8,
        paddingLG: 16,
      },
      Table: {
        headerBg: p.tableHeaderBg,
        headerSplitColor: 'transparent',
        headerColor: p.text,
        borderRadiusLG: 8,
      },
      Layout: {
        headerBg: p.layoutHeaderBg,
        headerHeight: 48,
      },
      Tabs: {
        itemSelectedColor: p.tabsSelected,
        inkBarColor: p.tabsSelected,
        titleFontSize: 14,
      },
    },
  };
};

export default getThemeConfig;
