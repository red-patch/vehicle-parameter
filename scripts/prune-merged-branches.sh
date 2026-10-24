#!/bin/bash

# ====================================================================
# 清理已经合进 main 的本地分支与远端残留。
#
# 为什么需要它：本仓库走「分支 + PR + squash 合并」。squash 会重写提交哈希，
# 于是合并后 `git branch -d` 会拒绝删除（git 认为分支「未合并」——它比对的是
# 提交图谱，不是内容），得靠 `-D` 硬删；人一犹豫，分支就留下了。此外
# `gh pr merge --squash` 不加 `--delete-branch` 时远端分支也不会删。
# 结果就是 AGENTS.md 里写了「--delete-branch」，实际却攒出一堆废弃分支。
#
# 判定「已合并」用的是 **tree 指纹**而不是提交图谱：
#   squash 提交的 tree 与分支 tip 的 tree 逐字节相同（文件内容一致），
#   所以在 main 的历史里找得到同一个 tree 就等于「内容已经进主干」。
# 这比 `git branch --merged` 更符合 squash 流程，也比「肉眼看 PR 状态」可靠。
#
# 用法:
#   ./scripts/prune-merged-branches.sh            只列出，不删（默认 dry-run）
#   ./scripts/prune-merged-branches.sh --apply    真正删除
#   ./scripts/prune-merged-branches.sh --apply --remote  同时删远端同名分支
# ====================================================================

set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'

APPLY=0
REMOTE=0
BASE="origin/main"

while [ $# -gt 0 ]; do
    case "$1" in
        --apply)  APPLY=1; shift ;;
        --remote) REMOTE=1; shift ;;
        --base)   BASE="$2"; shift 2 ;;
        -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
        *) echo -e "${RED}未知参数: $1${NC}"; exit 1 ;;
    esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

git fetch origin --prune --quiet

if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
    echo -e "${RED}错误: 找不到基线 $BASE${NC}"
    exit 1
fi

CURRENT="$(git symbolic-ref --short HEAD 2>/dev/null || echo '')"

echo -e "\n${BLUE}=== 🧹 分支清理（基线 $BASE）===${NC}\n"
[ "$APPLY" = "1" ] || echo -e "${YELLOW}dry-run：只列出，加 --apply 才真删${NC}\n"

# 基线历史里出现过的所有 tree —— 内容层面的「已进主干」集合
MERGED_TREES="$(git log --format=%T "$BASE" | sort -u)"

merged_local=(); kept_local=(); unmerged_local=()

while IFS= read -r br; do
    [ -n "$br" ] || continue
    [ "$br" = "$CURRENT" ] && { kept_local+=("$br"); continue; }
    [ "$br" = "main" ] && { kept_local+=("$br"); continue; }

    tip_tree="$(git rev-parse "$br^{tree}" 2>/dev/null || echo '')"
    if [ -n "$tip_tree" ] && grep -qx "$tip_tree" <<<"$MERGED_TREES"; then
        merged_local+=("$br")
    else
        # 还挂着上游（远端已删则显示 gone）但内容不在 main：多半是没合完
        unmerged_local+=("$br")
    fi
done < <(git for-each-ref --format='%(refname:short)' refs/heads | sort)

if [ ${#merged_local[@]} -gt 0 ]; then
    echo -e "${GREEN}已合进 $BASE（内容一致，可删）：${NC}"
    for br in "${merged_local[@]}"; do
        echo "  $br  ($(git log -1 --format='%h %s' "$br" | cut -c1-72))"
    done
else
    echo -e "${GREEN}没有需要清理的本地分支${NC}"
fi

if [ ${#unmerged_local[@]} -gt 0 ]; then
    echo -e "\n${YELLOW}内容不在 $BASE（保留，可能有未合并的工作）：${NC}"
    for br in "${unmerged_local[@]}"; do
        tracking="$(git for-each-ref --format='%(upstream:track)' "refs/heads/$br")"
        [ -n "$tracking" ] && tracking="  $tracking"
        echo "  $br$tracking"
    done
fi

if [ ${#kept_local[@]} -gt 0 ]; then
    echo -e "\n当前分支 / main：${kept_local[*]}（不动）"
fi

# 远端：PR 合并时若没带 --delete-branch，分支会留在 origin
if [ "$REMOTE" = "1" ]; then
    echo -e "\n${GREEN}远端已合入的分支：${NC}"
    remote_merged=()
    while IFS= read -r br; do
        [ -n "$br" ] || continue
        [ "$br" = "main" ] && continue
        tip_tree="$(git rev-parse "$BASE" >/dev/null 2>&1 && git rev-parse "origin/$br^{tree}" 2>/dev/null || echo '')"
        if [ -n "$tip_tree" ] && grep -qx "$tip_tree" <<<"$MERGED_TREES"; then
            remote_merged+=("$br")
            echo "  origin/$br"
        fi
    done < <(git for-each-ref --format='%(refname:short)' refs/remotes/origin | grep -v '^origin/HEAD$' | sed 's|^origin/||')
    [ ${#remote_merged[@]} -gt 0 ] || echo "  （无）"
fi

if [ "$APPLY" = "1" ]; then
    echo
    for br in "${merged_local[@]}"; do
        # -D 而非 -d：squash 合并后 git 不认为「已合并」，内容已由 tree 判定过
        git branch -D "$br" >/dev/null && echo -e "${GREEN}已删本地 $br${NC}"
    done
    if [ "$REMOTE" = "1" ]; then
        for br in "${remote_merged[@]}"; do
            git push origin --delete "$br" >/dev/null 2>&1 \
                && echo -e "${GREEN}已删远端 origin/$br${NC}" \
                || echo -e "${YELLOW}远端删除失败（可能已不存在）：origin/$br${NC}"
        done
    fi
    echo -e "\n${GREEN}完成${NC}"
else
    [ ${#merged_local[@]} -gt 0 ] && echo -e "\n加 ${BLUE}--apply${NC} 执行删除"
fi
