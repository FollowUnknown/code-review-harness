# Contract: 暂停/恢复 UI 缺陷修复 + View Report 链接修正

> 日期: 2026-05-13
> 状态: completed
> 类型: Business Task
> 版本: v1.4.6

## 问题 1: handlePause 缺少 fallback 状态清理

**现象：** 点击暂停后 pause API 返回 200，但 Resume 按钮不出现，页面卡在"暂停中..."状态。需要刷新页面才会显示 Resume。

**根因：** `handlePause` fetch 成功后没有清理 `isPausing` 状态。`isPausing(false)` 和 `isPaused(true)` 仅通过 SSE 流的 `paused` 事件触发。如果 SSE 流已结束（所有批次处理完毕，连接已关闭），`paused` 事件不会到达，`isPausing` 永远为 true，Resume 按钮不出现。

**修复方案：**
1. fetch 成功后立即 `setIsPausing(false)`
2. 添加 1s 延迟的 fallback：通过 checkpoint API 查询 `status=paused` 的 checkpoint
3. 若检测到暂停，自动设置 `isPaused` + `checkpointId` + 进度状态

**涉及文件：** `src/client/pages/RequirementReviewPage.tsx` — `handlePause` 函数

## 问题 2: View Report 链接路径错误

**现象：** 评审完成后绿色横幅上的 "View Report" 按钮 navigate 到 `/reviews/${reviewId}`，但该路径不存在（返回 404）。

**根因：** 路由定义是 `/requirement-review/:id`，但按钮写的是 `/reviews/${reviewId}`。

**修复方案：** 将 `navigate(\`/reviews/${reviewId}\`)` 改为 `navigate(\`/requirement-review/${reviewId}\`)`。

**涉及文件：** `src/client/pages/RequirementReviewPage.tsx:845`

## 影响范围

- 仅前端页面，不涉及后端 API
- 不影响现有测试（测试不覆盖前端 UI 渲染）
- TypeScript 编译通过 ✅
