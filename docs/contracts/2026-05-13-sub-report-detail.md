# Contract: 子项目评审结果下钻查看

> 日期: 2026-05-13
> 状态: in_progress
> 类型: Business Task
> 版本: v1.4.6

## 背景

需求评审详情页 `/requirement-review/:reviewId` 目前只展示子项目汇总表（项目名、技术栈、状态、评分、issue 数），无法点击查看某个子项目的详细 issues。子项目的完整评审数据已存在 `review_sub_reports.report_json` 中，缺少 UI 消费。

## 范围

- `src/client/pages/RequirementReviewDetailPage.tsx`：子项目行可点击，展开/导航查看该项目的完整 issues 列表
- 不修改后端 API，复用现有 `GET /api/reviews/:id/sub-reports` 数据
- 不修改 ReviewListPage 或其他页面

## 验收标准

1. 子项目列表每行可点击
2. 点击后展示该子项目的 issues 列表（严重级别、文件路径、问题描述、建议）
3. 展示该子项目的评分明细（各维度分数）
4. 可关闭/返回
5. **旧数据兼容**：v1.4.6 之前的旧评审记录（无 `review_sub_reports` 表数据，从 `report_json.techStackReports` 提取）同样支持点击查看 issues 和评分明细

## 不做的

- 不新增独立路由 `/requirement-review/:id/project/:projectName`
- 不改后端
- 不从 `/reviews/:id`（普通评审详情页）加子项目入口

## 影响文件

| 文件 | 改动 |
|------|------|
| `src/client/pages/RequirementReviewDetailPage.tsx` | 子项目行加点击展开抽屉/弹窗 |
