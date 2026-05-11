# Contract: Local Review Job 持久化

> 日期: 2026-05-07
> 状态: completed
> 类型: Business Task
> 版本: v1.3.9

## 背景

Local Review 页面（`/local-review`）通过 SSE 流式推送审查进度。用户刷新页面后：
1. SSE 连接断开，客户端进度和 reviewId 丢失
2. 服务端无 abort 检测（`review-local.ts` 没有 `res.on("close")`），继续运行但无人接收
3. 无恢复机制——审查结果虽然入库（`saveReviewRecord`），但用户拿不到 reviewId

Plan 的 batch review 有类似问题但更严重（plan 卡在 reviewing），已在上一轮修复（数据库重置）。
本 Contract 从根本上解决 local review 的刷新丢失问题。

## 目标

- 刷新页面后，自动恢复审查进度展示或跳转结果页
- 服务端可感知客户端断开，标记 job 为 aborted
- 服务重启时自动恢复卡住的 job

## 不做什么

- 不做 job 列表管理页面（job 是内部状态，用户无感知）
- 不做 SSE 重连（复杂度高，polling 已足够恢复场景）
- 不改变现有 SSE 实时推送的正常流程（正常情况下仍然走 SSE）

## 方案

在 SSE 之外加一层 job 持久化：每次审查先创建 job 记录，过程中更新进度，完成后关联 reviewId。刷新后通过 polling 恢复状态。

```
正常流程：POST /local → 创建 job → SSE 推进度(含 jobId) → 完成 → 更新 job(reviewId)
刷新后：  页面 mount → GET /local/active → 发现 running job → polling GET /local/:jobId → 恢复进度
断开时：  SSE close → 服务端标记 job aborted → 客户端重新 mount → 发现 aborted → 显示错误
```

## Grading Criteria

- [ ] 刷新页面后进度能自动恢复（至少显示已完成的步骤）
- [ ] 审查完成后刷新能显示 reviewId 跳转链接
- [ ] 客户端断开后服务端标记 job 为 aborted
- [ ] 服务重启后 running/pending 的 job 被重置为 failed
- [ ] 现有 SSE 实时推送功能不受影响

## 改动清单

### 1. `src/shared/types.ts` — 新增类型

```typescript
export type ReviewJobStatus = "pending" | "running" | "completed" | "failed" | "aborted";

export interface ReviewJob {
  id: string;
  project: string;
  sourceBranch: string;
  targetBranch: string;
  excludedFilesJson: string | null;
  status: ReviewJobStatus;
  reviewId: string | null;
  currentStep: number;
  currentLabel: string | null;
  stepsJson: string | null;       // JSON string[] — 已完成的步骤标签
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 2. `src/server/db.ts` — 新建 review_jobs 表

在 `initialize()` 中追加，跟 review_plans 一样的 Style B 模式：

```sql
CREATE TABLE IF NOT EXISTS review_jobs (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  source_branch TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  excluded_files_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','completed','failed','aborted')),
  review_id TEXT,
  current_step INTEGER NOT NULL DEFAULT 0,
  current_label TEXT,
  steps_json TEXT,
  error_message TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_review_jobs_status ON review_jobs(status);
CREATE INDEX IF NOT EXISTS idx_review_jobs_created_by ON review_jobs(created_by);
```

ID 格式: `JOB-${randomUUID().slice(0, 8)}`（与现有 `R-`、`PLAN-`、`PI-` 前缀不冲突）

### 3. `src/server/services/review-job-store.ts` — 新文件

遵循 `plan-store.ts` 的 CRUD 模式。

| 函数 | 用途 |
|------|------|
| `createJob(params)` | INSERT + 返回 ReviewJob |
| `findJobById(id)` | 按 ID 查询 |
| `findActiveJobByUser(userId)` | 查用户最近的 running job（`ORDER BY created_at DESC LIMIT 1`） |
| `updateJob(id, patch)` | 动态 SET 更新（同 `updatePlan` 模式） |
| `resetStuckJobs()` | 启动时重置 running/pending >5min 的 job 为 failed |

### 4. `src/server/routes/review-local.ts` — 核心改动

#### 修改 `POST /local`

1. 创建 job 记录（status=pending）
2. 第一个 SSE 事件带 `{ jobId }` 给客户端存储
3. 更新 job 为 running
4. 加 abort 检测：`res.on("close", () => { aborted = true; updateJob(jobId, { status: "aborted" }) })`
5. 在 `nextStep()` 中同步更新 job 进度到 DB
6. 完成/失败时更新 job 终态 + reviewId
7. 每个长操作前检查 `aborted` 跳过后续工作

#### 新增路由（注册顺序重要）

1. `GET /local/active` — 查当前用户是否有 running job，返回进度或 null
2. `GET /local/:jobId` — 查指定 job 状态，用于 polling

### 5. `src/server/index.ts` — 启动恢复

```typescript
import { resetStuckJobs } from "./services/review-job-store";
// app.listen 回调中调用
const resetCount = resetStuckJobs();
if (resetCount > 0) console.log(`Reset ${resetCount} stuck review jobs`);
```

### 6. `src/client/pages/LocalReviewPage.tsx` — 客户端恢复

- 新增 `currentJobId` state
- **mount 时**：`GET /local/active` 检查 running job
- **有 running job**：恢复表单值 + 步骤列表 → 启动 polling（2s 间隔）
- **SSE 中收到 jobId**：存入 state
- **SSE 断开 + 已有 jobId**：自动切换 polling
- **polling 终态**：completed → 显示 reviewId；failed/aborted → 显示错误

## 实现顺序

1. `src/shared/types.ts`（类型定义）
2. `src/server/db.ts`（建表）
3. `src/server/services/review-job-store.ts`（新文件）
4. `src/server/routes/review-local.ts`（路由改造 + 新端点）
5. `src/server/index.ts`（启动恢复）
6. `src/client/pages/LocalReviewPage.tsx`（客户端恢复逻辑）

## 验证方式

1. 发起 local review → 正常 SSE 推进度 → 完成显示结果链接
2. 审查中刷新页面 → 进度自动恢复，继续 polling 到完成
3. 审查完成后刷新 → 直接显示结果链接
4. 审查中断开连接（关标签页再开）→ 显示 aborted/failed
5. 杀服务重启 → running job 被重置为 failed
6. 同时不影响 plan batch review 的现有功能
