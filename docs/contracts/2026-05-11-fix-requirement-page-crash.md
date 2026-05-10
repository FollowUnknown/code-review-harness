---
name: fix-requirement-page-crash
status: confirmed
type: hotfix
date: 2026-05-11
---

# Fix: RequirementReviewPage 崩溃

## 问题
`/requirement-review` 页面空白，React 报错 "An error occurred in the RequirementReviewPage component"

## 根因
1. 前端 `PreviewData.totalDiffChars` 与 API 返回字段 `totalTokens` 不匹配 → `undefined.toLocaleString()` 抛 TypeError
2. API 返回 `fileCount` 但前端 `ProjectScanResult.diffCount` 期望 `diffCount` → 显示 undefined

## 改动范围
- `src/client/pages/RequirementReviewPage.tsx` — 修正 PreviewData 接口和模板字段名
- `src/server/routes/review-requirement.ts` — preview API 返回 diffCount 而非 fileCount

## 不做
- 不改变 API 的整体结构
- 不添加 error boundary（后续优化）
