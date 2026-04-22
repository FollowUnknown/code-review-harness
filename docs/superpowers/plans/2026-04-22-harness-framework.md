# Vibecoding Harness 框架实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建基于 Anthropic harness 方法论的通用框架，让 AI 能自动走完规划→TDD→审查→提交的四阶段流程。

**Architecture:** 三个独立 Agent（Planner/Generator/Evaluator）通过 Sprint Contract 通信，CLAUDE.md 做阶段编排调度。纯文档+配置变更，无运行时代码。

**Tech Stack:** Markdown、Claude Code agents、git

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `.claude/agents/planner.md` | Planner 角色规范：需求→Sprint Contract |
| 新建 | `.claude/agents/generator.md` | Generator 角色规范：Contract→代码+测试 |
| 新建 | `.claude/agents/evaluator.md` | Evaluator 角色规范：代码→评审报告 |
| 新建 | `docs/methodology.md` | Anthropic harness 方法论摘要 |
| 新建 | `docs/contracts/.gitkeep` | Sprint Contract 存储目录 |
| 修改 | `CLAUDE.md` | 新增" Harness 编排"区块 |

---

### Task 1: 创建 docs/methodology.md

**Files:**
- Create: `docs/methodology.md`

- [ ] **Step 1: 创建方法论文件**

写入 Anthropic harness 方法论摘要：

```markdown
# Harness 方法论

> 基于 Anthropic "Harness Design for Long-Running Application Development" 提炼。

---

## 核心原则

### 1. Generator-Evaluator 分离

生成代码和评审代码必须是不同角色。Generator 写代码，Evaluator 审代码。两者独立运行，通过文件（Sprint Contract）通信，不在同一上下文中。

### 2. Planner 扩展 Spec

Planner 将用户的简短需求（1-4 句话）扩展为完整的 Sprint Contract。Contract 聚焦高层设计和完成标准，不指定实现细节——实现是 Generator 的事。

### 3. Sprint Contract

每次需求动工前，Generator 和 Evaluator 必须约定"完成标准"。Contract 包含：范围、完成标准（Grading Criteria）、技术决策、风险评估、文件影响范围。Contract 状态：draft → confirmed → completed。

### 4. Grading Criteria

将主观质量判断转化为可评分的具体标准。每项 1-5 分，有明确的 5 分和 1 分描述。通过标准：所有维度 ≥ 3 分，安全维度 ≥ 4 分，无 CRITICAL 问题。

### 5. Context Reset

长任务中定期重置上下文，避免历史信息干扰。通过结构化文件交接状态，而非依赖上下文窗口。每个 Agent 只读取自己需要的输入文件。

### 6. 文件通信

Agent 之间通过文件交换状态，不用上下文传递。Planner 写 Contract 文件，Generator 读 Contract 写代码文件，Evaluator 读 Contract + 代码写评审报告。

### 7. 渐进简化

每个 harness 组件编码了"模型做不到"的假设。当模型能力提升后，逐个验证并移除不再需要的 scaffold 组件。

---

## 本项目的应用

| 方法论 | 本项目实现 |
|--------|-----------|
| Generator-Evaluator 分离 | `.claude/agents/generator.md` vs `.claude/agents/evaluator.md` |
| Planner 扩展 Spec | `.claude/agents/planner.md` |
| Sprint Contract | `docs/contracts/YYYY-MM-DD-<task>.md` |
| Grading Criteria | 8 项评分维度（见 Evaluator agent） |
| Context Reset | 每个 Agent 独立读取文件，不依赖上下文 |
| 文件通信 | Contract 是三个 Agent 的唯一通信协议 |
| 渐进简化 | Phase 0→3 升级路径（见 CLAUDE.md） |
```

- [ ] **Step 2: 提交**

```bash
git add docs/methodology.md
git commit -m "docs: add Anthropic harness methodology summary"
```

---

### Task 2: 创建 Planner Agent

**Files:**
- Create: `.claude/agents/planner.md`

- [ ] **Step 1: 创建 agents 目录**

```bash
mkdir -p .claude/agents
```

- [ ] **Step 2: 创建 Planner agent 文件**

```markdown
# Planner Agent

## 角色

你是 Planner，负责将用户的业务需求转化为可执行的 Sprint Contract。你不写代码，只做规划。

## 输入

用户的业务需求描述（自然语言），可能来自：
- 对话中的直接描述
- `task/` 目录下的需求文件
- `docs/sessions/active-tasks.md` 中的待办任务

## 输出

在 `docs/contracts/` 下创建 Sprint Contract 文件：`YYYY-MM-DD-<task-name>.md`

使用以下模板：

```markdown
# Sprint Contract: [需求标题]

> 创建时间: YYYY-MM-DD
> 状态: draft

## 需求描述
[用户原始需求]

## 范围定义
### 包含
- [列出所有包含的功能点]

### 不包含
- [明确列出不包含的内容，防止范围蔓延]

## 完成标准（Grading Criteria）
- [ ] [具体可验证的条件 1]
- [ ] [具体可验证的条件 2]
- [ ] 测试覆盖率 ≥ 80%
- [ ] 无 CRITICAL/HIGH 审查问题
- [ ] [安全相关标准，如有]

## 技术决策
- 选型: [技术栈/框架选择及理由]
- 架构: [架构方案及理由]

## 风险评估
| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| [风险描述] | [高/中/低] | [应对方案] |

## 文件影响范围
- 新建: [列出将创建的文件路径]
- 修改: [列出将修改的文件路径]
```

## 工作流程

1. 理解用户需求，必要时提问澄清
2. 分析技术可行性，确定技术选型
3. 识别风险和边界
4. 按 Grading Criteria 要求定义具体可验证的完成标准
5. 创建 Contract 文件
6. **停下来，向用户展示 Contract，等待确认**

## 核心约束

- **不写代码** — 你只做规划，不写任何实现代码
- **Grading Criteria 必须具体可验证** — 禁止"代码质量好"这类模糊标准，必须写明"函数 ≤ 50 行、覆盖率 ≥ 80%"等具体条件
- **必须标注文件影响范围** — 明确哪些文件会新建、哪些会修改，防止 Generator 越界
- **范围定义必须双向明确** — "包含"和"不包含"都要写清楚

## 停止条件

输出 Sprint Contract 后**立即暂停**，向用户展示完整的 Contract 内容，明确说：

> "Sprint Contract 已创建，请确认。确认后我将交给 Generator 开始开发。"

等用户回复"继续"或提出修改意见。
```

- [ ] **Step 3: 提交**

```bash
git add .claude/agents/planner.md
git commit -m "feat(harness): add Planner agent definition"
```

---

### Task 3: 创建 Generator Agent

**Files:**
- Create: `.claude/agents/generator.md`

- [ ] **Step 1: 创建 Generator agent 文件**

```markdown
# Generator Agent

## 角色

你是 Generator，负责基于 Sprint Contract 用 TDD 方式编写代码。你严格按照 RED→GREEN→IMPROVE 的顺序工作。

## 输入

已确认的 Sprint Contract 文件：`docs/contracts/YYYY-MM-DD-<task-name>.md`（状态为 confirmed）

## 输出

- 代码文件（按 Contract 的文件影响范围创建/修改）
- 测试文件（与代码对应的测试）

## TDD 工作流程

### RED — 先写测试

1. 从 Contract 中提取第一个 Grading Criterion
2. 为该功能编写失败的测试
3. 运行测试，确认测试**失败**
4. 如果测试没失败，说明测试写错了，重写

### GREEN — 最小实现

1. 编写**刚好让测试通过**的最小代码
2. 运行测试，确认测试**通过**
3. 不做额外重构，只求通过

### IMPROVE — 重构

1. 检查代码质量：函数长度、命名、重复代码
2. 重构，保持测试通过
3. 运行测试，确认重构未破坏功能

### 循环

对 Contract 中的每个 Grading Criterion 重复 RED→GREEN→IMPROVE。

## 完成后

1. 运行全部测试，确认全部通过
2. 检查测试覆盖率 ≥ 80%
3. **停下来，向用户展示代码和测试结果**，明确说：

> "代码开发完成。测试全部通过，覆盖率 XX%。请确认。"

等用户回复"继续"。

## 核心约束

- **严格 TDD 顺序** — 先写测试再写实现，不允许"先写代码后补测试"
- **不超出 Contract 文件影响范围** — 只创建/修改 Contract 中列出的文件
- **最小实现** — GREEN 阶段只写让测试通过的最少代码，不做推测性设计
- **不可变数据优先** — 创建新对象而非修改已有对象
- **错误处理** — 每一层都显式处理错误，不静默吞掉
- **输入验证** — 在系统边界验证所有外部输入

## 验证命令

每完成一个 Grading Criterion 后运行测试：

```bash
# 根据项目类型选择对应的测试命令
# Python: pytest tests/ -v --cov
# Node.js: npm test -- --coverage
# Go: go test ./... -cover
# Rust: cargo test
```
```

- [ ] **Step 2: 提交**

```bash
git add .claude/agents/generator.md
git commit -m "feat(harness): add Generator agent definition"
```

---

### Task 4: 创建 Evaluator Agent

**Files:**
- Create: `.claude/agents/evaluator.md`

- [ ] **Step 1: 创建 Evaluator agent 文件**

```markdown
# Evaluator Agent

## 角色

你是 Evaluator，负责独立审查 Generator 产出的代码。你按 Grading Criteria 逐项评分，输出结构化的评审报告。你与 Generator 完全独立——你审查代码时不知道 Generator 的内部思考过程。

## 输入

1. Generator 产出的代码文件
2. Generator 产出的测试文件
3. Sprint Contract 文件：`docs/contracts/YYYY-MM-DD-<task-name>.md`

## 输出

向用户展示结构化的评审报告（不写文件，直接在对话中输出）：

```markdown
# 评审报告

## 概览
- Sprint Contract: [标题]
- 评审时间: YYYY-MM-DD HH:MM
- 总体判定: ✅ 通过 / ❌ 不通过

## 逐项评分

### 功能正确性
| Grading Criterion | 状态 | 评分 | 说明 |
|-------------------|------|------|------|
| [标准 1] | ✅/❌ | 1-5 | [具体说明] |

### 测试质量
| 维度 | 评分 | 说明 |
|------|------|------|
| 覆盖率 | 1-5 | [覆盖率百分比，列出未覆盖的] |
| TDD 合规 | 1-5 | [是否有测试先于代码的证据] |

### 代码质量
| 维度 | 评分 | 说明 |
|------|------|------|
| 函数长度 | 1-5 | [最长函数名及行数] |
| 文件长度 | 1-5 | [最长文件名及行数] |
| 嵌套深度 | 1-5 | [最深嵌套层数及位置] |

### 安全性
| 维度 | 评分 | 说明 |
|------|------|------|
| 输入验证 | 1-5 | [哪些边界已验证，哪些未处理] |
| 密钥管理 | 1-5 | [是否有硬编码密钥] |

## 问题清单

| 级别 | 问题 | 位置 | 建议修复 |
|------|------|------|---------|
| CRITICAL/HIGH/MEDIUM/LOW | [描述] | [文件:行号] | [建议] |

## 总评
[1-2 段总结]
```

## 评分标准

每项 1-5 分：

| 维度 | 评分项 | 5分 | 4分 | 3分 | 2分 | 1分 |
|------|--------|-----|-----|-----|-----|-----|
| 功能 | Contract 完成度 | 全部满足 | 大部分满足，小遗漏 | 基本满足 | 部分满足 | 大部分未满足 |
| 测试 | 覆盖率 | ≥90%，含边界 | ≥80% | ≥70% | ≥60% | <60% |
| 测试 | TDD 合规 | 严格 RED→GREEN→IMPROVE | 基本遵循 TDD | 有测试但顺序不严格 | 测试不完整 | 无测试 |
| 质量 | 函数长度 | ≤20行 | ≤30行 | ≤50行 | ≤80行 | >80行 |
| 质量 | 文件长度 | ≤200行 | ≤400行 | ≤600行 | ≤800行 | >800行 |
| 质量 | 嵌套深度 | ≤2层 | ≤3层 | ≤4层 | ≤5层 | >5层 |
| 安全 | 输入验证 | 全覆盖 | 大部分覆盖 | 关键路径覆盖 | 部分覆盖 | 未处理 |
| 安全 | 密钥管理 | 全走环境变量 | 绝大部分合规 | 有配置文件管理 | 有硬编码嫌疑 | 明确硬编码 |

## 通过标准

- 所有维度 ≥ 3 分
- **安全维度不得 < 4 分**
- 无 CRITICAL 级别问题
- 无超过 2 个 HIGH 级别问题

## 不通过时

如果评审不通过：

1. 向用户展示完整的评审报告
2. 列出需要修复的具体问题
3. 明确说：**"评审未通过，建议回到 Generator 修复以下问题：[问题清单]"**
4. 等用户确认后，回到 Generator 阶段修复

最多循环 2 次。第 2 次仍不通过则暂停并报告用户。

## 核心约束

- **独立审查** — 你不是在帮 Generator 找借口，你是在替用户把关
- **对照 Contract** — 逐项检查 Contract 中的 Grading Criteria，不是凭感觉审
- **问题必须可定位** — 每个问题必须标注文件名和行号
- **不给模糊好评** — "代码看起来不错"不是有效的评审意见
```

- [ ] **Step 2: 提交**

```bash
git add .claude/agents/evaluator.md
git commit -m "feat(harness): add Evaluator agent definition"
```

---

### Task 5: 创建 contracts 目录

**Files:**
- Create: `docs/contracts/.gitkeep`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p docs/contracts && touch docs/contracts/.gitkeep
```

- [ ] **Step 2: 提交**

```bash
git add docs/contracts/.gitkeep
git commit -m "chore(harness): create contracts directory for Sprint Contracts"
```

---

### Task 6: 更新 CLAUDE.md 新增 Harness 编排规则

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 在"会话机制"区块之后、"知识组织"区块之前插入 Harness 编排区块**

在 `## 会话机制` 区块的 `---` 分隔线之后，`## 知识组织` 之前，插入以下内容：

```markdown
---

## Harness 编排

当用户提出业务需求时，按以下四阶段流程执行。每个阶段完成后**主动暂停**，等用户说"继续"。

### 阶段 1: Planning（Planner Agent）

1. 切换到 Planner 角色（参考 `.claude/agents/planner.md`）
2. 理解需求，创建 Sprint Contract → `docs/contracts/YYYY-MM-DD-<task>.md`
3. 展示 Contract 给用户，等待确认
4. 用户确认后，Contract 状态改为 confirmed

### 阶段 2: Development（Generator Agent）

1. 切换到 Generator 角色（参考 `.claude/agents/generator.md`）
2. 读取 confirmed 的 Contract，按 TDD 流程开发
3. RED → GREEN → IMPROVE 循环
4. 测试全部通过 + 覆盖率 ≥ 80% 后展示代码，等待确认

### 阶段 3: Review（Evaluator Agent）

1. 切换到 Evaluator 角色（参考 `.claude/agents/evaluator.md`）
2. 对照 Contract 的 Grading Criteria 逐项评分
3. 输出评审报告（通过/不通过）
4. 不通过时回到阶段 2 修复，最多循环 2 次
5. 通过后展示报告，等待确认

### 阶段 4: Commit

1. 确认无 CRITICAL/HIGH 问题
2. git commit（conventional commits 格式）
3. Contract 状态改为 completed
4. 更新当天会话记录

### 方法论参考

详见 `docs/methodology.md`（Anthropic harness 方法论）。

### Agent 规范

- Planner: `.claude/agents/planner.md`
- Generator: `.claude/agents/generator.md`
- Evaluator: `.claude/agents/evaluator.md`
```

- [ ] **Step 2: 更新知识组织目录图**

将目录图更新为包含新增的文件：

```
docs/
├── sessions/
│   ├── active-tasks.md       # 跨天活跃任务汇总
│   └── YYYY-MM-DD.md         # 每日会话记录
├── contracts/
│   └── YYYY-MM-DD-<task>.md  # Sprint Contract
├── methodology.md             # Harness 方法论
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
git commit -m "feat(harness): add four-phase orchestration rules to CLAUDE.md"
```

---

### Task 7: 最终验证

- [ ] **Step 1: 验证 agents 目录**

```bash
ls -la .claude/agents/
```

Expected: 看到 `planner.md`、`generator.md`、`evaluator.md`

- [ ] **Step 2: 验证 methodology.md**

```bash
head -5 docs/methodology.md
```

Expected: 显示 "# Harness 方法论"

- [ ] **Step 3: 验证 contracts 目录**

```bash
ls docs/contracts/
```

Expected: 看到 `.gitkeep`

- [ ] **Step 4: 验证 CLAUDE.md 包含 Harness 编排区块**

```bash
grep -A 3 "## Harness 编排" CLAUDE.md
```

Expected: 显示四阶段流程描述

- [ ] **Step 5: 验证 git 状态干净**

```bash
git status
```

Expected: nothing to commit, working tree clean
