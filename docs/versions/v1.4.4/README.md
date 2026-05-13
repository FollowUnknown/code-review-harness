# v1.4.4 - 评审执行体验优化

> 状态: ✅ 已完成
> 前置: v1.4.3 (Java 评审经验知识导入)
> 后置: v1.5.0

## 背景

当前评审 SSE 流只推送步骤进度（扫描中→分类中→评审中→完成），报告在全部完成后一次性返回。当评审内容较多时：
- 等 5-10 分钟后才看到任何结果，体验差
- 中途关闭页面全部结果丢失，无法恢复
- 无法中断长时间运行的评审

## 核心目标

1. **逐步评审报告** — 每批文件评审完立即推送该批结果，不等全部结束
2. **暂停/重启** — 长时间评审可暂停，保存检查点，重启时从断点继续

---

## 功能设计

### 1. 逐步评审报告

**现状：**
```
SSE: scanning → classifying → reviewing(batch1..N) → complete(一次性返回全部 report)
前端：转圈等待 → 一次性渲染完整报告
```

**目标：**
```
SSE: scanning → classifying → review_start(batch_count) 
      → batch_result({batch_index, files, issues}) × N 
      → complete(final_report)
前端：进度条 + 每批结果逐步追加渲染
```

**SSE 事件定义：**

| 事件 | 数据 | 说明 |
|------|------|------|
| `review_start` | `{ totalBatches, totalFiles }` | 评审批次总量 |
| `batch_result` | `{ batchIndex, files[], issues[], progress }` | 单批评审结果 |
| `paused` | `{ checkpointId, progress, reviewedCount }` | 评审已暂停 |
| `resumed` | `{ checkpointId, remainingBatches }` | 从检查点恢复 |
| `complete` | `{ report }` | 最终汇总报告 |

**前端展示：**
- 进度条：`已评审 N/M 文件（X%）`
- 问题列表：增量追加，新批次结果淡入动画
- 批次折叠：已完成的批次可折叠/展开
- 评测和建议：实时累计 P0/P1/P2 统计、平均分

### 2. 暂停/重启

**架构：**

```
┌──────────────────────────────────────────────────┐
│                  LocalReviewPage                  │
│  ┌─────────┐  ┌──────────┐  ┌─────────────────┐ │
│  │ 开始评审 │  │  暂停 ⏸  │  │ 恢复 ▶ / 放弃 🗑 │ │
│  └─────────┘  └──────────┘  └─────────────────┘ │
│       │             │               │             │
│  ┌────┴─────────────┴───────────────┴──────────┐ │
│  │              SSE 事件流                       │ │
│  │  batch_result → batch_result → [暂停] → ...  │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
         │                    │
    POST /api/review/local   POST /api/review/local/pause
                             POST /api/review/local/resume
         │                    │
    ┌────┴────────────────────┴────┐
    │     review_checkpoints 表     │
    │  id | status | batch_results │
    │  ... | paused | [...]        │
    └──────────────────────────────┘
```

**数据库：**

```sql
CREATE TABLE review_checkpoints (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  source_branch   TEXT,
  target_branch   TEXT,
  status          TEXT NOT NULL DEFAULT 'running',  -- running | paused | completed | abandoned
  current_batch   INTEGER DEFAULT 0,
  total_batches   INTEGER DEFAULT 0,
  total_files     INTEGER DEFAULT 0,
  reviewed_count  INTEGER DEFAULT 0,
  batch_results   TEXT DEFAULT '[]',    -- JSON: [{batchIndex, files[], issues[]}]
  partial_score   REAL,                 -- 当前累计分数
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**API：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/review/local` | 发起评审（同现在），新增支持 `?checkpointId=xxx` 参数恢复 |
| POST | `/api/review/local/pause` | 暂停评审 `{ checkpointId }` |
| POST | `/api/review/local/resume` | 恢复评审 `{ checkpointId }` |
| GET | `/api/review/checkpoints` | 列出所有检查点 `?project=xxx&status=paused` |
| DELETE | `/api/review/checkpoints/:id` | 删除/放弃检查点 |

**暂停流程：**
1. 用户点暂停 → POST /api/review/local/pause
2. 服务端设 `shouldPause = true`
3. 当前批次完成后，保存 `batch_results` → DB，状态 = `paused`
4. SSE 发送 `paused` 事件
5. 前端显示"已暂停，可恢复或放弃"

**恢复流程：**
1. 用户点恢复 → POST /api/review/local/resume
2. 服务端加载 checkpoint，跳过已完成的批次
3. SSE 先发 `resumed` 事件
4. 继续 `batch_result` 流，前端在已有结果上追加

---

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/server/routes/review-local.ts` | SSE 事件拆分、pause/resume 端点、checkpoint 管理 |
| `src/server/db/schema.ts` | 新增 review_checkpoints 表 |
| `src/server/services/reviewer.ts` | 批次间检查暂停标志、emit batch_result |
| `src/client/pages/LocalReviewPage.tsx` | 逐步渲染、暂停/恢复按钮、检查点列表 |
| `src/client/components/ReviewProgress.tsx` | 新增：进度条 + 批次折叠组件 |

## 验收标准
- [ ] 每批文件评审完立即在前端看到该批结果
- [ ] 评审中可暂停，状态持久化到 DB
- [ ] 关闭页面重开后能查到 paused 的检查点并恢复
- [ ] 恢复后从断点继续，不重复评审已完成批次
- [ ] 至少支持 3 个并发检查点

## 关键问题（待讨论）
- 检查点保留多久？自动清理策略？
- 暂停后源分支代码变更了怎么处理？
- 多用户同时评审同一项目时的检查点隔离？
