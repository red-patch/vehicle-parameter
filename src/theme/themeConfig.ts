import type { ThemeConfig } from 'antd';

const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#2563EB',    // Blue accent
    colorInfo: '#2563EB',
    colorSuccess: '#10B981',
    colorWarning: '#F59E0B',
    colorError: '#EF4444',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderRadius: 8,
    fontSize: 14,
    colorBgLayout: '#F9FAFB',
    colorBgContainer: '#FFFFFF',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  },
  components: {
    Button: {
      fontWeight: 500,
      controlHeight: 36,
      borderRadius: 8,
    },
    Card: {
      borderRadiusLG: 8,
      paddingLG: 16,
    },
    Table: {
      headerBg: '#FFFFFF',
      headerSplitColor: 'transparent',
      borderRadiusLG: 8,
    },
    Layout: {
      headerBg: '#FFFFFF',
      headerHeight: 48,
    },
    Tabs: {
      itemSelectedColor: '#2563EB',
      inkBarColor: '#2563EB',
      titleFontSize: 14,
    },
  },
};

export default themeConfig;
