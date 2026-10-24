# LESSONS.md — 错题本

> 由 agent 维护的工程教训记录。机制见 [docs/plans/2026-10-13-automated-dev-flow-design.md](docs/plans/2026-10-13-automated-dev-flow-design.md)。
> 入口路由见 [AGENTS.md](AGENTS.md)「导航指针」。

## 怎么用

- **记什么**：只记三类——①**返工**（同一问题/同一文件行为被再次改动）；②**不该合**（本可被现有检查拦下却提交/合并了）；③**验证太糙**（结论缺证据：没回退验证、只整一个平台、没跑项未标注）。
- **不记什么**：主观偏好、用户文案风格、`AGENTS.md`/`docs/adr/` 已有硬规则（本文件只做发现渠道，不做规则源）。
- **单条格式**：
  ```markdown
  ### L-<n>: <一句规则>
  - 原因：<为什么>。
  - 证据：<commit sha / issue>。
  - Seen N×（<日期列表，去重到"天">）。
  ```
- **升格规则（核心）**：同一条规则在一个**新的、不同的一天**再次命中 → `Seen` +1 并追加日期；`Seen` 满 **3 个不同日期** → 规则挖进 `AGENTS.md`（行为约束进「执行纪律」，环境坑进「已知坑」，可执行动作进「热点文件/产品名落点」表），本条标 `→ 已升格至 AGENTS.md §<x>（<日期>）` 并**保留在此作为证据链**，不再重复计数。
- **软上限**：>60 条触发一次"合并同类项 + 升格/淘汰"整理。

### 夜审 prompt（按需调用，不必常驻定时）

> `/loop` 定时任务仅在 REPL 空闲时触发、7 天过期，本项目非常驻会话，故夜审改为**收工或阶段节点时手动喊一次**：

```
复盘今天所有 commit：只找①修完又返工的 ②本可被现有检查拦下的 ③验证缺证据的。
逐条按 LESSONS.md 格式追加（含 commit sha 证据 + Seen 计数），Seen 满 3 个不同日期则升格进 AGENTS.md。
已有条目重复命中就更新 Seen，不新建。
```

Loop B（工作树体检）/ Loop C（陈旧物清理）发现异常时，顺带向本文件补记一条，使错题本在无夜审时也能生长。

---

## 种子条目（回溯初建，2026-10-13）

> 建库时用 `git log` 实测的历史返工作初始记录。四组均已于**同一天内**连续修完，故各自 `Seen 1×`——升格需"不同日子"重现，此处不虚报。它们同时充当格式样例。

### L-1: 改发布/构建产物配置（`productName`、安装器目标）时，必须一次性覆盖所有平台，不留尾
- 原因：Windows WiX 对非 ASCII `productName` 不友好，与中文产品名冲突；一点来回改了 4 轮才定下「中文 productName + 关掉 WiX、Windows 只走 NSIS」。这类"某平台专属限制"必须在改动当次就把所有目标平台验证到位。
- 证据：`523b28b`（回退 ASCII）→ `1d95bd0`（改回中文 + NSIS only）→ `1e7b459`（ASCII + WiX 兼容）→ `c8361fc`（中文 + 关 WiX），均 2026-07-03。
- Seen 1×（2026-07-03）。

### L-2: CI/工作流依赖改动，必须同时覆盖所有 runner 平台（Windows 与 macOS 一起）
- 原因：先给 Windows 装了 `bun`，漏了 macOS，同一天补第二次。凡是往 `.github/workflows/` 加东西，默认"所有 job 都要"，单平台验证不算完。
- 证据：`b74a971`（Windows）→ `a8986cf`（macOS too），均 2026-05-09。
- Seen 1×（2026-05-09）。

### L-3: 提交前没跑 `npm run typecheck`，导致连续修 unused vars
- 原因：一次提交里残留未用变量（`pendingWorkbook`、`React` import、`_fileName` 等），随后连开三条修复。本项目「执行纪律」要求"没跑的检查不算通过"——遵守即可拦住。
- 证据：`24c9ca5` / `441c491` / `889152f`，均 2026-05-07。
- Seen 1×（2026-05-07）。
- 关联：与 `AGENTS.md`「验证命令」「执行纪律」同源，属已有硬规则未被执行。

### L-4: 文档改动后要同步其内部数字/引用，别留 `fix doc counts`
- 原因：改计划文档后，文档内引用的计数/符号与代码现状脱节，事后单独发 `fix doc counts`、`fix Task 6 plan` 补。改 A 处引用时，顺手全库核对指向 A 的引用。
- 证据：`40c38ba`、`5302b5b`，均 2026-10-09。
  再次命中：`72cf6cb` 在 `AGENTS.md` 写死「`LEGACY_EXEMPT` 列了 13 个老文件（仅剩 29 处）」，同日 `0cb5573` 改了豁免表、也改了 `AGENTS.md`，却没同步这个数；2026-10-19 核对时实际是两张表共 14 个文件 / 24 处。
- Seen 2×（2026-10-09、2026-10-17）。
- 对策（2026-10-19）：`AGENTS.md` 不再写死会变的数字（改写「以 X 为准」），其中的路径与 npm 命令由 `src/__tests__/agentsDoc.test.ts` 校验。

---

## 后续条目

### L-5: 新建的文件必须与「引用它的改动」同批提交，否则 HEAD 会碎
- 原因：三轮改动只 `git add` 了自己**改过**的文件，漏掉**新建**的文件——提交的 `MatchResultTable` 已 `import` 三个构件（`ListToolbar`/`SearchInput`/`FacetChips`），而这三个文件从未入库。后果：干净 checkout 上 `tsc` 直接报 `TS2307 Cannot find module`，**HEAD 无法构建**（`npm run build` 必挂），而本地因为工作区有这些文件，一切"正常"，完全无感。是靠 `git worktree add HEAD` 到独立目录跑 typecheck 才发现的。
- 证据：`afb19ce`（提交时三个构件均不在库，实测 `git cat-file -e afb19ce:src/components/common/ListToolbar.tsx` 不存在）→ `0165871` / `ace8bb0` / `7eade3b`（三条补提交修复），均 2026-10-16。
- Seen 1×（2026-10-16）。
- 关联：与 `AGENTS.md`「执行纪律」的"没跑的检查不算通过"同类——**提交后应在独立 worktree 上验证 HEAD 可构建**，本地绿不等于 HEAD 绿（本地工作区会掩盖漏提交）。

### L-6: 推主干前先查分支保护（ruleset），别只看 fast-forward
- 原因：用户要「把本地 `main` 推上去」，我核了工作树干净、`origin/main` 是祖先（可 fast-forward）就下了「安全」的结论，**漏查分支保护规则**。实际 `main` 挂着 ruleset `main-protection`（`required_status_checks: ["check"]`，且 `bypass_actors: []` —— 管理员也不能绕），直接推**必然被拒**。为执行这个「A 方案」我还在本地 `main` 上白做了一个提交（`0f52a69`），最后只能 `git branch -f main origin/main` 清掉。
- 证据：`git push origin main` → `remote rejected: Required status check "check" is expected`；`gh api repos/<owner>/<repo>/rulesets` → `main-protection`（2026-10-13 建）。误判与清理均 2026-10-16。
- Seen 1×（2026-10-16）。
- 关联：与 L-5 同源——都是「**本地能做 ≠ 远程接受**」的验证环境不对齐。推主干前应查：`gh api repos/{owner}/{repo}/branches/<branch>/protection` 与 `/rulesets`；有保护时**走 PR** 是唯一路径，`main` 的本地领先提交会随 PR 合并进入主干，不必也无法单独推。

### L-7: 类型检查只认 `npm run typecheck`；报告里写出实际跑的命令
- 原因：`AGENTS.md` 已写明「裸跑 `tsc --noEmit` 检查零个文件」，验证时仍用了 `npx tsc --noEmit -p .`（根 `tsconfig.json` 是 solution 文件，`-p .` 同样是零个文件），并据此报告「类型检查通过」。结论碰巧成立（同轮 `npm run build` 的 `tsc -b` 通过，事后补跑 `npm run typecheck` 也通过），但证据是假的。埋在列表中间的提醒挡不住顺手的习惯命令。
- 证据：`1399013` 的验证记录（2026-10-19）；补跑 `npm run typecheck` 退出码 0。
- Seen 1×（2026-10-19）。
- 关联：与 L-3 同源，属已有硬规则未被执行。对策是把正确命令做成默认路径：新增 `npm run check`（lint → typecheck → test → build），`AGENTS.md`「验证」一节把它放在第一行。

---

## 已升格条目（种子前的手工升格，留档）

> 下列规则在建库**之前**已由人工升格进 `AGENTS.md`，此处仅登记来源，证明"I从教训到硬规则"的路径本项目早已在走。

- **产品名落点表** ← 产品名 10 处落点 + 拉丁后缀不可省 + `identifier` 不可改（原 `AGENTS.md` §产品名落点；2026-10-19 清单移至 `docs/产品名落点.md`，`identifier` 一条留在 `AGENTS.md` 红线）。成因同 L-1 一类的"多落点/跨平台"返工。
- **已知坑：README 是模板原文 / `交互优化设计方案.md` 部分陈旧** ← 重复踩到"文档与仓库现状脱节"，与 L-4 同类。（2026-10-19：README 已重写，该条删除；陈旧说明移入 `交互优化设计方案.md` 文件头。）
- **已知坑：`tauri dev` 旧二进制 / dev 性能放大百倍 / mock 反复新建拖垮 jsdom / worktree 陈旧快照** ← 环境类，与 L-2/L-3 的"验证环境不对齐"同类。

### L-8: CI 的检查项必须与本地 `check` 同义，否则「绿」是假的

- 原因：`main` 的服务端保护规则只认一项名叫 `check` 的检查，而 CI 的 `check` job 实际只跑 lint / typecheck / test 三项，**没有 `npm run build`**；本地 `npm run check` 是四项。两者同名不同义，导致「CI 绿」并不代表「能构建」——`tsc -b`、vite 打包、Tauri 配置层面的问题全都拦不住。此前没有自动合并，靠人手动把关还能兜住；一旦开自动合并，等于让构建不过的代码直接进主干。
- 证据：`.github/workflows/build.yml` 的 `check` job（2026-10-23 之前）无 Build 步骤；`gh api repos/<owner>/<repo>/rulesets` 显示 `required_status_checks: ["check"]`；本地 `package.json` 的 `check` 为 lint → typecheck → test → build。修订于 2026-10-23（补 Build 步骤）。
- Seen 1×（2026-10-23）。
- 关联：与 L-7 同源——都是「验证命令与实际保障范围不一致」。对策是把 CI 的 job 步骤与 `npm run check` 对齐并写在 AGENTS.md「提交与 PR」里，改 CI 时不能把 build 拿掉。

### L-9: 打包安装要在 `origin/main` 的干净 worktree 里跑，不能读当前工作区

- 原因：`npm run tauri build` 打的是**当前工作区**。本仓库常有多个 AI 会话并行改同一工作树，工作区可能停在未合并分支上、或混着别的会话没提交的在制品——打出来的 `.app` 是几方代码的混合物，而使用者以为验的是 `main`。这个问题不会报错，只会让人拿着错误的包去判断「这版有没有修好」。
- 证据：2026-10-23 为验证必填改造在共享工作区直接跑 `npx tauri build --bundles app`，当时工作区在 `feat/pinned-table-header` 且含另一会话 26 个未提交改动。随后改为 `scripts/ship-local.sh`：从 `origin/main` 建临时 worktree 打包，实测 13 分 31 秒出 20MB 的 `.app`。
- Seen 1×（2026-10-23）。
- 关联：与 L-5「本地绿 ≠ HEAD 绿」同一类——**验证环境与被验证对象不对齐**。L-5 是「工作区文件掩盖漏提交」，本条是「工作区改动污染产物」。

### L-10: PR 合并必须带 `--delete-branch`；squash 后本地分支要用 tree 指纹判定再删

- 原因：两处叠加，各自都能独立造成「分支越攒越多」。
  1. **合并时漏了 `--delete-branch`**：这个 flag 同时删本地和远端分支。2026-10-23 合并 #17 时写成了 `--delete-branch=false`（想表达「不删」），远端 `feat/pinned-table-header` 因此留着。
  2. **squash 让 `git branch -d` 失效**：squash 合并会重写提交哈希，主干上的新提交与分支 tip 不是同一对象，git 据此判定「未合并」并拒绝删除；于是即便人想清，也得先确认内容一致再用 `-D`——这个「先确认」的成本让人干脆不动。
  两条同时成立，`chore/ship-flow`（远端已 gone）与 `feat/pinned-table-header` 就都留了下来。
- 证据：2026-10-24 执行 `git branch -vv` 见两者：`chore/ship-flow` 标记 `origin/chore/ship-flow: gone`、`feat/pinned-table-header` 标记 `ahead 3, behind 1`；`git diff main feat/pinned-table-header` 为空、`chore/ship-flow` 的 tip tree 等于 `4dcd56c` 的 tree。
- Seen 1×（2026-10-24）。
- 关联：与 L-8 同源——**规则写了但执行时被改写/绕过**。对策是把「收尾」做成一个命令：新增 `scripts/prune-merged-branches.sh`，用 **tree 指纹**（squash 提交与分支 tip 的 tree 逐字节相同）判定内容是否已进 `origin/main`，默认 dry-run、`--apply` 才删、未匹配的一律保留。`AGENTS.md`「提交与 PR」已写入这两条。
