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
#   scripts/release.sh <版本号>             改版本号 → 开 release 分支 → 推 → 提示开 PR
#   scripts/release.sh --finish <版本号>    PR 合并后收尾：同步 main → 打 tag → 推 tag
#                                           （触发 CI 打包并创建 GitHub Release）
#                                           → 本地构建 → 安装到 /Applications
#   scripts/release.sh <版本号> --no-push   只改版本号并本地提交（试跑）
#
# 2026-10-17 修订（四处缺陷）：
# 1. 版本号改为位置参数 —— 原 read -p 交互，agent 会话无法执行
# 2. main 有 ruleset 保护（required check "check"、无 bypass 白名单），直推必被拒。
#    故版本提交走 release 分支 + PR；合并后才由 --finish 打 tag（LESSONS L-6）
# 3. 不再 sed `tauri.conf.json` —— 其 version 是 "../package.json" 引用（版本单一源，
#    刻意的设计），改写死会破坏该引用
# 4. `.app` 名取 productName（原脚本写死 vehicle-parameter.app，与实际不符）
# ====================================================================

NO_PUSH=0
FINISH=0
ARGS=()
for arg in "$@"; do
    case "$arg" in
        --no-push) NO_PUSH=1 ;;
        --finish)  FINISH=1 ;;
        *)         ARGS+=("$arg") ;;
    esac
done

echo -e "\n${BLUE}=== 🚀 Vehicle Parameter 发布脚本 ===${NC}\n"

NEW_VERSION="${ARGS[0]:-}"
NEW_VERSION="${NEW_VERSION#v}"   # 容忍带 v 前缀

if [ -z "$NEW_VERSION" ]; then
    echo -e "${RED}错误: 请传入版本号，例如 scripts/release.sh 4.14.0${NC}"
    echo -e "      当前 package.json 版本: $(node -p "require('./package.json').version")"
    exit 1
fi

if [ "$FINISH" = "1" ]; then
# ====================================================================
# 模式二：--finish（release PR 已合并后收尾）
# ====================================================================
    echo -e "${BLUE}模式: --finish（打 tag + 推 tag + 本地构建安装）${NC}\n"

    # 共享工作树会被并行会话切分支，打 tag 前必须重确认（AGENTS.md 纪律）
    BRANCH=$(git branch --show-current)
    if [ "$BRANCH" != "main" ]; then
        echo -e "${RED}错误: --finish 须在 main 上执行（当前 ${BRANCH}）${NC}"
        exit 1
    fi

    echo -e "${BLUE}---> 🔄 同步 main...${NC}"
    git fetch origin
    git merge --ff-only origin/main

    # 校验：即将打 tag 的这棵树上版本号确实是目标版本
    ON_MAIN_VERSION=$(node -p "require('./package.json').version")
    if [ "$ON_MAIN_VERSION" != "$NEW_VERSION" ]; then
        echo -e "${RED}错误: main 上版本是 ${ON_MAIN_VERSION}，不是 ${NEW_VERSION}${NC}"
        echo -e "      请确认 release PR 已合并${NC}"
        exit 1
    fi

    if git rev-parse "v$NEW_VERSION" >/dev/null 2>&1; then
        echo -e "${RED}错误: tag v$NEW_VERSION 已存在${NC}"
        exit 1
    fi

    echo -e "${BLUE}---> 🏷  打 tag 并推送（触发 CI 打包 GitHub Release）...${NC}"
    git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
    git push origin "v$NEW_VERSION"
    echo -e "${GREEN}✓ tag 已推，CI 将构建 Windows/macOS 安装包并创建 Release${NC}"

else
# ====================================================================
# 模式一：改版本号 → release 分支 → 推 → 提示开 PR
# ====================================================================
    CURRENT_VERSION=$(node -p "require('./package.json').version")
    echo -e "当前版本: ${GREEN}${CURRENT_VERSION}${NC}"

    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${RED}错误: 工作树不干净，先提交或清理${NC}"
        git status --short
        exit 1
    fi

    BRANCH=$(git branch --show-current)
    echo -e "当前分支: ${GREEN}${BRANCH}${NC}"

    echo -e "\n${BLUE}---> 📦 更新版本号到 ${NEW_VERSION}...${NC}"
    # 只改 package.json：tauri.conf.json 的 version 引用它（单一源）
    npm version "$NEW_VERSION" --no-git-tag-version
    echo -e "${GREEN}✓ 版本号已更新（tauri.conf.json 经 ../package.json 自动跟随）${NC}"

    echo -e "\n${BLUE}---> 🐱 提交...${NC}"
    git add package.json package-lock.json
    git commit -m "chore(release): v$NEW_VERSION"

    if [ "$NO_PUSH" = "1" ]; then
        echo -e "${YELLOW}--no-push：已本地提交，未推未打 tag${NC}"
        exit 0
    fi

    RELEASE_BRANCH="chore/release-v$NEW_VERSION"
    echo -e "\n${BLUE}---> 📤 开 release 分支并推送（main 受保护，不能直推）...${NC}"
    git checkout -b "$RELEASE_BRANCH"
    git push -u origin "$RELEASE_BRANCH"
    echo -e "${GREEN}✓ 已推: $RELEASE_BRANCH${NC}"
    echo -e "\n${YELLOW}下一步：${NC}"
    echo -e "  1. 开 PR 并合并："
    echo -e "     gh pr create --base main --head $RELEASE_BRANCH --title 'chore(release): v$NEW_VERSION'"
    echo -e "  2. 合并后收尾： ${BLUE}scripts/release.sh --finish $NEW_VERSION${NC}"
    exit 0
fi

# ====================================================================
# 本地构建 + 整理产物 + 安装（两条模式共用；模式一在此前已 exit）
# ====================================================================
echo -e "\n${BLUE}---> 🔨 开始本地 Tauri 构建...${NC}"

# 允许构建返回错误（DMG 打包脚本可能失败），只要 .app 生成了就行
set +e
npm run tauri build
BUILD_EXIT_CODE=$?
set -e

if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo -e "${YELLOW}⚠️  构建报告错误 (退出码 $BUILD_EXIT_CODE)，检查是否仍生成了可用产物...${NC}"
fi

echo -e "\n${BLUE}---> 📂 整理构建产物...${NC}"

BUNDLE_DIR="src-tauri/target/release/bundle"
# .app 在 bundle/macos/，DMG 在 bundle/dmg/（不同子目录，勿用同一个 TARGET_DIR）
APP_DIR="$BUNDLE_DIR/macos"
PRODUCT_NAME=$(node -p "require('./src-tauri/tauri.conf.json').productName")
APP_PATH="$APP_DIR/${PRODUCT_NAME}.app"
DEST_DIR="$HOME/Desktop/VehicleParameter_v$NEW_VERSION"

mkdir -p "$DEST_DIR"

if [ -d "$APP_PATH" ]; then
    cp -r "$APP_PATH" "$DEST_DIR/"
    echo -e "${GREEN}✓ App 已复制到: $DEST_DIR${NC}"
else
    echo -e "${RED}⚠️  未找到 .app（预期路径: $APP_PATH）${NC}"
fi

DMG_FILE=$(find "$BUNDLE_DIR" -name "*.dmg" 2>/dev/null | head -n 1)
if [ -n "$DMG_FILE" ]; then
    cp "$DMG_FILE" "$DEST_DIR/"
    echo -e "${GREEN}✓ DMG 已复制到: $DEST_DIR${NC}"
else
    echo -e "${YELLOW}⚠️  未找到 DMG${NC}"
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
    # 去 quarantine，避免首次打开被 Gatekeeper 拦
    xattr -dr com.apple.quarantine "$INSTALLED" 2>/dev/null || true
    echo -e "${GREEN}✓ 已安装: $INSTALLED${NC}"
else
    echo -e "${RED}⚠️  未找到 .app，跳过安装${NC}"
fi

echo -e "\n${GREEN}✨ 发布流程完成!${NC}"
echo -e "产物目录: ${BLUE}$DEST_DIR${NC}"
echo -e "已安装:   ${BLUE}$INSTALLED${NC}"
