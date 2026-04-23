# Vibecoding Harness 框架设计

> 日期：2026-04-22
> 状态：已批准

---

## 目的

搭建一套通用、可复用的 harness 框架。用户只需描述业务需求，AI 自动按 Anthropic harness 方法论走完整研发流程（规划 → TDD 开发 → 审查 → 提交），每个阶段停下来等用户确认。

## 设计原则

- **项目无关**：框架可复制到任何新项目
- **监督者模式**：用户只描述需求 + 每个阶段确认
- **Generator-Evaluator 分离**：写代码和审代码是不同角色
- **Contract 驱动**：所有阶段围绕同一份 Sprint Contract 工作
- **交付物**：代码 + 测试 + git 提交

---

## 在 Superpower 路线中的位置

本设计文档定义的是 harness 的**编排骨架**，对应 `Harness Superpower` 路线中的 **Phase 2: Orchestration Superpower**。

它解决的问题是：

- 任务如何分阶段推进
- 三个 Agent 如何通过 Contract 协作
- 在什么节点必须停下来等用户确认

它**不直接覆盖**以下能力，这些能力由其他 superpower 阶段承担：

- Session Superpower：会话记录、任务恢复、跨天延续
- Execution Superpower：阶段证据、验证命令、review fail 回环
- Memory Superpower：知识沉淀、召回、作用域治理
- Capability Superpower：skill/provider/approval 的装配与治理

后续总路线见：

- `docs/superpowers/specs/2026-04-23-harness-superpower-roadmap.md`

---

## 核心流程

```
用户描述业务需求
    ↓
[阶段 1: Planning] ─ planner agent
    输入：用户需求描述（自然语言）
    输出：Sprint Contract
    → 停下，用户确认契约
    ↓
[阶段 2: Development] ─ generator agent（TDD）
    输入：已确认的 Sprint Contract
    流程：RED → GREEN → IMPROVE
    输出：代码 + 测试（覆盖率 ≥ 80%）
    → 停下，用户确认代码
    ↓
[阶段 3: Review] ─ evaluator agent
    输入：代码 + 测试 + Sprint Contract
    输出：评审报告（评分 + 问题清单 + 通过/不通过）
    → 停下，用户确认评审结果
    ↓
[阶段 4: Commit] ─ 自动提交
    条件：评审通过（无 CRITICAL/HIGH 问题）
    输出：git commit + 会话记录更新
```

每个阶段完成后 AI 主动停下来等用户确认。用户回复"继续"才进入下一阶段。

不通过时：AI 自动回到 Generator 阶段修复问题，最多循环 2 次。2 次仍不通过则暂停报告用户。

---

## Sprint Contract 模板

存储路径：`docs/contracts/YYYY-MM-DD-<task-name>.md`

```markdown
# Sprint Contract: [需求标题]

> 创建时间: YYYY-MM-DD
> 状态: draft / confirmed / completed

## 需求描述
<!-- 用户原始需求 -->

## 范围定义
### 包含
- ...

### 不包含
- ...

## 完成标准（Grading Criteria）
- [ ] 标准 1: 具体可验证的条件
- [ ] 标准 2: ...
- [ ] 测试覆盖率 ≥ 80%
- [ ] 无 CRITICAL/HIGH 审查问题

## 技术决策
- 选型: ...
- 架构: ...

## 风险评估
| 风险 | 影响 | 缓解措施 |
|------|------|---------|

## 文件影响范围
- 新建: path/to/file
- 修改: path/to/existing
```

Contract 状态流转：draft → confirmed → completed。是三个 Agent 之间的唯一通信协议。

---

## Agent 角色定义

### Planner（`.claude/agents/planner.md`）

| 项目 | 内容 |
|------|------|
| 职责 | 将用户需求转化为可执行的 Sprint Contract |
| 输入 | 用户需求描述（自然语言） |
| 输出 | `docs/contracts/YYYY-MM-DD-<task>.md` |
| 停止条件 | 输出 Contract 后暂停，等用户确认 |
| 核心约束 | 不写代码；Grading Criteria 必须具体可验证；必须标注文件影响范围 |

### Generator（`.claude/agents/generator.md`）

| 项目 | 内容 |
|------|------|
| 职责 | 基于 Contract 用 TDD 方式写代码 |
| 输入 | 已确认的 Sprint Contract |
| 输出 | 代码文件 + 测试文件 |
| 流程 | RED（先写测试，跑失败）→ GREEN（最小实现，跑通过）→ IMPROVE（重构） |
| 停止条件 | 测试全部通过 + 覆盖率 ≥ 80% 后暂停，等用户确认 |
| 核心约束 | 不超出 Contract 文件影响范围；严格 TDD 顺序 |

### Evaluator（`.claude/agents/evaluator.md`）

| 项目 | 内容 |
|------|------|
| 职责 | 按 Grading Criteria 审查 Generator 产出的代码 |
| 输入 | 代码 + 测试 + Sprint Contract |
| 输出 | 评审报告（逐项评分 + 问题清单 + 通过/不通过） |
| 评分维度 | 功能正确性、测试覆盖、代码质量、安全性 |
| 停止条件 | 输出评审报告后暂停，等用户确认 |
| 核心约束 | 独立于 Generator；对照 Contract 的 Grading Criteria 逐项评分 |

---

## Grading Criteria（评审标准）

每项 1-5 分：

| 维度 | 评分项 | 5分标准 | 1分标准 |
|------|--------|---------|---------|
| 功能 | Contract 完成度 | 所有 Grading Criteria 满足 | 大部分未满足 |
| 测试 | 覆盖率 | ≥ 90%，含边界用例 | < 60%，只有 happy path |
| 测试 | TDD 合规 | 严格 RED→GREEN→IMPROVE | 无测试或测试后补 |
| 质量 | 函数长度 | ≤ 20 行 | > 50 行 |
| 质量 | 文件长度 | ≤ 200 行 | > 800 行 |
| 质量 | 嵌套深度 | ≤ 2 层 | > 4 层 |
| 安全 | 输入验证 | 系统边界全覆盖 | 未处理用户输入 |
| 安全 | 密钥管理 | 全部走环境变量 | 有硬编码密钥 |

**通过标准：** 所有维度 ≥ 3 分，安全维度 ≥ 4 分，无 CRITICAL 问题。

**不通过：** AI 自动回到 Generator 修复，最多循环 2 次。2 次仍不通过则暂停报告用户。

---

## 目录结构

```
project/
├── CLAUDE.md                        ← 编排入口：阶段切换 + 项目规则
├── .claude/
│   ├── settings.local.json          ← 硬护栏 + Stop hook
│   └── agents/                      ← Agent 角色定义
│       ├── planner.md
│       ├── generator.md
│       └── evaluator.md
├── docs/
│   ├── methodology.md               ← Anthropic harness 方法论摘要
│   ├── sessions/                    ← 会话机制（已实现）
│   │   ├── active-tasks.md
│   │   └── YYYY-MM-DD.md
│   ├── contracts/                   ← Sprint Contract 存储
│   │   └── YYYY-MM-DD-<task>.md
│   ├── architecture/
│   ├── product/
│   └── standards/
└── task/                            ← 用户提供的需求文件
```

### 文件改动清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `.claude/agents/planner.md` | Planner 角色规范 |
| 新建 | `.claude/agents/generator.md` | Generator 角色规范 |
| 新建 | `.claude/agents/evaluator.md` | Evaluator 角色规范 |
| 新建 | `docs/methodology.md` | Anthropic harness 方法论摘要 |
| 新建 | `docs/contracts/` 目录 | Sprint Contract 存储 |
| 修改 | `CLAUDE.md` | 新增编排规则（四阶段流程） |

### 不改动的部分

- `docs/sessions/` 已实现，不变
- `docs/architecture/`、`docs/product/`、`docs/standards/` 不变
- `.claude/settings.local.json` 权限规则不变（Stop hook 已有）

---

## 范围边界

本设计覆盖 harness 框架本身。以下不在范围内：
- 具体业务功能的实现（那是 harness 运行后的事）
- 多代理并行协作（Phase 2）
- 评审历史数据积累和自动校准（Phase 3）

补充说明：

- 本文档是编排层规范，不是完整的 harness 路线图
- 与业务验证场的衔接由 `codeReview` 各业务 contract 和 superpower 路线文档承担
