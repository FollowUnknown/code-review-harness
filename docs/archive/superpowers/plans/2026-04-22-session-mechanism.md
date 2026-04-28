# AI 会话机制实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 AI 会话记录和任务管理机制，实现每天自动记录会话内容、追踪任务清单。

**Architecture:** 纯文档 + 配置变更。创建 `docs/sessions/` 目录存放每日会话文件和活跃任务汇总，更新 CLAUDE.md 定义 AI 读写规则，添加 Stop hook 做保底提醒。

**Tech Stack:** Markdown 文件、Claude Code hooks (shell)、git

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 创建 | `docs/sessions/active-tasks.md` | 跨天活跃任务聚合索引 |
| 创建 | `docs/sessions/2026-04-21.md` | 4月21日会话（从 session-log 迁移） |
| 创建 | `docs/sessions/2026-04-22.md` | 4月22日会话（从 session-log 迁移） |
| 修改 | `CLAUDE.md` | 新增"会话机制"区块 |
| 修改 | `.claude/settings.local.json` | 新增 Stop hook |
| 删除 | `docs/plans/session-log.md` | 已迁移至 sessions/ |

---

### Task 1: 创建 active-tasks.md

**Files:**
- Create: `docs/sessions/active-tasks.md`

- [ ] **Step 1: 创建目录和文件**

创建 `docs/sessions/` 目录，写入 `active-tasks.md`：

```markdown
# 活跃任务汇总

> 从各 session 文件聚合。AI 每次对话只读本文件了解当前待办。

## 按优先级

### P0 — 紧急
（暂无）

### P1 — 重要
- [ ] TASK-Phase0-1: 定义三代理角色文件 docs/architecture/agents.md (来源: 2026-04-22)
- [ ] TASK-Phase0-2: 评审标准具体化 docs/standards/review-criteria.md (来源: 2026-04-22)
- [ ] TASK-Phase0-3: Sprint Contract 模板 docs/templates/sprint-contract.md (来源: 2026-04-22)

### P2 — 一般
（暂无）

## 已归档

<!-- 完成的任务定期清理，来源 session 文件中仍保留记录 -->
```

- [ ] **Step 2: 提交**

```bash
git add docs/sessions/active-tasks.md
git commit -m "feat(sessions): create active-tasks.md aggregation file"
```

---

### Task 2: 迁移 2026-04-21 会话

**Files:**
- Create: `docs/sessions/2026-04-21.md`

- [ ] **Step 1: 创建 4月21日会话文件**

从 `docs/plans/session-log.md` 中提取 4月21日的内容，写入新格式：

```markdown
# 2026-04-21 会话

## 今日目标
- 搭建项目骨架（CLAUDE.md / docs/ / settings.local.json）
- 创建 GitHub 仓库并推送

## 会话记录

### 项目结构搭建
- 完成三层防护机制：软约束（CLAUDE.md）、硬护栏（settings.local.json）、知识沉淀（docs/）
- 建立 docs/ 知识目录结构：architecture/、product/、standards/
- CLAUDE.md 写入红线 + 自检清单

### GitHub 仓库创建
- 推送至 git@github.com:FollowUnknown/code-review-harness.git
- SSH 密钥配置（ed25519, 2729038342@qq.com）+ HTTP 代理（127.0.0.1:6789）

## 任务清单

### 已完成
- [x] TASK-001: 项目结构搭建 (CLAUDE.md / docs/ / settings.local.json)
- [x] TASK-002: GitHub 仓库创建并推送

## 今日总结
- 完成了项目骨架搭建和 GitHub 仓库初始化
- 三层防护机制（软约束 / 硬护栏 / 知识沉淀）已就位
```

- [ ] **Step 2: 提交**

```bash
git add docs/sessions/2026-04-21.md
git commit -m "feat(sessions): migrate 2026-04-21 session from session-log"
```

---

### Task 3: 迁移 2026-04-22 会话

**Files:**
- Create: `docs/sessions/2026-04-22.md`

- [ ] **Step 1: 创建 4月22日会话文件**

从 `docs/plans/session-log.md` 中提取 4月22日的内容，写入新格式：

```markdown
# 2026-04-22 会话

## 今日目标
- 推送代码到 GitHub
- 阅读 Anthropic harness 设计文章
- 基于文章生成自我迭代计划

## 会话记录

### 代码推送
- 推送代码到 GitHub（SSH 方式）

### Anthropic 文章研读
- 阅读 "Harness Design for Long-Running Application Development"
- 提取 7 个核心概念并映射到 codeReview 项目：
  - Generator-Evaluator 分离
  - Planner 扩展 spec
  - Sprint Contract
  - Grading Criteria
  - Context Reset
  - 文件通信
  - 渐进简化

### 自我迭代计划
- 制定 Phase 0→3 升级路线图
- 识别 Phase 0 三个未交付项

### 会话机制设计
- 完成 AI 会话机制设计（session + task 分离）
- 设计 spec 写入 docs/superpowers/specs/2026-04-22-session-mechanism-design.md
- 设计已批准，开始实现

## 任务清单

### 已完成
- [x] TASK-003: 推送代码到 GitHub
- [x] TASK-004: 阅读 Anthropic harness 文章
- [x] TASK-005: 生成自我迭代计划
- [x] TASK-006: 完成 AI 会话机制设计

### 新增（待后续完成）
- [ ] TASK-Phase0-1: 定义三代理角色文件 docs/architecture/agents.md (P1)
- [ ] TASK-Phase0-2: 评审标准具体化 docs/standards/review-criteria.md (P1)
- [ ] TASK-Phase0-3: Sprint Contract 模板 docs/templates/sprint-contract.md (P1)

## 今日总结
- 完成 harness 文章研读和自我迭代计划制定
- 完成 AI 会话机制设计并获批准
- Phase 0 三个未交付项已记录到 active-tasks.md
```

- [ ] **Step 2: 提交**

```bash
git add docs/sessions/2026-04-22.md
git commit -m "feat(sessions): migrate 2026-04-22 session from session-log"
```

---

### Task 4: 删除旧 session-log.md

**Files:**
- Delete: `docs/plans/session-log.md`

- [ ] **Step 1: 删除文件**

```bash
git rm docs/plans/session-log.md
```

- [ ] **Step 2: 提交**

```bash
git commit -m "chore: remove old session-log.md (migrated to docs/sessions/)"
```

---

### Task 5: 更新 CLAUDE.md 新增会话机制规则

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 在"知识组织"区块之前插入会话机制区块**

在 `## 知识组织` 之前插入以下内容：

```markdown
---

## 会话机制

AI 每次对话自动遵循以下规则，记录会话内容和任务清单。

**规则 1：对话开始时**
1. 读取 `docs/sessions/active-tasks.md`（了解当前待办）
2. 读取 `docs/sessions/YYYY-MM-DD.md`（当天文件，如存在）
3. 当天文件不存在时，基于模板创建，从 active-tasks.md 填写"今日目标"

**规则 2：关键节点实时写入**
满足以下任一条件时，在当天 session 的"会话记录"区块追加一条，同步更新 active-tasks.md：
- 写了/改了代码
- 做出了技术决策
- 产生了新任务或完成任务
- 发现了隐性约定

**规则 3：对话结束时**
1. 生成"今日总结"
2. 新产生的任务同步到 active-tasks.md
3. 已完成的任务从 active-tasks.md 移除（标记归档）

**上下文控制：只读当天 session + active-tasks.md。历史文件按需 grep。**

### 会话文件模板

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
- [ ] TASK-NNN: 描述 (P0/P1/P2)

### 进行中
- [ ] TASK-NNN: 描述 (Pn, 来自 YYYY-MM-DD)

### 已完成
- [x] TASK-NNN: 描述

## 今日总结
<!-- 对话结束时 AI 自动生成 -->
- 完成了什么
- 未完成/待跟进
- 新产生的任务（已同步到 active-tasks.md）
```
```

- [ ] **Step 2: 更新"知识组织"中的目录结构图**

将目录图更新为包含 sessions/：

```
docs/
├── sessions/
│   ├── active-tasks.md      # 跨天活跃任务汇总
│   └── YYYY-MM-DD.md        # 每日会话记录
├── architecture/
│   ├── index.md              # 项目架构总览
│   └── implicit-contracts.md # 隐性业务约定
├── product/
│   └── index.md              # 产品规则
└── standards/
    ├── testing.md             # 测试规范
    └── database.md            # 数据库规范
```

- [ ] **Step 3: 提交**

```bash
git add CLAUDE.md
git commit -m "feat(sessions): add session mechanism rules to CLAUDE.md"
```

---

### Task 6: 添加 Stop hook

**Files:**
- Modify: `.claude/settings.local.json`

- [ ] **Step 1: 在 settings.local.json 中添加 Stop hook**

在现有 `permissions` 同级添加 `hooks` 配置。Stop hook 用 shell 脚本检查当天 session 文件是否存在且有总结区块，输出提醒信息：

```json
{
  "permissions": {
    "deny": [
      "Bash(rm -rf*)",
      "Bash(kubectl*)",
      "Bash(terraform*)",
      "Bash(helm*)",
      "Edit(**/.env*)",
      "Edit(**/*secret*)",
      "Edit(**/*credential*)",
      "Edit(**/*-prod.yml)",
      "Edit(**/*-prod.yaml)",
      "Edit(**/*-production.yml)"
    ],
    "allow": [
      "Bash(git status*)",
      "Bash(git diff*)",
      "Bash(git log*)",
      "Bash(ls*)",
      "Bash(cat*)",
      "Bash(git push*)",
      "Bash(mkdir*)"
    ]
  },
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "TODAY=$(date +%Y-%m-%d); FILE=\"docs/sessions/${TODAY}.md\"; if [ -f \"$FILE\" ]; then if ! grep -q '## 今日总结' \"$FILE\" || ! grep -A 1 '## 今日总结' \"$FILE\" | grep -qv '^--$' | grep -q '.'; then echo \"⚠️  今日会话文件 $FILE 缺少总结区块，请补写\"; fi; else echo \"⚠️  今日会话文件 $FILE 不存在，请创建\"; fi"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: 测试 hook 脚本**

```bash
# 模拟 hook 执行，验证脚本语法正确
TODAY=$(date +%Y-%m-%d); FILE="docs/sessions/${TODAY}.md"; if [ -f "$FILE" ]; then echo "Session file exists for $TODAY"; else echo "No session file for $TODAY (expected - first run)"; fi
```

Expected: 输出 "No session file for 2026-04-22 (expected - first run)" 或类似信息

- [ ] **Step 3: 提交**

```bash
git add .claude/settings.local.json
git commit -m "feat(sessions): add Stop hook for session summary reminder"
```

---

### Task 7: 最终验证

- [ ] **Step 1: 验证文件结构完整**

```bash
ls -la docs/sessions/
```

Expected: 看到 `active-tasks.md`、`2026-04-21.md`、`2026-04-22.md`

- [ ] **Step 2: 验证 CLAUDE.md 包含会话机制区块**

```bash
grep -A 5 "## 会话机制" CLAUDE.md
```

Expected: 显示三条规则

- [ ] **Step 3: 验证旧文件已删除**

```bash
ls docs/plans/session-log.md 2>&1
```

Expected: "No such file or directory"

- [ ] **Step 4: 验证 git 状态干净**

```bash
git status
```

Expected: nothing to commit, working tree clean
