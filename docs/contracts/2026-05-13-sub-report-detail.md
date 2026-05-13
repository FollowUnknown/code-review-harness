# Contract: 子项目评审结果下钻查看

> 日期: 2026-05-13
> 状态: completed
> 类型: Business Task
> 版本: v1.4.6

## 背景

需求评审详情页 `/requirement-review/:reviewId` 目前只展示子项目汇总表（项目名、技术栈、状态、评分、issue 数），无法点击查看某个子项目的详细 issues。子项目的完整评审数据已存在 `review_sub_reports.report_json` 中，缺少 UI 消费。

## 范围

- `src/client/pages/RequirementReviewDetailPage.tsx`：保留行点击弹窗，每行新增"详情"按钮导航到独立页面
- `src/client/pages/SubReportDetailPage.tsx`：新增独立页面，展示子项目的 issues 列表和评分明细
- `src/client/App.tsx`：新增路由 `/requirement-review/:reviewId/projects/:projectName`
- 不修改后端 API，复用现有 `GET /api/reviews/:id/sub-reports` 数据
- 不修改 ReviewListPage 或其他页面

## 验收标准

1. 子项目列表**行点击**继续弹窗查看（保持现有行为不变）
2. 每行新增"详情"按钮，点击后导航到独立页面
3. 独立页面展示该子项目的 issues 列表（严重级别、文件路径、问题描述、建议）
4. 展示该子项目的评分明细（各维度分数）
5. 顶部有返回按钮，可回到需求评审详情页
6. **可直接通过 URL 访问**：`/requirement-review/:reviewId/projects/:projectName`
7. **旧数据兼容**：v1.4.6 之前的旧评审记录（无 `review_sub_reports` 表数据，从 `report_json.techStackReports` 提取）同样支持查看 issues 和评分明细
8. **LLM Logs 抽屉**：右上角 LLM Logs 按钮，点击打开 LLMHistoryDrawer（与 ReviewDetailPage 一致）
9. **KnowledgeDetailDrawer**：支持点击知识条目查看详情

## 不做的

- 不改后端
- 不从 `/reviews/:id`（普通评审详情页）加子项目入口
- 不修改数据库结构

## 影响文件

| 文件 | 改动 |
|------|------|
| `src/client/App.tsx` | 新增路由 `/requirement-review/:reviewId/projects/:projectName` |
| `src/client/pages/RequirementReviewDetailPage.tsx` | 每行新增"详情"按钮导航到独立页面，保留弹窗 |
| `src/client/pages/SubReportDetailPage.tsx` | 新增，从弹窗中提取 issues + 评分明细内容 |
