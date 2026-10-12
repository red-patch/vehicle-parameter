// troika-three-text 0.52.5 的 .d.ts 埋在 dist/types/，但 package.json 未声明
// types/exports 字段，bundler 解析会落到 main 的 .umd.js 而找不到声明（TS7016）。
// 主项目只在 Vehicle3D.tsx 顶层用到 configureTextBuilder，这里补最小 ambient 声明。
declare module 'troika-three-text' {
  export function configureTextBuilder(config: { defaultFontURL?: string }): void;
}