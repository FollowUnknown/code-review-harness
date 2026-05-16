# v1.4.9: 稳定性收口 + 测试环境部署准备

> 状态: ✅ 完成
> 前置: v1.4.8
> 后置: v2.0.0
> 详细设计: [design.md](./design.md)

## 背景

在评估项目部署到测试环境服务器的可行性时，已确认当前系统具备基本运行骨架，但距离“可稳定部署、可持续维护、可重复验证”仍有一段差距，主要阻塞点包括：

- 服务端正式构建链路未闭环：`npm run build` 在 `build:server` 阶段失败，缺少 `tsconfig.server.json`
- 缺少明确的生产启动入口、进程管理约定和部署目录约定
- SQLite 持久化、路径、备份、迁移策略与当前数据库规范存在偏差
- 测试环境评审能力依赖 GitLab API、本地仓库映射、LLM Provider、SSE 长连接和反向代理配置，尚未形成统一部署方案

因此，v1.4.9 的目标不是直接扩展评审能力，而是将系统收口到“可上测试环境”的工程状态。

## 核心目标

1. **构建可交付** — 前后端产物、启动方式、目录结构明确，可在测试环境重复部署
2. **配置可治理** — 环境变量、密钥、外部依赖、端口与反向代理配置形成统一口径
3. **数据可维护** — SQLite 路径、备份、迁移、初始化和回滚策略明确，满足项目红线
4. **上线可验证** — 形成测试环境部署步骤、冒烟验证清单和故障排查入口

## G 列表

| # | 状态 | 描述 |
|---|------|------|
| G1 | completed | 服务端构建与启动链路闭环 |
| G2 | completed | 测试环境运行时配置与密钥治理 |
| G3 | completed | SQLite 持久化与 Migration 收口 |
| G4 | completed | 反向代理 / SSE / 进程管理部署方案 |
| G5 | completed | 冒烟验证与测试环境上线检查清单 |

## 非目标

- 不在本版本引入 MySQL 替换 SQLite
- 不在本版本扩展新的评审业务功能
- 不做生产环境高可用、多租户、容灾设计
- 不在未确认 Contract 前直接修改 `src/` 实现

## 验收标准

- [x] `npm run build` 可稳定产出前后端部署产物
- [x] 有明确的测试环境启动方式（脚本或进程管理配置）
- [x] 环境变量、密钥、外部依赖清单完整，且与代码实现一致
- [x] 数据库路径、备份、迁移、初始化流程可执行且满足数据库红线
- [x] 有可执行的测试环境部署文档与冒烟清单

## 当前实现口径（G1/G2）

### 构建与启动

- 构建命令：`npm run build`
- 服务启动命令：`npm run start`
- 测试环境前端访问入口：与后端同端口同域暴露（默认 `http://<host>:3001/`，若接 Nginx 则走 `80/443`）
- 前端产物目录：`dist/client`
- 服务端产物入口：`dist/server/index.js`
- 静态资源路径：服务端按 `__dirname` 解析 `dist/client`，不再依赖从项目根目录启动

## 当前实现口径（G4/G5）

- 部署手册：`docs/versions/v1.4.9/deployment.md`
- 测试场景：`docs/versions/v1.4.9/smoke-checklist.md`
- 推荐测试环境形态：Nginx 反代 `Node(dist)` 单进程，SSE 经 `/api/*` 透传
- 推荐守护方式：`systemd`

### 测试环境最小配置

- 必填：`PORT`、`LLM_PROVIDER`、对应 provider 的 API key、`GITLAB_TOKEN`
- 推荐：`REVIEW_TIMEOUT_MINUTES`、`KNOWLEDGE_DB_PATH`
- 可选：`GITLAB_HOST`、`LANHU_TOKEN`、`LANHU_BASE_URL`
- 运行期可编辑项：LLM provider / model / base URL 可通过 `settings` 表覆盖

## 关键风险

- **高风险路径**：数据库、配置、密钥、权限、SSE 长连接，必须分 Contract 审查
- **路径依赖**：当前部分逻辑依赖 `process.cwd()`，部署目录不固定时容易失效
- **外部依赖**：GitLab、LLM Provider、蓝湖等连通性不足会导致“页面可开、评审不可用”

## 关联 Contract

- [2026-05-14-default-redirect-requirement-review.md](../../contracts/2026-05-14-default-redirect-requirement-review.md)
- [2026-05-14-port-conflict-detection.md](../../contracts/2026-05-14-port-conflict-detection.md)
- [2026-05-14-port-auto-increment.md](../../contracts/2026-05-14-port-auto-increment.md)
- [2026-05-14-sse-visibility-keepalive.md](../../contracts/2026-05-14-sse-visibility-keepalive.md)
- [2026-05-16-test-env-build-startup.md](../../contracts/2026-05-16-test-env-build-startup.md)
- [2026-05-16-test-env-runtime-config.md](../../contracts/2026-05-16-test-env-runtime-config.md)
- [2026-05-16-test-env-data-persistence.md](../../contracts/2026-05-16-test-env-data-persistence.md)
- [2026-05-16-test-env-topology-sse.md](../../contracts/2026-05-16-test-env-topology-sse.md)
- [2026-05-16-test-env-smoke-checklist.md](../../contracts/2026-05-16-test-env-smoke-checklist.md)
