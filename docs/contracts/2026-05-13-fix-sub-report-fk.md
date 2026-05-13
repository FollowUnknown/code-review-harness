# Contract: 修复 review_sub_reports FK 引用 reviews_old 导致评审失败

> 日期: 2026-05-13
> 状态: completed
> 类型: Business Task (hotfix)
> 版本: v1.4.6

## 背景

`POST /api/review/requirement` 在 step 4 返回错误：

```
Step 1: "no such table: main.reviews_old"
Step 2(修复后): "FOREIGN KEY constraint failed"
```

**根因**：`review_sub_reports` 表的 FK 指向 `reviews_old`（历史遗留），而 `better-sqlite3` v12.9.0 默认开启外键约束。`createSubReport()` INSERT 时触发 FK 校验失败，且该调用在内部 try-catch 之外，导致整次评审中断。

## 范围

- `src/server/db.ts`：新增 `migrateReviewSubReportsFK()`，临时关闭 FK 后重建表，修正 FK 为 `REFERENCES reviews(id)`
- 不改 API handler 或其他文件

## 当前状态

代码修改已完成，编译通过：
1. `migrateReviewSubReportsFK` — 检测 FK 是否含 `reviews_old`，是则 `PRAGMA foreign_keys = OFF` → 重建表 → `PRAGMA foreign_keys = ON`
2. 在 `initialize()` 中 `CREATE TABLE IF NOT EXISTS review_sub_reports` 之后调用

## 待验证

1. 重启服务器后 migration 执行
2. 发起 `POST /api/review/requirement` 请求确认评审正常完成（不再报 FK 错误）
3. 确认 `review_sub_reports` FK 已修复为 `REFERENCES reviews(id)`

## 影响文件

| 文件 | 改动 |
|------|------|
| `src/server/db.ts` | 新增 `migrateReviewSubReportsFK()` + 在 `initialize()` 中调用 |
