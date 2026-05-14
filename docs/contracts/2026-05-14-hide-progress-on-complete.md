# Contract: 评审完成后隐藏 ReviewProgress 面板

> 日期: 2026-05-14
> 状态: completed
> 类型: Business Task
> 版本: v1.4.8

## 范围

需求评审（requirement review）完成后，ReviewProgress 进度面板仍留在页面上，与"评审完成"横幅同时显示，造成界面混乱。

### 验收标准

1. 评审完成后（`reviewId` 被设置时），ReviewProgress 进度面板**自动隐藏**
2. 评审中断/暂停时，面板保持可见（用户需要看到进展以决定恢复或放弃）
3. 仅修渲染条件，不修改数据逻辑

### 不改

- 不修改 ReviewProgress 组件本身的逻辑
- 不修改前端数据获取/状态管理
- 不涉及后端改动

## 影响范围

- `src/client/pages/RequirementReviewPage.tsx`：修改第 848 行的渲染条件

## 方案

当前渲染条件：
```tsx
{showReviewProgress && reviewTotalBatches > 0 && (
```

改为：
```tsx
{showReviewProgress && reviewTotalBatches > 0 && !reviewId && (
```

在 SSE 完成事件处理（line 614）：当 `reviewId` 被设置后，`!reviewId` 为 false，面板不再渲染。

在 polling 完成处理（line 91-96）：同样逻辑，`reviewId` 被设置后面板隐藏。
