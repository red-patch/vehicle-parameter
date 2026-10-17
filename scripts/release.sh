#!/bin/bash

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# 错误处理
set -e

# ====================================================================
# 用法:
#   scripts/release.sh <新版本号>           打 tag + 推送触发 CI + 本地构建产产物
#   scripts/release.sh <新版本号> --no-push  只改版本号并提交，不推（本地试跑）
#
# 说明（2026-10-17 修订，原因见注释内各项）：
# 1. 版本号改为位置参数（原 read -p 交互，agent 会话无法执行）
# 2. main 有 ruleset 保护（required check "check"，无 bypass 白名单），
#    直推 main 必被拒 —— 改为**开 PR**，由 CI 守卫合并（见 LESSONS L-6）
# 3. 不再 sed tauri.conf.json —— 其 version 是 "../package.json" 引用
#    （版本单一源，刻意的设计），改写死会破坏该引用
# 4. .app 名取 productName，不是包目录名（原脚本写死 vehicle-parameter.app，错）
# ====================================================================

NO_PUSH=0
for arg in "$@"; do
    case "$arg" in
        --no-push) NO_PUSH=1 ;;
    esac
done

echo -e "\n${BLUE}=== 🚀 Vehicle Parameter 发布脚本 ===${NC}\n"

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "当前版本: ${GREEN}${CURRENT_VERSION}${NC}"

NEW_VERSION="${1:-}"
# 去掉可能带的前缀 v
NEW_VERSION="${NEW_VERSION#v}"

if [ -z "$NEW_VERSION" ] || [ "$NEW_VERSION" = "--no-push" ]; then
    echo -e "${RED}错误: 请传入新版本号，例如 scripts/release.sh 4.14.0${NC}"
    echo -e "      当前版本: ${CURRENT_VERSION}"
    exit 1
fi

# 打 tag 前必须确认分支（共享工作树会被并行会话切换，见 AGENTS.md）
BRANCH=$(git branch --show-current)
echo -e "当前分支: ${GREEN}${BRANCH}${NC}"
if [ "$BRANCH" != "main" ]; then
    echo -e "${YELLOW}⚠️  当前不在 main 上（在 ${BRANCH}）。发布应从 main 开出，确认后继续？${NC}"
    read -p "回车继续，Ctrl-C 退出" _
fi

# 工作树必须干净
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}错误: 工作树不干净，先提交或清理${NC}"
    git status --short
    exit 1
fi

echo -e "\n${BLUE}---> 📦 更新版本号到 ${NEW_VERSION}...${NC}"

# 只改 package.json：tauri.conf.json 的 version 引用它（单一源）
npm version "$NEW_VERSION" --no-git-tag-version

echo -e "${GREEN}✓ 版本号已更新（tauri.conf.json 经 ../package.json 自动跟随）${NC}"

# ---- Git: 版本提交 + tag ----
echo -e "\n${BLUE}---> 🐱 执行 Git 操作...${NC}"

git add package.json package-lock.json
git commit -m "chore(release): v$NEW_VERSION"

git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

if [ "$NO_PUSH" = "1" ]; then
    echo -e "${YELLOW}--no-push：跳过推送。本地已有 commit 与 tag v${NEW_VERSION}${NC}"
else
    echo -e "\n${BLUE}---> 📤 推送分支（走 PR，main 受保护不能直推）...${NC}"
    git push origin "$BRANCH"
    echo -e "${GREEN}✓ 分支已推。请在 GitHub 开 PR 合并版本提交${NC}"
    echo -e "${YELLOW}  合并后再执行： git push origin v${NEW_VERSION}${NC}"
    echo -e "${YELLOW}  推 tag 会触发 CI 打包并创建 GitHub Release${NC}"
fi

# ---- 本地构建 ----
echo -e "\n${BLUE}---> 🔨 开始本地 Tauri 构建...${NC}"

# 允许构建命令返回错误（DMG 打包脚本可能失败），只要 .app 生成了就行
set +e
npm run tauri build
BUILD_EXIT_CODE=$?
set -e

if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}⚠️ 构建报告错误 (退出码 $BUILD_EXIT_CODE)，检查是否仍生成了可用产物...${NC}"
fi

# ---- 整理产物 ----
echo -e "\n${BLUE}---> 📂 整理构建产物...${NC}"

TARGET_DIR="src-tauri/target/release/bundle/macos"
# .app 名取 productName（tauri.conf.json），不是包目录名
PRODUCT_NAME=$(node -p "require('./src-tauri/tauri.conf.json').productName")
APP_PATH="$TARGET_DIR/${PRODUCT_NAME}.app"
DEST_DIR="$HOME/Desktop/VehicleParameter_v$NEW_VERSION"

mkdir -p "$DEST_DIR"

if [ -d "$APP_PATH" ]; then
    cp -r "$APP_PATH" "$DEST_DIR/"
    echo -e "${GREEN}✓ App 已复制到: $DEST_DIR${NC}"
else
    echo -e "${RED}⚠️ 未找到生成的 .app（预期路径: $APP_PATH）${NC}"
fi

DMG_FILE=$(find "$TARGET_DIR" -name "*.dmg" | head -n 1)
if [ -n "$DMG_FILE" ]; then
    cp "$DMG_FILE" "$DEST_DIR/"
    echo -e "${GREEN}✓ DMG 已复制到: $DEST_DIR${NC}"
else
    echo -e "${RED}⚠️ 未找到 DMG 文件${NC}"
fi

# ---- 安装到 /Applications ----
echo -e "\n${BLUE}---> 📲 安装到 /Applications...${NC}"
INSTALLED="/Applications/${PRODUCT_NAME}.app"
if [ -d "$APP_PATH" ]; then
    if [ -d "$INSTALLED" ]; then
        BACKUP="/Applications/${PRODUCT_NAME}.app.bak-$(date +%Y%m%d%H%M%S)"
        mv "$INSTALLED" "$BACKUP"
        echo -e "${YELLOW}旧版已备份: ${BACKUP}${NC}"
    fi
    cp -R "$APP_PATH" "$INSTALLED"
    echo -e "${GREEN}✓ 已安装: $INSTALLED${NC}"
    # 去隔离属性，避免首次打开被 Gatekeeper 拦
    xattr -dr com.apple.quarantine "$INSTALLED" 2>/dev/null || true
else
    echo -e "${RED}⚠️ 未找到 .app，跳过安装${NC}"
fi

echo -e "\n${GREEN}✨ 发布流程完成!${NC}"
echo -e "产物目录: ${BLUE}$DEST_DIR${NC}"
echo -e "已安装:   ${BLUE}$INSTALLED${NC}"

