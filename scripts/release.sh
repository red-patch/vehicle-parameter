#!/bin/bash

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 错误处理
set -e

echo -e "\n${BLUE}=== 🚀 Vehicle Parameter 发布脚本 ===${NC}\n"

# 1.获取当前版本并询问新版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "当前版本: ${GREEN}${CURRENT_VERSION}${NC}"

read -p "请输入新版本号 (例如 3.0.1): " NEW_VERSION

if [ -z "$NEW_VERSION" ]; then
    echo -e "${RED}错误: 版本号不能为空${NC}"
    exit 1
fi

echo -e "\n${BLUE}---> 📦 更新版本号到 ${NEW_VERSION}...${NC}"

# 更新 package.json
npm version $NEW_VERSION --no-git-tag-version

# 更新 tauri.conf.json
#使用临时文件处理sed跨平台差异(macOS vs Linux)
TAURI_CONF="src-tauri/tauri.conf.json"
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" $TAURI_CONF
else
    sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" $TAURI_CONF
fi

echo -e "${GREEN}✓ 版本号已更新${NC}"

# 2. Git 操作
echo -e "\n${BLUE}---> 🐱 执行 Git 操作...${NC}"

git add package.json src-tauri/tauri.conf.json
git commit -m "chore(release): v$NEW_VERSION"

# 创建标签
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

# 推送
echo -e "正在推送到远程仓库..."
git push origin main
git push origin "v$NEW_VERSION"

echo -e "${GREEN}✓ Git 推送完成，GitHub Actions 应已触发${NC}"

# 3. 本地构建
echo -e "\n${BLUE}---> 🔨 开始本地 Tauri 构建...${NC}"

# 允许构建命令返回错误（因为DMG脚本可能会失败），只要App生成了就行
set +e
npm run tauri build
BUILD_EXIT_CODE=$?
set -e

if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}⚠️ 构建过程报告了错误 (退出码 $BUILD_EXIT_CODE)，尝试检查是否生成了可用产物...${NC}"
fi

# 4. 整理产物
echo -e "\n${BLUE}---> 📂 整理构建产物...${NC}"

TARGET_DIR="src-tauri/target/release/bundle/macos"
APP_PATH="$TARGET_DIR/vehicle-parameter.app"
DMG_PATH="$TARGET_DIR/vehicle-parameter_${NEW_VERSION}_aarch64.dmg"
DEST_DIR="$HOME/Desktop/VehicleParameter_v$NEW_VERSION"

mkdir -p "$DEST_DIR"

if [ -d "$APP_PATH" ]; then
    cp -r "$APP_PATH" "$DEST_DIR/"
    echo -e "${GREEN}✓ App 已复制到: $DEST_DIR${NC}"
else
    echo -e "${RED}⚠️ 未找到生成的 .app 文件${NC}"
fi

# 检查 DMG 是否存在 (有时构建脚本可能失败但不影响 app)
DMG_FILE=$(find "$TARGET_DIR" -name "*.dmg" | head -n 1)
if [ -n "$DMG_FILE" ]; then
    cp "$DMG_FILE" "$DEST_DIR/"
    echo -e "${GREEN}✓ DMG 已复制到: $DEST_DIR${NC}"
else
    echo -e "${RED}⚠️ 未找到 DMG 文件 (可能需要手动打包)${NC}"
fi

echo -e "\n${GREEN}✨ 发布流程完成!${NC}"
echo -e "请检查桌面文件夹: ${BLUE}$DEST_DIR${NC}"
