# Contract: 测试环境 SQLite 持久化与 Migration 收口

> 日期: 2026-05-16
> 状态: completed
> 类型: Platform Task
> 版本: v1.4.9

## 背景

当前项目默认使用 SQLite，`knowledge.db` 为核心持久化介质。代码已通过 `KNOWLEDGE_DB_PATH` 规避对 `cwd` 的硬依赖，但数据库初始化与迁移主要仍在 `src/server/db.ts` 中完成，与 `docs/standards/database.md` 中“Migration 文件化、版本化、可重入”的规范尚未完全对齐。

测试环境如果没有明确的数据目录、备份策略、迁移执行策略和回滚方式，后续升级风险很高。

新增约束（2026-05-16 用户补充）：

- **测试环境数据必须与当前本地数据一致**
- 当前本地数据库视为测试环境初始化基线，后续部署阶段需要明确“复制哪份文件、何时复制、如何校验一致性、如何回滚”

## 范围

### 改动对象

- `src/server/db.ts`
- `src/server/migrations/`（如需建立）
- `docs/standards/database.md`
- 测试环境部署文档中的数据持久化章节

### 目标行为

1. 明确测试环境 SQLite 文件路径、权限、备份和恢复方式
2. 明确 WAL / SHM 文件的部署与备份要求
3. 将 DB 结构变更收口到符合红线的 Migration 机制
4. 明确首次初始化、增量升级、失败回滚的执行步骤
5. 明确“测试环境与当前本地数据库保持一致”的复制与校验流程

## 不做

- 不在本 Contract 内切换到 MySQL
- 不在本 Contract 内删除旧数据文件或做破坏性 SQL
- 不在本 Contract 内扩展新的业务表

## 验收标准

- [ ] 测试环境数据库路径不依赖 `cwd`
- [ ] 数据目录、备份、恢复、回滚方式有明确说明
- [ ] DB 结构变更策略符合 Migration 红线
- [ ] SQL / 数据路径相关改动经过专项审查
- [ ] 当前本地数据库作为测试环境基线的复制与一致性校验流程明确

## 架构确认（2026-05-16）

### 对象

- **基线数据源**：当前本地 `knowledge.db`（以及对应 `knowledge.db-wal` / `knowledge.db-shm`）
- **运行路径**：`KNOWLEDGE_DB_PATH` 显式指定，禁止依赖 `cwd`
- **迁移入口**：启动时执行 Migration Runner（幂等）
- **一致性校验**：基线 DB 指纹 + 行数抽样 + 表结构版本校验

### 状态流

```
本地基线库确认
   ↓
生成备份与指纹
   ↓
复制到测试环境目标路径
   ↓
设置 KNOWLEDGE_DB_PATH 启动服务
   ↓
Migration 幂等执行
   ↓
一致性校验与回滚判断
```

### 设计决策

1. 测试环境初始化以“复制本地基线库”为第一优先，不做空库重建
2. 复制时按 SQLite 实践一起处理 `db + wal + shm`，并在复制前做一次完整 checkpoint（避免 WAL 丢增量）
3. Migration 机制采用文件化顺序执行，执行记录写入 `schema_version`，重复执行不报错
4. 任一迁移失败后，必须可回滚到复制前备份快照

### 边界

- 不在 G3 引入 MySQL
- 不在 G3 扩展业务新表
- 不在 G3 处理 Nginx / PM2 / SSE

## 开发结果（2026-05-16）

- 新增文件化 Migration 机制：
  - `src/server/migration-runner.ts`
  - `src/server/migrations/001_schema_version.sql`
  - `src/server/migrations/002_llm_logs_provider_model_index.sql`
- `src/server/db.ts` 在 `initialize()` 入口增加 `runMigrations(db)`，并保留原有历史迁移逻辑兼容现网数据
- 新增测试环境数据库同步脚本：
  - `scripts/sync-test-env-db.ts`
  - `package.json` 增加 `db:sync-test-env` 命令
- `env.example` 增加 `SOURCE_DB_PATH` / `TARGET_DB_PATH`
- `docs/standards/database.md` 补充“测试环境数据基线”规范（checkpoint、db/wal/shm、指纹、回滚）
- 根据评审反馈补充：
  - `build:server` 后自动复制 `src/server/migrations/*.sql` 到 `dist/server/migrations`
  - migration runner 增加 `dist` 优先、源码目录兜底的查找策略
  - 同步脚本指纹改为记录真实 `sourceDb` / `targetDb`
  - 同步脚本覆盖前自动备份目标库到 `dist/backups/<timestamp>/`
  - 指纹补充 `schemaVersions`

## 验证结果

- [x] `npm run build` 成功
- [x] `npm run typecheck` 成功
- [x] `SOURCE_DB_PATH=./knowledge.db TARGET_DB_PATH=./dist/test-env-knowledge.db npm run db:sync-test-env` 成功
- [x] 同步脚本输出关键表行数指纹，证明“本地基线库复制 + 一致性校验”链路可用
- [x] 再次执行同步脚本时生成目标库备份，证明覆盖前备份闭环成立
- [x] `dist/server/migrations` 已包含 SQL migration 文件
- [x] 基于新构建的 `dist` 产物启动 `3010` 端口实例后，`POST /api/llm/settings/llm/check` 返回 `ok: true`

## 评审结论

- G3 通过
