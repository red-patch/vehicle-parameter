#!/bin/bash

# ====================================================================
# 把「origin/main 的最新代码」打包并安装到 /Applications。
#
# 为什么不在当前工作区直接 `npm run tauri build`：
# 1. 本仓库有多个 AI 会话并行改同一工作树。工作区可能正停在某个未合并分支上、
#    或者混着别的会话没提交的在制品——打出来的 .app 是几方代码的混合物，
#    你却以为验的是 main（AGENTS.md「执行纪律」：并行会话）。
# 2. 打包要 13 分钟量级，期间不该把主线 checkout 切来切去。
#
# 所以：从 origin/main 建一个临时 worktree → 在里面打包 → 安装 → 删掉 worktree。
# 工作区、当前分支、未提交改动一概不碰。
#
# 用法:
#   ./scripts/ship-local.sh              从 origin/main 打包并安装
#   ./scripts/ship-local.sh --branch X   改用某个远端分支/ref（调试用）
#   ./scripts/ship-local.sh --keep       装完保留 worktree 与产物目录（排查用）
#   ./scripts/ship-local.sh --no-install 只打包，不动 /Applications
# ====================================================================

set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'

REF="origin/main"
KEEP=0
INSTALL=1

while [ $# -gt 0 ]; do
    case "$1" in
        --branch)     REF="$2"; shift 2 ;;
        --keep)       KEEP=1; shift ;;
        --no-install) INSTALL=0; shift ;;
        -h|--help)    sed -n '2,22p' "$0"; exit 0 ;;
        *)            echo -e "${RED}未知参数: $1${NC}"; exit 1 ;;
    esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo -e "\n${BLUE}=== 📦 本地安装：$REF ===${NC}\n"

# ---- 1. 取最新 ref ----
echo -e "${BLUE}---> 🔄 拉取 $REF...${NC}"
git fetch origin --quiet
if ! git rev-parse --verify --quiet "$REF" >/dev/null; then
    echo -e "${RED}错误: 找不到 ref: $REF${NC}"
    exit 1
fi
COMMIT=$(git rev-parse --short "$REF")
SUBJECT=$(git log -1 --format=%s "$REF")
echo -e "    将打包 ${GREEN}${COMMIT}${NC} ${SUBJECT}"

# ---- 2. 建临时干净 worktree ----
# TMPDIR 自带结尾斜杠，先剥掉再拼，否则路径会变成 ".../T//vpw-ship.xxx"
TMP_BASE="${TMPDIR:-/tmp}"; TMP_BASE="${TMP_BASE%/}"
WORKTREE=$(mktemp -d "${TMP_BASE}/vpw-ship.XXXXXX")
cleanup() {
    if [ "$KEEP" = "1" ]; then
        echo -e "${YELLOW}--keep：保留 worktree ${WORKTREE}${NC}"
        return
    fi
    git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || rm -rf "$WORKTREE"
}
trap cleanup EXIT

echo -e "${BLUE}---> 🌿 从 ${COMMIT} 建临时 worktree...${NC}"
git worktree add --detach "$WORKTREE" "$REF" >/dev/null

# 复用主仓库已装的依赖：省掉一次 npm ci，也避免 worktree 里的 node_modules 占空间。
# 依赖是纯只读的（打包不改 node_modules），跨 worktree 共享安全。
if [ -d "$REPO_ROOT/node_modules" ]; then
    ln -s "$REPO_ROOT/node_modules" "$WORKTREE/node_modules"
    echo -e "    ${GREEN}已复用主仓库 node_modules${NC}"
else
    echo -e "    主仓库没有 node_modules，安装中..."
    (cd "$WORKTREE" && npm ci)
fi

# ---- 3. 打包 ----
# 只出 .app：DMG 要额外的 hdiutil 步骤且对本地验证没用
echo -e "\n${BLUE}---> 🔨 打包（约 10-15 分钟，首次更久）...${NC}"
set +e
(cd "$WORKTREE" && npx tauri build --bundles app)
BUILD_EXIT=$?
set -e

APP_PATH="$WORKTREE/src-tauri/target/release/bundle/macos"
APP=$(find "$APP_PATH" -maxdepth 1 -name '*.app' -print -quit 2>/dev/null || true)

if [ -z "$APP" ] || [ ! -d "$APP" ]; then
    echo -e "${RED}错误: 打包未产出 .app（退出码 $BUILD_EXIT）${NC}"
    echo -e "${YELLOW}worktree 保留在: $WORKTREE${NC}"
    KEEP=1
    exit 1
fi
echo -e "${GREEN}✓ 产物: $(basename "$APP")${NC}"

# 产物带上打包来源，避免和 /Applications 里的正式版混淆
PRODUCT_NAME=$(node -p "require('$WORKTREE/src-tauri/tauri.conf.json').productName")
VERSION=$(node -p "require('$WORKTREE/package.json').version")
echo -e "    ${PRODUCT_NAME} v${VERSION} @ ${COMMIT}"

if [ "$INSTALL" = "0" ]; then
    echo -e "\n${BLUE}--no-install：产物在${NC} $APP"
    KEEP=1
    exit 0
fi

# ---- 4. 安装 ----
echo -e "\n${BLUE}---> 📲 安装到 /Applications...${NC}"
INSTALLED="/Applications/${PRODUCT_NAME}.app"

# 先备份旧版再覆盖：装坏了能立刻回退
if [ -d "$INSTALLED" ]; then
    BACKUP="/Applications/${PRODUCT_NAME}.app.bak-$(date +%Y%m%d%H%M%S)"
    if mv "$INSTALLED" "$BACKUP" 2>/dev/null; then
        echo -e "${YELLOW}旧版已备份: $(basename "$BACKUP")${NC}"
    else
        echo -e "${RED}错误: 无法移走旧版（应用可能正在运行，先退出再试）${NC}"
        echo -e "${YELLOW}worktree 保留在: $WORKTREE${NC}"
        KEEP=1
        exit 1
    fi
fi

cp -R "$APP" "$INSTALLED"
xattr -dr com.apple.quarantine "$INSTALLED" 2>/dev/null || true

INSTALLED_VERSION=$(defaults read "$INSTALLED/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo '?')
echo -e "${GREEN}✓ 已安装: $INSTALLED（v${INSTALLED_VERSION}）${NC}"

echo -e "\n${GREEN}✨ 完成：${COMMIT} ${SUBJECT}${NC}"
echo -e "   旧版备份仍在 /Applications/（需要时手动删）"
