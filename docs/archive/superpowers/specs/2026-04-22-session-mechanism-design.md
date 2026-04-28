# AI 会话机制设计

> 日期：2026-04-22
> 状态：已批准

---

## 目的

为 codeReview 项目搭建 AI 会话机制，实现：

1. **记录每天的会话内容** — 讨论过程、技术决策、产出物
2. **记录会话中产生的任务清单** — 新增/进行中/已完成，支持跨天追踪

设计原则：AI 自动生成，关键节点实时写入，对话结束时总结。

---

## 文件结构

```
docs/
├── sessions/                        ← 会话记录目录
│   ├── active-tasks.md             ← 跨天活跃任务聚合索引
│   ├── YYYY-MM-DD.md               ← 每天一个会话文件（含当天任务）
│   └── ...
├── architecture/                    ← 已有，不变
├── product/
├── plans/
└── standards/
```

### 会话文件模板 (`sessions/YYYY-MM-DD.md`)

```markdown
# YYYY-MM-DD 会话

## 今日目标
<!-- AI 从 active-tasks.md 读取待办，填写这里 -->

## 会话记录
<!-- 关键节点实时追加 -->

### HH:MM - [事件标题]
- 做了什么
- 决策/结论
- 产出文件

## 任务清单
### 新增
- [ ] TASK-001: 描述 (P0)

### 进行中
- [ ] TASK-002: 描述 (P1, 来自 2026-04-21)

### 已完成
- [x] TASK-003: 描述

## 今日总结
<!-- 对话结束时 AI 自动生成 -->
- 完成了什么
- 未完成/待跟进
- 新产生的任务（已同步到 active-tasks.md）
```

### 任务聚合文件 (`sessions/active-tasks.md`)

```markdown
# 活跃任务汇总

> 从各 session 文件聚合。AI 每次对话只读本文件了解当前待办。

## 按优先级
- [ ] P0: TASK-001 - 描述 (来源: 2026-04-22)
- [ ] P1: TASK-002 - 描述 (来源: 2026-04-21)

## 已归档
<!-- 完成的任务定期清理，来源 session 文件中仍保留记录 -->
```

---

## 自动化机制

### CLAUDE.md 规则（AI 自律）

在 CLAUDE.md 中新增"会话机制"区块，定义三条规则：

**规则 1：对话开始时**
- 读取 `docs/sessions/active-tasks.md`（了解当前待办）
- 读取 `docs/sessions/YYYY-MM-DD.md`（当天文件，如存在）
- 当天文件不存在时，基于模板创建，从 active-tasks.md 填写"今日目标"

**规则 2：关键节点实时写入**
触发条件（满足任一即写入）：
- 写了/改了代码
- 做出了技术决策
- 产生了新任务或完成任务
- 发现了隐性约定

写入动作：在当天 session 的"会话记录"区块追加一条，同步更新 active-tasks.md

**规则 3：对话结束时**
- 生成"今日总结"
- 新产生的任务同步到 active-tasks.md
- 已完成的任务从 active-tasks.md 移除（标记归档）

### Hooks 保底

在 `.claude/settings.local.json` 配置 Stop hook：
- 检查当天 session 文件是否存在且有"今日总结"
- 缺失时提醒 AI 补写（不阻断）

### 上下文控制

- AI 只读取**当天** session 文件 + `active-tasks.md`
- 历史会话文件不自动读入上下文
- 需要查历史时用 grep 按需检索

---

## 与现有系统集成

### 迁移

将 `docs/plans/session-log.md` 的内容拆分到：
- `docs/sessions/2026-04-21.md`（4月21日会话）
- `docs/sessions/2026-04-22.md`（4月22日会话）

迁移后删除 `docs/plans/session-log.md`（或标记 deprecated）。

### 文件改动清单

| 文件 | 改动 |
|------|------|
| `CLAUDE.md` | 新增"会话机制"区块（三条规则） |
| `.claude/settings.local.json` | 新增 Stop hook |
| `docs/sessions/active-tasks.md` | 新建 |
| `docs/sessions/2026-04-21.md` | 从 session-log.md 迁移 |
| `docs/sessions/2026-04-22.md` | 从 session-log.md 迁移 |
| `docs/plans/session-log.md` | 删除或标记 deprecated |

### 不改动的部分

`docs/architecture/`、`docs/product/`、`docs/standards/` 保持不变。

---

## 范围边界

本设计只覆盖"会话记录 + 任务管理"机制。以下不在范围内：
- Phase 0 的三个未交付项（三代理角色、评审标准、Sprint Contract）
- 代码评审功能本身
- 多代理协作架构
