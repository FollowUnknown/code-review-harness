# 数据库规范

## 选型

- **V1**: SQLite（单用户本地开发）
- **V2**: MySQL 8+（统一开发/线上）

## 红线

- 批量更新/删除必须有 WHERE 条件
- DDL 变更必须走 migration 文件，不允许手动改表
- SQL 参数必须使用占位符 `?`，禁止字符串拼接
- 密码字段必须存 bcrypt 哈希，禁止明文

## Migration 规范

```
src/server/migrations/
├── 001_init_entries.sql
├── 002_init_reviews.sql
├── ...
```

- 文件名：`NNN_描述.sql`，三位数字序号
- 每个 migration 必须幂等（用 IF NOT EXISTS 等）
- `schema_version` 表记录已执行的版本
- 启动时自动检测并执行未执行的 migration

## 测试环境数据基线

- 测试环境初始化默认以当前本地 `knowledge.db` 作为基线，而不是空库重建
- 复制前必须先做 WAL checkpoint，确保 `knowledge.db-wal` 中的增量已落盘
- 复制时必须同时考虑：
  - `knowledge.db`
  - `knowledge.db-wal`
  - `knowledge.db-shm`
- 复制后必须生成指纹文件，至少记录：
  - DB 文件大小
  - WAL / SHM 文件大小
  - 关键表行数
  - `schema_version` 状态
- 任何 migration 执行前必须先备份测试环境目标库，失败可直接回滚

## 表命名规范

- 表名：蛇形小写 `review_plans`
- 字段名：蛇形小写 `created_by`
- 主键：`id VARCHAR(36)` (UUID)
- 时间字段：`created_at`, `updated_at`
- 外键字段：`plan_id`, `created_by`

## 字段类型约定

| 用途 | 类型 |
|------|------|
| UUID | VARCHAR(36) |
| URL | VARCHAR(500) |
| 名称/标题 | VARCHAR(128-255) |
| JSON 数据 | TEXT |
| 状态枚举 | ENUM(...) |
| 时间 | DATETIME |
| 布尔 | BOOLEAN |
| 分数 | DECIMAL(3,2) |
