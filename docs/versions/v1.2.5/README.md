# v1.2.5 - Harness Memory 分层系统

> 版本周期: 待定（依赖 v1.2.0 完成）
> 状态: 待规划
> 前置: v1.2.0（CodeReview 侧 Knowledge 精准召回）
> 后置: v1.3.0（Capability Superpower 基础）

## 版本目标

实现 **Phase 4: Memory Superpower**（Harness 侧），将 v1.1.0 Execution 产生的数据沉淀为分层记忆，使 AI 编排跨会话不丢失上下文。

**与 v1.2.0 的关系——完全独立，各服务各的**：

| | v1.2.0（CodeReview 侧） | v1.2.5（Harness 侧） |
|---|---|---|
| 服务对象 | LLM 评审 GitLab MR | AI agent 编排（规划→实现→评审→修复） |
| 评审对象 | 真实业务代码 | AI agent 生成的代码/方案 |
| 数据来源 | LLM 评审结果 → Knowledge | Execution 数据 → Memory |
| 存储 | `knowledge_entries` 表 | `sessions/memory/` 文件 |
| 知识类型 | 业务反模式、项目约定、业务规则 | 执行方案、风险记录、历史决策 |
| 用户价值 | 评审更准更一致 | 编排更智能、上下文不丢失 |

**为什么不桥接**：Harness Repair 记录的是"AI 生成的代码不符合 Contract 要求"，这是**编排层面**的知识（知道什么方案行不通）；而 `knowledge_entries` 存放的是**业务代码层面**的知识（知道项目禁止什么模式）。两者服务不同场景，不应混入同一存储。

```
v1.2.0（CodeReview 侧）
    │ Knowledge 精准召回、评审质量提升
    │ 存储：knowledge_entries 表
    │ 服务：LLM 评审 MR
    ▼
v1.2.5（Harness 侧）★ 本版本
    │ Memory 分层、跨会话恢复、记忆升级
    │ 存储：sessions/memory/ 文件系统
    │ 服务：AI agent 编排
    ▼
v1.3.0（Capability Superpower）
    │ 基于 Memory 构建 Skill/Provider/Capability
```

---

## 核心功能

### 1. 记忆分层（Memory Layering）

**3 层记忆结构**（不再设 validated knowledge 层——那是 Knowledge 系统的事）：

| 层级 | 来源 | 记忆内容 | TTL | 存储 |
|------|------|---------|-----|------|
| **session memory** | 当前会话 | 活跃任务、上下文快照 | 1天 | `sessions/memory/session/` |
| **task memory** | Run 记录 | 单次 Run 的计划、实现、评审要点 | 7天 | `sessions/memory/task/` |
| **project memory** | 历史 Run 聚合 | 项目规则、约定、最佳实践 | 30天 | `sessions/memory/project/` |

**升级路径终止于 project memory**，不再继续升级到 `knowledge_entries`。project memory 超过 30 天未命中则归档。

```typescript
// v1.2.5 记忆模型
interface SessionMemory {
  id: string;
  sessionDate: string;
  activeTasks: ActiveTask[];
  contextSnapshots: ContextSnapshot[];
  ttl: '1d';
}

interface TaskMemory {
  id: string; // = run-id
  contractId: string;
  scope: string;
  approach: string;
  risks: string[];
  decisions: Decision[];
  timestamp: number;
  ttl: '7d';
}

interface ProjectMemory {
  id: string;
  projectName: string;
  type: 'rules' | 'conventions' | 'best-practices';
  content: string;
  sourceTaskIds: string[];
  confidence: number;
  ttl: '30d';
}
```

### 2. 记忆提取（Memory Extraction）

**从 v1.1.0 Execution 数据提取**：

| 来源 | 提取目标 | 提取逻辑 |
|------|---------|---------|
| `runs/{run-id}/plan.json` | TaskMemory | scope, approach, risks |
| `runs/{run-id}/implementation.json` | TaskMemory | decisions, approach adjustments |
| `runs/{run-id}/review.json` | TaskMemory | review outcomes, grading |
| `checkpoints/` | SessionMemory | 状态变更、上下文快照 |

**注意**：Repair 记录不再桥接到 `knowledge_entries`。Repair 的知识（什么方案行不通、如何修复）保留在 Harness Memory 系统内，服务未来的 agent 编排。

### 3. 记忆召回（Memory Recall）

**召回场景**：

| 场景 | 召回层级 | 应用方式 |
|------|---------|---------|
| 开始新 Contract | project memory | 注入项目规则到规划 Prompt |
| 继续中断的会话 | session memory | 恢复活跃任务和上下文 |
| 相似任务参考 | task memory | 注入历史方案到规划 |
| 修复失败参考 | task memory (Repair 相关) | 注入历史修复方案到修复规划 |

**与 v1.2.0 的边界**：评审 MR 时的 Knowledge 召回完全由 v1.2.0 处理，v1.2.5 不涉及。

### 4. 记忆写回与升级

**升级路径**：

```
session memory (1d)
    │ 到期自动归档
    ▼
task memory (7d)
    │ 多次 task 聚合
    ▼
project memory (30d)
    │ 30 天未命中 → 归档
    ▼
archive/ (永久存储，不再升级)
```

---

## 前置依赖

| 依赖 | 来源 | 说明 |
|------|------|------|
| v1.1.0 Execution 数据 | v1.1.0 | Run/Repair/Checkpoint 记录 |
| Session 机制 | 已有 | `sessions/` 目录和会话记录 |
| Contract 机制 | 已有 | `docs/contracts/` 关联 |

---

## 验收标准

### 记忆分层
- [ ] 3 层记忆模型定义完成（session/task/project）
- [ ] `sessions/memory/` 目录结构和 JSON Schema
- [ ] 从 Execution 数据提取记忆的 Extractor 实现

### 记忆召回
- [ ] 跨会话恢复（session memory）
- [ ] 相似任务参考（task memory）
- [ ] 项目规则注入（project memory）

### 记忆写回与升级
- [ ] task → project 聚合
- [ ] TTL 自动清理和归档
- [ ] 升级逻辑可配置

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Execution 数据不足 | 高 | 先用 v1.1.0 示例数据开发，待真实数据积累 |
| 记忆召回相关性低 | 高 | 小规模测试，调整评分算法 |
| 记忆存储膨胀 | 中 | TTL 清理 + 归档 + 压缩 |
| 与 CodeReview Knowledge 混淆 | 中 | 明确边界：Memory 服务编排，Knowledge 服务评审 |

---

*最后更新: 2026-04-28*
