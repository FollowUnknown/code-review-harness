# Contract: 测试环境拓扑与 SSE 部署方案

> 日期: 2026-05-16
> 状态: completed
> 类型: Platform Task
> 版本: v1.4.9

## 背景

系统核心交互之一是 SSE 流式评审。当前代码已对 `text/event-stream`、`X-Accel-Buffering: no`、长时评审超时等做了处理，但测试环境如果接入 Nginx、网关或进程管理后，仍可能因为缓冲、读超时、连接复用、断连恢复等问题导致“页面可用但评审中断”。

因此需要单独输出测试环境拓扑方案，明确前端、后端、反向代理、进程管理和外部依赖的边界。

## 范围

### 改动对象

- 测试环境部署文档
- 反向代理示例配置
- 进程管理配置示例
- 如确有必要，再补充服务端 keepalive / timeout 配置

### 目标行为

1. 明确前端静态资源、后端 API、SSE 长连接的访问路径
2. 明确 Nginx / 网关在 SSE 场景下的关键配置项
3. 明确进程管理方式（如 PM2 / systemd）的职责和日志位置
4. 明确 GitLab / LLM / 蓝湖等外部服务在网络层的连通性要求

## 不做

- 不在本 Contract 内实现生产级高可用
- 不在本 Contract 内改造业务层断点恢复协议
- 不在本 Contract 内设计多实例共享状态

## 验收标准

- [ ] 有明确的测试环境部署拓扑图或文字方案
- [ ] SSE 相关反代配置完整
- [ ] 进程管理与日志定位方式明确
- [ ] 可解释“页面正常但评审失败/中断”时的排查路径

## 架构确认（2026-05-16）

### 对象

- **前端静态资源**：`dist/client`
- **后端服务**：`dist/server/index.js`
- **反向代理**：Nginx（或同类网关）
- **进程守护**：systemd / PM2（二选一）
- **外部依赖**：GitLab、LLM Provider、蓝湖 API

### 访问拓扑

```
浏览器
  ↓
Nginx :80/:443
  ├─ / → 静态资源 / SPA fallback
  └─ /api → Node 应用 :3006(或配置端口)
            ├─ SSE 长连接
            ├─ GitLab API
            └─ LLM Provider
```

### 设计决策

1. 测试环境前端与 API 走同域，避免额外 CORS 和 cookie 问题
2. SSE 连接必须由 Nginx 放行，禁止缓冲与过短超时
3. 进程守护只负责拉起 `npm run start`，不承担业务逻辑
4. 日志按“网关日志 / 应用日志 / 数据同步日志”三层定位

### 推荐反代要点

- `proxy_http_version 1.1`
- `proxy_set_header Connection ""`
- `proxy_buffering off`
- `proxy_read_timeout 3600`
- `proxy_send_timeout 3600`
- `add_header X-Accel-Buffering no`

### 边界

- 不在 G4 内做高可用集群
- 不在 G4 内做多实例共享状态
- 不在 G4 内改业务 SSE 协议

## 开发产出（2026-05-16）

- 新增部署手册：`docs/versions/v1.4.9/deployment.md`
- 文档明确：
  - 前后端同域拓扑
  - Nginx SSE 关键参数
  - `systemd` 进程守护模板
  - Node / Nginx / 数据同步三层排障入口

## Evaluator 评审（2026-05-16）

- [x] 有明确的测试环境部署拓扑图或文字方案
- [x] SSE 相关反代配置完整
- [x] 进程管理与日志定位方式明确
- [x] 可解释“页面正常但评审失败/中断”时的排查路径

评审结论：通过。满足 G4 Contract 验收标准，允许归档为 `completed`。
