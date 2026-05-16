# v1.4.9 详细设计 -- 稳定性收口 + 测试环境部署准备

> 状态: draft
> 作者: planner agent
> 日期: 2026-05-16
> 前置: v1.4.8

---

## 目录

1. [议题 1: 构建与启动链路（G1）](#议题-1-构建与启动链路g1)
2. [议题 2: 运行时配置与密钥治理（G2）](#议题-2-运行时配置与密钥治理g2)
3. [议题 3: SQLite 持久化与 Migration 收口（G3）](#议题-3-sqlite-持久化与-migration-收口g3)
4. [议题 4: 测试环境拓扑与 SSE（G4）](#议题-4-测试环境拓扑与-sseg4)
5. [议题 5: 上线冒烟与回归清单（G5）](#议题-5-上线冒烟与回归清单g5)
6. [对象与边界汇总](#对象与边界汇总)
7. [实施顺序建议](#实施顺序建议)
8. [开放问题](#开放问题)

---

## 议题 1: 构建与启动链路（G1）

### 1.1 现状

当前仓库的运行方式明显偏向本地开发：

- `npm run dev` = `tsx watch src/server/index.ts` + `vite --host`
- 前端构建可成功产出 `dist/client`
- 服务端构建命令依赖 `tsconfig.server.json`，但文件缺失，导致 `npm run build` 失败
- `package.json` 中没有测试环境可直接使用的 `start` 命令

现状问题不是“能不能本地跑”，而是“能不能稳定地产出一份可部署包”。

### 1.2 目标

G1 要解决的是三件事：

1. 构建命令成功
2. 部署产物边界清晰
3. 启动入口明确

### 1.3 对象模型

| 对象 | 职责 | 当前状态 | 目标状态 |
|------|------|----------|----------|
| `build` | 一次性产出测试环境可用文件 | 前端成功，服务端失败 | 前后端都成功 |
| `dist/client` | SPA 静态资源 | 已存在 | 保持 |
| `dist/server` | Node 可执行服务端产物 | 缺失 | 新增/恢复 |
| `start` | 测试环境运行入口 | 缺失 | 明确存在 |

### 1.4 方案设计

#### 方案 A：补齐 `tsconfig.server.json`，保留当前双构建结构

```
npm run build
  ├─ vite build     → dist/client
  └─ tsc -p ...     → dist/server

npm run start
  └─ node dist/server/index.js
```

这是与当前仓库结构最一致、侵入性最小的方案。

#### 方案 B：引入新的 bundler 打包服务端

例如改用 `tsup` / `esbuild` 一类方案统一输出服务端。

这能简化产物，但属于额外技术选型，超出当前“先收口测试环境”的最小必要变更。

**本轮倾向：优先方案 A。**

### 1.5 启动路径约定

测试环境约定：

- 构建工作目录：项目根目录
- 服务启动目录：项目根目录
- Express 继续从统一位置提供 `dist/client`

这意味着实现阶段必须明确两种可能：

1. **保留 `process.cwd()` 假设**：则部署文档必须要求从项目根目录启动
2. **消除 `process.cwd()` 假设**：则服务端需改用相对产物路径定位静态目录

本轮先不做实现选择，但要在 G1 中把这个判断落地。

### 1.6 与其他议题的边界

- 不处理 `.env` 内容：交给 G2
- 不处理 SQLite 路径：交给 G3
- 不处理 PM2 / Nginx：交给 G4

---

## 议题 2: 运行时配置与密钥治理（G2）

### 2.1 现状

当前代码中的配置来源分散在三层：

1. 代码内默认值
2. 环境变量
3. `settings` 表中的运行期配置

典型例子：

- LLM provider / model / baseUrl：`settings` 表优先，环境变量次之，代码默认值兜底
- GitLab token：请求体传入或环境变量
- `PORT`：环境变量或代码默认值
- 蓝湖：仅环境变量

当前 `env.example` 只列出少量变量，无法覆盖测试环境部署需求。

### 2.2 目标

G2 要输出的是“部署配置契约”，不是简单补几个环境变量。

目标包括：

1. 哪些变量是必填
2. 哪些变量有默认值
3. 哪些可以运行后在 UI/DB 中调整
4. 缺失时系统会退化成什么行为

### 2.3 配置分层模型

```
代码默认值
  适用于开发期兜底，不作为测试环境主配置
      ↓
环境变量
  测试环境主配置来源
      ↓
DB settings
  仅用于运行期可变项（如 provider/model/baseUrl）
```

### 2.4 配置分类

#### A. 启动级配置

| 变量 | 用途 | 来源优先级 |
|------|------|-----------|
| `PORT` | 后端监听端口 | env > code default |
| `REVIEW_TIMEOUT_MINUTES` | 长评审超时 | env > code default |

#### B. GitLab 配置

| 变量 | 用途 | 来源优先级 |
|------|------|-----------|
| `GITLAB_HOST` | 默认 GitLab host 文档模板 | env / 文档使用 |
| `GITLAB_TOKEN` | 服务端访问 GitLab API | env 优先，请求体补充 |

#### C. LLM 配置

| 变量 | 用途 | 来源优先级 |
|------|------|-----------|
| `LLM_PROVIDER` | 选择 provider | DB settings > env > default |
| `ANTHROPIC_AUTH_TOKEN` | Anthropic 兼容 token | DB settings > env |
| `ANTHROPIC_BASE_URL` | Anthropic 兼容 base URL | DB settings > env > default |
| `ANTHROPIC_MODEL` | Anthropic 兼容模型名 | DB settings > env > default |
| `DEEPSEEK_API_KEY` | DeepSeek token | DB settings > env |

#### D. 扩展集成配置

| 变量 | 用途 | 来源优先级 |
|------|------|-----------|
| `LANHU_TOKEN` | 蓝湖 API 调用 | env |
| `LANHU_BASE_URL` | 蓝湖 API 地址 | env > default |

### 2.5 密钥治理原则

1. 测试环境主路径必须使用环境变量注入密钥
2. 请求体传入 token 只作为补充能力，不能作为部署方案默认路径
3. `env.example` 中只能保留占位符，不得出现真实值
4. 要明确“哪些配置允许写入 DB settings，哪些不允许”

### 2.6 建议收口口径

#### 建议写入环境变量的配置

- `PORT`
- `REVIEW_TIMEOUT_MINUTES`
- `GITLAB_TOKEN`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_MODEL`
- `LLM_PROVIDER`
- `DEEPSEEK_API_KEY`
- `LANHU_TOKEN`
- `LANHU_BASE_URL`

#### 建议保留在运行期可编辑的配置

- LLM provider
- LLM model
- LLM base URL

#### 不建议通过 UI/DB 承担主责的配置

- `GITLAB_TOKEN`
- `LANHU_TOKEN`
- `PORT`

这些配置更适合作为部署环境级配置，而不是业务数据。

### 2.7 与其他议题的边界

- 不处理数据库迁移：交给 G3
- 不处理部署拓扑与反代：交给 G4
- 不处理启动脚本：交给 G1

---

## 议题 3: SQLite 持久化与 Migration 收口（G3）

### 3.1 现状

当前数据库演进逻辑主要集中在 `src/server/db.ts`：

- `initialize()` 中混合了 `CREATE TABLE IF NOT EXISTS`
- 多个 `migrateXxxTable()` / `ALTER TABLE` 散落在同一文件
- 没有 `schema_version` 作为统一执行记录
- 测试环境如何与当前本地数据库保持一致，还没有脚本化流程

### 3.2 目标

G3 的目标不是一次性重写全部历史迁移，而是先建立**后续可持续演进**的收口层：

1. 引入文件化 Migration Runner
2. 建立 `schema_version`
3. 保持对现有本地数据库兼容
4. 补齐测试环境“以本地库为基线”的复制与校验流程

### 3.3 方案设计

#### A. 迁移执行模型

```
getDb()
  └─ runMigrations()
       ├─ ensure schema_version
       ├─ 按文件名顺序读取 src/server/migrations/*.sql
       ├─ 未执行过 → 执行 SQL
       └─ 写入 schema_version
```

#### B. 历史兼容策略

- 现有 `db.ts` 中的历史 `migrateXxxTable()` 先保留
- 新增结构变更优先走文件化 migration
- 后续逐步将旧逻辑迁出，而不是一次性大迁移

#### C. 测试环境数据一致性模型

```
本地 knowledge.db
  ├─ WAL checkpoint
  ├─ 复制 db/wal/shm
  ├─ 生成 fingerprint
  └─ 测试环境 KNOWLEDGE_DB_PATH 指向复制后的目标库
```

### 3.4 实施要点

- `KNOWLEDGE_DB_PATH` 继续作为唯一数据库路径入口
- 提供数据库同步脚本，而不是靠手工复制
- 指纹文件至少记录关键表行数与 `schema_version`
- migration 执行前先保留测试环境备份快照

---

## 议题 4: 测试环境拓扑与 SSE（G4）

### 4.1 现状

当前应用在本地开发环境里可以直接跑 `vite` + `tsx watch`，但测试环境一旦增加 Nginx / systemd / PM2，就会引入：

- 静态资源与 API 路径分离
- SSE 缓冲和超时问题
- 端口与进程管理分离
- 外部依赖连通性问题

### 4.2 目标

G4 关注的不是“让它更复杂”，而是“让它能在测试环境稳定跑起来”：

1. 前后端同域访问
2. SSE 长连接不被反代破坏
3. 进程守护职责单一
4. 排障路径明确

### 4.3 推荐拓扑

```
浏览器
  ↓
Nginx / 网关
  ├─ / 静态资源与 SPA fallback
  └─ /api → Node 应用
             ├─ 鉴权
             ├─ 业务 API
             └─ SSE 流式评审
```

### 4.4 反向代理关键点

| 项 | 建议 |
|----|------|
| 协议 | `proxy_http_version 1.1` |
| 连接头 | `proxy_set_header Connection ""` |
| 缓冲 | `proxy_buffering off` |
| 读超时 | `proxy_read_timeout 3600` |
| 写超时 | `proxy_send_timeout 3600` |
| SSE | `add_header X-Accel-Buffering no` |

### 4.5 进程管理

建议只选一种：

- `systemd`：适合单机测试环境，最简单
- `PM2`：适合需要快速重启和日志聚合的场景

共同要求：

- 守护对象是 `npm run start`
- 日志要能直接定位到应用 stdout/stderr
- 不把反向代理和应用进程混在一个启动脚本里

### 4.6 与其他议题的边界

- 不处理数据库复制：交给 G3
- 不处理部署检查清单：交给 G5
- 不做高可用和多实例

---

## 议题 5: 上线冒烟与回归清单（G5）

### 5.1 现状

目前已经具备：

- 构建链路
- 启动入口
- 配置模板
- 数据同步脚本
- 迁移收口

还缺的是一套“部署后必须按顺序打勾”的冒烟清单。

### 5.2 目标

1. 把首次上线流程固化
2. 把核心链路按顺序验证
3. 把失败排查入口写清楚
4. 把回滚动作预先写出来

### 5.3 冒烟顺序

1. 环境变量和端口
2. 前端首页
3. 登录与 token
4. 配置读取
5. 数据同步
6. LLM 连通
7. GitLab 连通
8. SSE 评审流
9. 暂停 / 恢复（如环境已接好）
10. 回滚验证

### 5.4 排障分层

| 问题 | 入口 |
|------|------|
| 页面打不开 | Nginx / 网关 |
| API 401 / 403 | 鉴权与 token |
| 评审卡住 | SSE / 超时 / 进程日志 |
| LLM 失败 | `/api/llm/settings/llm/check` |
| 数据不一致 | `db:sync-test-env` 指纹 + 备份目录 |

### 5.5 与其他议题的边界

- 不新增 CI
- 不替代人工验收
- 不修改核心业务逻辑

---

## 对象与边界汇总

| 议题 | 核心对象 | 本轮解决 | 留给后续 |
|------|----------|----------|----------|
| G1 | build/start/dist | 构建产物与启动入口 | 反向代理、进程守护 |
| G2 | env/config/secret | 配置契约与优先级 | 数据目录、网络拓扑 |
| G3 | db/migrations/baseline sync | 文件化迁移入口 + 基线同步流程 | 历史迁移彻底拆分 |
| G4 | nginx/systemd/PM2/SSE | 测试环境拓扑与长连接配置 | 高可用与多实例 |
| G5 | smoke checklist | 上线冒烟与回滚清单 | 自动化 CI |

---

## 实施顺序建议

1. 先实现 G1，拿到稳定构建结果
2. 再实现 G2，补齐测试环境配置模板
3. 再实现 G3，打通本地基线库同步和 migration
4. 然后执行 G4/G5 的部署前检查与上线清单

---

## 开放问题

1. 是否要求测试环境完全不依赖从请求体临时传 GitLab token？
2. LLM 配置是否允许测试环境管理员在 UI 中覆盖环境变量？
3. 服务端静态目录定位是继续依赖项目根目录启动，还是在本轮顺手收口掉 `cwd` 假设？
