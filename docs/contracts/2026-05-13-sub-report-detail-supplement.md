# Contract: 子项目详情页补充 LLM Logs + 知识库

> 日期: 2026-05-13
> 状态: completed
> 类型: Business Task
> 版本: v1.4.6

## 背景

`SubReportDetailPage.tsx` 已实现 issues 列表和评分明细，但 Contract `2026-05-13-sub-report-detail.md` 的验收标准第 8、9 条未覆盖：

- 验收标准 8: LLM Logs 抽屉（右上角")
- 验收标准 9: KnowledgeDetailDrawer（知识条目查看）

另外，SubReportDetailPage 当前完全无知识库相关的 UI 和数据获取，需确认是否有知识库数据可展示。

## 调研结论

### LLM History Drawer

- `LLMHistoryDrawer` 组件接收 `reviewId: string` 和 `onClose`，内部通过 `GET /api/reviews/${reviewId}/logs` 获取日志
- `ReviewDetailPage.tsx` 中已有完整实现模式：右上角按钮 toggle + AnimatePresence 渲染 Drawer
- SubReportDetailPage 已有 `reviewId`（来自 URL params），可直接接入

### KnowledgeDetailDrawer

- `KnowledgeDetailDrawer` 组件接收 `entry: KnowledgeEntrySummary` 和 `onClose`
- `ReviewDetailPage.tsx` 通过 `ReviewResult` 组件的 `onKnowledgeClick` 回调获取选中的知识条目
- 但 SubReportDetailPage **没有使用 ReviewResult 组件**，而是自行渲染 issues/scores

### 知识库数据流（需确认）

- `GET /api/reviews/:id` 返回 `{ record, response }`，其中 `response` 包含 `knowledgeUsed` 和 `knowledgeProduced`（`KnowledgeEntrySummary[]`）
- RequirementReviewDetailPage（父页面）调用该 API 但只取了 `detailData.record`，丢弃了 `detailData.response`
- 知识库数据是**整条评审维度**的，没有按子项目拆分的粒度

## 范围

1. `SubReportDetailPage.tsx`：
   - 右上角添加 LLM Logs 按钮，使用 `LLMHistoryDrawer` 组件
   - **知识库展示待确认**（见"待确认"部分）
2. 不修改后端 API
3. 不影响已有弹窗行为

## 验收标准

1. LLM Logs 按钮位于页面右上角，点击打开 LLMHistoryDrawer（与 ReviewDetailPage 一致）
2. 知识条目相关功能（待确认具体方案）

## 不做的

- 不改后端 API
- 不改 RequirementReviewDetailPage 的数据获取逻辑（如需变更需扩大范围）
- 不改 LLMHistoryDrawer / KnowledgeDetailDrawer 组件行为

## 待确认

> ~~关于知识库数据：子项目粒度的 `review_sub_reports` 表没有 `knowledgeUsed`/`knowledgeProduced` 字段。整条评审的知识库数据存在于 `GET /api/reviews/:id` 返回的 `response` 中。~~

已确认采用方案 A：SubReportDetailPage 额外调用 `GET /api/reviews/:reviewId` 获取 `response.knowledgeUsed`（评审使用的知识）和 `response.knowledgeProduced`（评审产出的知识），展示为两个独立区域，支持点击条目打开 KnowledgeDetailDrawer 查看详情。

## 影响文件

| 文件 | 改动 |
|------|------|
| `src/client/pages/SubReportDetailPage.tsx` | 添加 LLM Logs 按钮和 Drawer；根据待确认方案添加知识库相关功能 |
