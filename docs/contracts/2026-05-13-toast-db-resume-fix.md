# Contract: Toast 通知 + DB 连接优化 + Resume 结果完整性

> 日期: 2026-05-13
> 状态: completed
> 类型: Business Task
> 版本: v1.4.6

## 背景

评审 SSE 流程中的 LLM key 无效、API 400 等错误仅 console 输出，用户看不到提示；评审期间其他页面加载卡死（DB 单连接阻塞）；resume 后最终报告缺少已完成项目数据。

> 注：本 Contract 为事后补录。实际实施时未走 Contract 流程，属违规操作。详见 `sessions/2026-05-13.md` 违规记录。

## 范围

### A. 全局 Toast 通知系统

| 验收标准 | 状态 |
|----------|------|
| A1. Toast 组件支持 error/success/warning 三种类型，5s 自动消失，可手动关闭 | ✅ |
| A2. ToastProvider 在 App.tsx 中包裹所有路由 | ✅ |
| A3. RequirementReviewPage：SSE !response.ok + catch 错误触发 toast | ✅ |
| A4. LocalReviewPage：HTTP 非 200 + SSE catch 错误触发 toast | ✅ |
| A5. ProgressStepper（MR 评审）：HTTP 错误 + SSE error 事件 + 连接失败触发 toast | ✅ |

**涉及文件**：
- `src/client/components/Toast.tsx`（新建）
- `src/client/App.tsx`
- `src/client/pages/RequirementReviewPage.tsx`
- `src/client/pages/LocalReviewPage.tsx`
- `src/client/components/ProgressStepper.tsx`

### B. DB 连接优化（解除 SSE 阻塞）

| 验收标准 | 状态 |
|----------|------|
| B1. 新增 `getReadDb()` 只读连接（WAL 模式下读写互不阻塞） | ✅ |
| B2. 写连接加 `busy_timeout = 5000` | ✅ |
| B3. JWT secret 内存缓存，auth 中间件不再查 DB | ✅ |
| B4. 所有 SELECT-only 方法切到 `getReadDb()` | ✅ |
| B5. `closeDb()` 同时关闭读写两个连接 | ✅ |

**涉及文件**：
- `src/server/db.ts`（getReadDb + busy_timeout + closeDb）
- `src/server/services/auth.ts`（cachedJwtSecret + invalidateJwtSecretCache + getUserById/getUserByUsername/listUsers → getReadDb）
- `src/server/services/settings.ts`（getSetting → getReadDb）
- `src/server/services/review-store.ts`（findReviewById/listReviews → getReadDb）
- `src/server/services/review-job-store.ts`（findJobById/findActiveJobByUser → getReadDb）
- `src/server/services/review-checkpoint-store.ts`（findCheckpointById/findCheckpointByJobId/listCheckpoints → getReadDb）
- `src/server/services/review-sub-report-store.ts`（listSubReports/findSubReportById → getReadDb）

### C. Resume 结果完整性

| 验收标准 | 状态 |
|----------|------|
| C1. Resume 跳过已完成 techStack group 时，从 sub_reports 加载结果到 techStackReports | ✅ |
| C2. Resume 跳过同 group 内已完成 project 时，从 sub_reports 加载结果到 projectReports | ✅ |
| C3. 最终合并报告包含全部项目（已完成 + 新处理） | ✅ |

**涉及文件**：
- `src/server/routes/review-requirement.ts`（completedSubReports Map + 两个 skip 分支加载逻辑）

## 不改边界

- 不改 `better-sqlite3` 为异步库（如 `sql.js`），改动范围过大
- 不改 review 循环内的写操作为异步/批量，当前 `setImmediate` 方案暂不实施
- 不加 cluster/worker 多进程，当前单进程 + 读写分离已满足并发需求

## 风险

| 风险 | 缓解 |
|------|------|
| 只读连接看到过期数据 | WAL 模式保证读一致性，只读连接读到的始终是最近 commit 的快照 |
| JWT secret 更新后缓存未失效 | 提供 `invalidateJwtSecretCache()` 供 settings 更新时调用 |
| sub_reports 部分项目 status 非 completed | `completedSubReports` 只取 status=completed 的记录，跳过 failed/pending |
