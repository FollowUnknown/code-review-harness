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
