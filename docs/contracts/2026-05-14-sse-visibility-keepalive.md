# Contract: SSE 标签页切换保活

> 日期: 2026-05-14
> 状态: completed
> 类型: Business Task
> 版本: v1.4.9

## 背景

新标签页打开同一页面时，前端 `checkActiveJob` 发现 running job 后 fallback 到 polling，但后端 SSE 仍在旧连接上推送。旧连接断开后，后端 60 秒 abort 评审——评审本身不应因通知通道断连而中止。

## 根因

后端 `res.on("close")` 会在客户端断连 60 秒后设置 `aborted = true`，打断整个评审循环。评审是服务端进程（调 LLM、解析、存 DB），SSE 只是通知通道。

## 方案

SSE 断连不中止评审，sendSSE 静默跳过。前端 polling 已有完整 fallback。

## 范围

### 改动文件
- `src/server/services/sse-helper.ts` — sendSSE 的 res.write 加 try/catch，断连后静默跳过
- `src/server/routes/review-requirement.ts` — res.on("close") 移除 60 秒 abort timeout，只清全局超时

### 不做
- 不改前端（polling 机制已完备）
- 不改 review.ts（旧评审路由，可后续同步）

## 验收标准

- [ ] 评审过程中打开新标签页，评审不中断
- [ ] 后端日志无 res.write 抛异常
- [ ] 新标签页通过 polling 正常获取进度和最终结果
