# Harness Memory 分层系统

> Phase 4: Memory Superpower（Harness 侧）
> 与 v1.2.0 Knowledge 系统完全独立，不桥接。

## 目录结构

- `session/` — 每日会话记忆（1d TTL）
- `task/` — Run 级记忆，一个 run 一个文件（7d TTL）
- `project/` — 聚合后的项目级记忆（30d TTL）
- `archive/` — 过期记忆归档（永久保留）
- `schemas/` — JSON Schema 定义
- `index.json` — 全局索引
- `stats.json` — 统计数据

## 记忆升级路径

```
session (1d) → 归档
task (7d) → hitCount≥3 且 ≥1d → project，否则归档
project (30d) → 命中续命，未命中归档
```

## 写入规则

AI 按 CLAUDE.md 规则 4 执行写入和召回，不通过代码写入。
