# Contract: LLM Key 启动前验证 + SSE 全局超时

> 日期: 2026-05-13
> 状态: in_progress
> 类型: Business Task
> 版本: v1.4.6

## 背景

LLM key 配置错误时，SSE 流挂住不结束，job 卡在 running，阻塞后续所有评审请求。需要两层防护。

## 范围

### G1: LLM Key 启动前验证

在 3 个 review 路由（review.ts, review-local.ts, review-requirement.ts）的 SSE 流开始前，用一次轻量 LLM 调用验证 key 有效性：

- 调用 `callLLM("respond with ok", "test", llmConfig)` 或类似轻量 prompt
- 如果失败（401/403/网络错误），立即返回 400 错误 + 明确提示 "LLM API key 无效或配置错误"
- **不创建 job**、不创建 checkpoint、不创建 review record
- 验证应在 `getLLMConfig()` 之后、`createJob()` 之前执行
- **resume 路径也要验证**：暂停后 LLM key 可能已失效，恢复时同样需要检查

### G2: SSE 全局超时

为 3 个 review 路由的 SSE 流加整体超时：

- 超时时间：30 分钟（可通过环境变量 `REVIEW_TIMEOUT_MINUTES` 配置，默认 30）
- 超时后：
  1. 标记 job 为 failed（error_message: "评审超时"）
  2. 标记 checkpoint 为 interrupted
  3. 标记 review 为 interrupted（如果已创建）
  4. 发送 SSE error 事件
  5. 关闭连接
- 超时定时器在 SSE 流正常结束时清除

### G3: 清理残留 running jobs

启动前检查该用户是否有残留的 running job（可能是之前超时/崩溃留下的）：

- 如果有，先标记为 failed（error_message: "上一次评审异常中断"），再继续
- 这样不会 409 阻塞新请求

## 不做

- 不改 `callLLM` 本身的超时逻辑（那是 LLM 客户端层的配置）
- 不改前端 UI（错误已经通过 SSE error 事件展示）
- 不加重试机制（key 错误重试没意义）

## 影响文件

| 文件 | 变更 |
|------|------|
| `src/server/routes/review-requirement.ts` | G1 验证 + G2 超时 + G3 清理 |
| `src/server/routes/review.ts` | G1 验证 + G2 超时 + G3 清理 |
| `src/server/routes/review-local.ts` | G1 验证 + G2 超时 + G3 清理 |

## 验收标准

- [ ] G1: LLM key 无效时，POST 立即返回 400 + 明确错误信息，不创建任何 job/checkpoint/review
- [ ] G2: SSE 流超过 30 分钟自动中断，所有状态正确标记
- [ ] G3: 残留 running job 不阻塞新请求
- [ ] 三个 review 路由行为一致
