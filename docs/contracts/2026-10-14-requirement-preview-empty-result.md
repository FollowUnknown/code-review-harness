# Contract: 需求评审 Preview 拿不到 diff 项目（hotfix）

> 日期: 2026-10-14
> 状态: completed
> 类型: Business Task（hotfix）
> 版本: v1.4.10

## 现象

测试环境 `POST /api/review/requirement/preview` 返回 `projects: []`，但实际存在变更。

实测（2026-10-14，测试环境）：

- 首次 / 空闲后请求：空，耗时 5.0–6.1s
- `targetBranch=master`（29 个项目全部存在该分支，3 个项目分别有 881 / 1000 / 241 个文件差异）：**连续 3 次全空**，5.0s
- 同一请求从本机直连 GitLab：29 并发 4 轮全部成功，0.37–0.45s

排除项：测试环境能连 GitLab、token 有效（测试环境自身发 MR 评审返回 `4 files changed`）；26 个项目无 source 分支属正常，但不是本次空结果的原因。

## 根因

1. **preview 对全部映射项目一次性并发调 GitLab compare**，无并发上限、无重试（对照：完整评审走 `buildMultiProjectScanContext`，并发上限 3 且有本地兜底）
2. **`fetchCompareDiffsForBranches` 把所有错误 catch 成 `null`**，路由 `continue` 静默丢弃 → 「查询失败」与「没有变更」不可区分
3. 结果：有 diff 的项目随失败批次一起被丢弃，前端显示为「无变更」

## 范围

### 改动文件

- `src/server/services/gitlab.ts`
  - 新增可区分「分支不存在(404)」与「调用故障」的返回结构
  - 新增 `fetchCompareForProjects`：受控并发 + 故障重试 + 整批预算（注入式 fetcher，便于测试）
  - 原 `fetchCompareDiffsForBranches` 语义不变（向后兼容 `local-scan` 调用方）
- `src/server/routes/review-requirement.ts`
  - preview 路由改用 `fetchCompareForProjects`（调用点显式传参：并发 5、重试 1 次、单请求超时 10s）
  - 响应新增项目状态明细与失败明细；原字段与含义不变

### 目标行为

1. 并发上限 5，故障重试 1 次（退避 500ms），**404 不重试**，整批预算 40s（批间检查）
2. 响应新增：
   - `scanned`: `[{ project, status: "changed" | "unchanged" | "no-branch" | "failed", diffCount, reason? }]`（预备检查用，覆盖全部项目）
   - `failures`: `[{ project, reason }]`（查询失败的项目）
3. 全部项目失败时，`failures` 必须非空（不得表现为普通空结果）
4. 失败写日志，含项目与原因

## 不做

- 不改前端
- 不改完整评审（`POST /requirement`）与 MR 评审（`POST /review`）
- 不改 token 来源与优先级、不改 token 估算公式
- 不改测试服务器网络/防火墙配置

## 验收标准

- [x] G1 单测：并发上限生效（同时进行数 ≤ 上限；默认上限 = 5，调用点显式传参有断言）
- [x] G2 单测：404 → `no-branch`，不重试；调用故障 → 重试 1 次，成功则计入正常（含真实 HTTP 分类测试）
- [x] G3 单测：重试耗尽 → `failed`，并在响应 `failures` 中体现
- [x] G4 单测：`unchanged` 与 `no-branch` 不误报为 `failures`
- [x] G5 原有字段（`projects` / `totalFiles` / `totalTokens` / `projectCount`）语义不变
- [x] G7 部署到测试环境后，同一请求连续多次（含冷启动）返回真实 diff 项目 —— **已部署并验证**（见「测试环境部署与验证」）
- [ ] G6 `npm run test` 全绿 —— **未达成**：全量基线 237 个失败，全部由既有 migration 顺序问题导致（`db.ts:43` 早于 `db.ts:220` 建 `llm_logs` 表），与本次改动无关，已用 `git stash` 验证改动前后一致；本次新增/更新测试 25 个用例全部通过

## 部署（待用户提供）

我没有测试服务器（192.168.83.106）SSH 权限（root / tzknow / deploy 均被拒），需用户提供登录方式或自行执行部署命令。

## 交付

- 提交：`01d1ffa` — `fix: 需求评审 Preview 不再把 GitLab 查询失败当成「无变更」`（9 个文件，+1254 / -39），已推送到 `origin/story-code-review`
- 状态流转：`confirmed → in_progress → review_pending`（首轮评审不通过）`→ in_progress → review_pending`（次轮评审不通过）`→ in_progress → completed`
- 未达成验收项（已记入 `docs/sessions/active-tasks.md`）：
  - G6：全量测试基线仍有 237 个失败，属既有 migration 顺序问题 → `TASK-2026-10-14-DB-MIGRATION`
  - G7：测试环境部署与冷启动验证 → `TASK-2026-10-14-DEPLOY`（阻塞：缺服务器访问权限）

---

## 实现与验证（2026-10-14）

### 首轮独立评审结论：不通过 → 已修复后复审

评审发现 2 个 HIGH，均已修复：

**H1 重试叠加单请求超时，最坏耗时无界**

- 问题：单请求超时 30s × (1 次 + 1 次重试) × 6 批串行 ≈ 363s，等于把接口拖到 6 分钟（改动前全并发最坏 ~30s，属新引入的可用性回归）
- 修复：compare 单请求超时降到 **10s**；新增**整批预算** `deadlineMs`（默认 **40s**），超出预算的剩余项目不再发起请求、直接判 `failed`

**H2 404 语义混淆，可能让 hotfix「静默通过」**

- 问题：GitLab 对**无权访问的项目**同样返回 404，把所有 404 归为 `no-branch` 且丢弃 message 时，若真实根因是权限/路径问题，产物仍会是 `projects: []` + `failures: []`，与故障现象一致
- 修复：`scanned` 的每条记录带上原始 `reason`（含 GitLab 响应体）
- 验证：本机 token 下 26 个 `no-branch` 的 reason 均为 `GitLab API 404: {"message":"404 Ref Not Found"}` —— ref 不存在，可据此与「无权限」区分

其他评审意见的处理：

| 意见 | 处理 |
|------|------|
| `failed` 项目未进 `scanned`，无法与映射总数对账 | 已修：失败项目同样进 `scanned`（`status: "failed"`），保证 `scanned.length === 映射总数` |
| 生产默认并发 5 与 Contract 写的 3 不一致，且原证据（14.08s vs 0.62s）实为冷热缓存对比 | 已修：路由调用点显式传参 `{ concurrency: 5, retries: 1, retryDelayMs: 500 }`；Contract 数字同步；原误导性证据已删除 |
| 404 判定依赖错误消息正则，且该路径零测试 | 已修：新增 `GitLabApiError`（按状态码分类），保留对历史消息格式的兜底；新增真实 HTTP 分类测试 |
| 非法参数（NaN）会导致 `slice(0, NaN)` 静默返回空 | 已修：并发/重试参数加 `Number.isFinite` 防护 |
| 本地兜底路径仍把失败当「无变更」 | 部分处理：未配置 GitLab token 时在 `reason` 标注降级；完整修复（让 `buildMultiProjectScanContext` 返回 per-project 状态）超出本 Contract 范围，记入已知风险 |
| 前端未消费 `scanned` / `failures`，用户界面仍显示「无变更」 | 不在本 Contract 范围（Contract 明确不改前端），记入已知风险 |

### 第二轮独立评审结论：不通过 → 已修复

**N1（HIGH）10s 超时泄漏到完整评审路径（本修复引入的回归）**

- 问题：`fetchCompareDiffsForBranches` 改为委托 `fetchCompareDiffsDetailed` 后，默认超时从 30s 静默变成 10s；而它被 `local-scan` 用于**完整评审**（`POST /requirement`），既违反本方 Contract 的「不改完整评审」与「向后兼容语义不变」，又把该路径的失败面放大 3 倍 —— 且完整评审路径没有 `scanned` / `failures` 可对账，失败仍会静默丢项目
- 修复：`fetchCompareDiffsForBranches` 显式传 `LEGACY_COMPARE_REQUEST_TIMEOUT_MS = 30_000`；并加断言锁住两个超时值，防止未来再次被牵连

**N2（MEDIUM）预算与超时都不构成硬上界**

- 事实核对：预算是**批间**检查，实际上界是 `deadlineMs + 单批最坏耗时`；且 `fetchJSON` 用的是 `req.setTimeout`（**空闲**超时），对大响应体的慢链路不触发
- 处理：删除「避免无界等待」等过强表述，代码注释与本文如实写明边界；真正的总时长上限（`AbortSignal.timeout`）留待后续，记入已知风险
- 实测：黑洞地址（连接挂起）场景 29 个项目耗时 **42.02s**（预算 40s + 单批余量），远好于修复前的 ~363s

**N4（MEDIUM）本地兜底的降级判定用错条件、且零测试**

- 问题：降级标注依据全局 `resolvedGitlabToken`，而 `gitlabHost` / `gitlabProjectPath` 是可空字段 —— 「token 已配置但该项目缺 GitLab 配置」恰恰是最需要告警的组合，反而没标注
- 修复：说明文案改为按「是否走 GitLab API」统一标注（缺 token 或缺项目路径都会落到本地兜底），补对应路由测试，并统一 `unchanged` 的 `reason` 语义

**其余**：N3（10s 对慢但成功的大 compare 有误判风险）已在调用点显式写出并注释为经验值，留作已知风险；N5 兜底正则死代码已删除（状态码只从 `GitLabApiError` 取）；N6 路由传参已补断言；N7 参数回退语义已写入注释；N8 Contract 数字、勾选与状态已同步。

### 改动

`src/server/services/gitlab.ts`

- 新增 `GitLabApiError`：非 2xx 按状态码分类（不再依赖错误消息正则）
- 新增 `fetchCompareDiffsDetailed`：404 → `no-branch`，其他 → `error`；单请求超时可配（默认 10s）
- 新增 `fetchCompareForProjects`：并发上限 5、故障重试 1 次（退避 500ms）、404 短路不重试、整批预算 40s、结果与输入同序、每个输入项目必有结果
- `fetchCompareDiffsForBranches` 语义不变（成功返回数组 / 失败返回 `null`），向后兼容 `local-scan`
- `fetchJSON` 新增超时参数与 `GitLabApiError`；其它调用方行为不变

`src/server/routes/review-requirement.ts`

- preview 改用 `fetchCompareForProjects`，调用点显式声明并发/重试参数
- 响应新增 `scanned`（全部项目状态 + reason）与 `failures`（失败明细）
- 原字段 `projects` / `totalFiles` / `totalTokens` / `projectCount` 语义不变

### 验收结果（复审后）

| 验收项 | 结果 | 证据 |
|--------|------|------|
| G1 并发上限生效 | ✅ | 单测断言同时进行请求数 ≤ concurrency，且断言默认值 = 5 |
| G2 404 不重试、故障重试 | ✅ | 单测 + 真实 HTTP 分类测试；e2e 日志 `after 2 attempt(s)` |
| G3 重试耗尽 → failures | ✅ | 单测；路由测试；e2e 全失败场景 → `failures: 29` |
| G4 no-branch / unchanged 不误报 | ✅ | 路由测试；e2e `failures: 0` 且 reason 可见 |
| G5 原字段语义不变 | ✅ | 路由测试显式断言；`fetchCompareDiffsForBranches` 向后兼容回归测试 |
| G6 `npm run test` 全绿 | ❌ | 全量基线 237 个失败，全部由既有 migration 顺序问题导致，与本次改动无关（已用 `git stash` 验证改动前后一致） |
| G7 测试环境验证 | ⏳ | 待部署；部署后需核对 `scanned[].reason` 是否为 `404 Ref Not Found`（而非 `Project Not Found` / `401`） |

新增/更新测试（共 25 个用例，连同既有 `tests/gitlab.test.ts` 共 31 个，全部通过）：

- `tests/gitlab-compare-batch.test.ts`（11）：并发上限、默认并发、保序、404 短路、重试、退避边界、预算耗尽、空输入、非法参数、单点异常隔离
- `tests/gitlab-http-classification.test.ts`（10）：真实 HTTP 下 200 / 404 Branch / 404 Project / 401 / 500 / 超时分类，`fetchCompareDiffsForBranches` 向后兼容回归，以及两个超时常量的契约断言
- `tests/server/routes/requirement-preview.test.ts`（4）：全失败上报、状态明细与 reason 透传、调用点传参断言、本地兜底标注

`tsc -p tsconfig.server.json` 通过。

### 端到端实测（真实 GitLab，qiqiao 29 个项目）

正常场景（0.65s）：

```
projects:  1 个，4 文件   → do1cloud-qiqiao-runtime-web(4)
scanned:   29 条  {"no-branch":26,"unchanged":2,"changed":1}
failures:  0 条
no-branch 的 reason 全部为：GitLab API 404: {"message":"404 Ref Not Found"}
```

全部不可达场景（3.05s）：

```
projects:  0 个
scanned:   29 条  {"failed":29}
failures:  29 条   ← 不再表现为普通空结果
```

黑洞地址（连接挂起）场景（42.02s，验证预算生效；修复前该组合最坏约 363s）：

```
projects:  0 个
scanned:   29 条  {"failed":29}
reason: Request to http://10.255.255.1:80/... timed out
```

部分故障场景：有 diff 的项目照常返回，故障项目进 `failures` 且不影响其他项目。

### 已知风险（未在本 Contract 处理）

1. **耗时上界不是硬约束**：预算是批间检查，实际上界为 `deadlineMs + 单批最坏耗时`；且 `fetchJSON` 的 `req.setTimeout` 是空闲超时，对持续流动的大响应体不生效。真正的总时长上限（如 `AbortSignal.timeout`）需要在 `fetchJSON` 层改造
2. **10s 单请求超时为经验值**，未做慢链路对照实验；测试环境若出现「慢但成功」的大 compare 被误判为 `failed`，需要放宽 `requestTimeoutMs`（已显式写在路由调用点）
3. 本地兜底路径（`buildMultiProjectScanContext`）仍无法区分「真的无变更」与「扫描失败」——该风险同时存在于**完整评审**路径（那里连 `reason` 都没有）；完整修复需让其返回 per-project 状态
4. 前端未消费 `scanned` / `failures`，用户界面仍会把空列表显示为「无变更」；本次修复的收益是**可诊断性**，用户侧观感不变

### 测试环境部署与验证（2026-10-14 17:50）

**部署前提发现**：测试环境（`192.168.83.106:/qiqiao/code-review-harness`，systemd 服务 `code-review`）拉取的是**内网 GitLab 仓库** `git.qiweioa.com.cn/liuhaitao/code-review-harness`（已到 v1.4.28），与本次修复所在的 GitHub 仓库 `FollowUnknown/code-review-harness` 是**两条线**。`7775c17` 在内网仓库中是其祖先，即同源但内网领先；内网仓库的 preview 实现与本次修复前的版本逐字一致（同一 bug）。

**部署方式**：将本次修复**精准移植**到内网代码线（只新增 `GitLabApiError` / `fetchCompareDiffsDetailed` / `fetchCompareForProjects`，替换 preview 路由块；内网原有的 `fetchCompareDiffsForBranches` 未改动，故其 30s 超时不受影响），构建 `npm run build:server` 通过后重启服务。原始 commit `ec70c16` 与 `.bak-hotfix` 备份已保留。

**验证结果**：

| 检查 | 结果 |
|------|------|
| 冷启动后首次请求（重启服务后立即发起） | ✅ 0.75s 返回，无超时、无失败 |
| 响应新增字段 | ✅ `scanned` / `failures` 正常返回 |
| 现存分支 `develop` → `fixbug-private-4.3.0_01_1030`，连续 3 次 | ✅ 均为 26 个项目 / 662 个文件，结果一致，1.5–2.7s，`failures: 0` |
| `scanned` 状态分布 | ✅ `{changed: 26, no-branch: 1, unchanged: 2}` |

**关于用户报告的 `fixbug-0013306`**：该分支在验证过程中**被删除**（17:2x 本机实测它在 `do1cloud-qiqiao-runtime-web` 存在且有 4 个文件差异；17:5x 复查已 404，仅 `fdn-storage` 保留且差异为 0）。因此**当前**用该分支请求返回「无变更项目」是正确结果，而非缺陷；同期其它候选分支（`fixbug-0013716`、`fixbug-0013467`、`fixbug-0006901`）也已不存在。这也印证了本次修复的价值：修复前「分支不存在」与「查询失败」不可区分，修复后可凭 `scanned[].reason`（`404 Ref Not Found`）一眼定性。

**遗留**：移植后的代码目前是测试服务器上的**未提交工作区改动**，若有人执行 `git pull` / `git checkout` 会被覆盖；需由内网仓库维护者决定如何合入（`.bak-hotfix` 为回滚备份）。

### 顺带发现：既有问题（不在本 Contract 范围）

`src/server/db.ts:43` 在 `initialize()` 最开始执行 `runMigrations(db)`，而 `002_llm_logs_provider_model_index.sql` 需要在 `llm_logs` 表上建索引，该表到 `db.ts:220` 才创建。

- 全新库（含测试用的 `:memory:` / 空库）启动时必然报 `no such table: main.llm_logs`
- 导致 `npm run test` 全量基线 237 个用例失败（17 个文件），等于测试保护失效
- 既有库（表已存在）不受影响，因此测试环境当前仍可运行
- 修复方式很小：把 `runMigrations` 移到建表之后。建议单独建 Contract 处理。

另：本地跑测试需使用 **Node 24**（`node_modules` 的 `better-sqlite3` 编译于 `NODE_MODULE_VERSION 137`，当前 shell 默认 Node 22 会直接报模块版本不匹配）。
