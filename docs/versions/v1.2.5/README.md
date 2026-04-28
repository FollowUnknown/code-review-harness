# v1.2.5 - Harness Memory 分层系统

> 版本周期: 待定（依赖 v1.2.0 完成）
> 状态: 待规划
> 前置: v1.2.0（CodeReview 侧 Knowledge 精准召回）
> 后置: v1.3.0（Capability Superpower 基础）

## 版本目标

实现 **Phase 4: Memory Superpower**（Harness 侧），将 v1.1.0 Execution 产生的数据沉淀为分层记忆，使 AI 编排跨会话不丢失上下文。

**与 v1.2.0 的分工**：

```
v1.2.0（CodeReview 侧）
    │ Knowledge 精准召回、评审质量提升
    │ 存储在 knowledge_entries 表
    │ 用户价值：评审更准更一致
    ▼
v1.2.5（Harness 侧）★ 本版本
    │ Memory 分层、跨会话恢复、记忆升级
    │ 存储在 sessions/memory/ 文件系统
    │ 桥接：validated knowledge → knowledge_entries
    │ 用户价值：AI 编排更智能、上下文不丢失
    ▼
v1.3.0（Capability Superpower）
    │ 基于 Memory 构建 Skill/Provider/Capability
```

---

## 核心功能

### 1. 记忆分层（Memory Layering）

**4 层记忆结构**：

| 层级 | 来源 | 记忆内容 | TTL | 存储 |
|------|------|---------|-----|------|
| **session memory** | 当前会话 | 活跃任务、上下文快照 | 1天 | `sessions/memory/session/` |
| **task memory** | Run 记录 | 单次 Run 的计划、实现、评审要点 | 7天 | `sessions/memory/task/` |
| **project memory** | 历史 Run 聚合 | 项目规则、约定、最佳实践 | 30天 | `sessions/memory/project/` |
| **validated knowledge** | Repair 记录 | 已验证的错误模式、修复方案 | 永久 | `knowledge_entries` 表 |

**关键设计决策**：validated knowledge 不另建存储，直接桥接到 `knowledge_entries`。这是 v1.2.5 与 v1.2.0 的桥接点。

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

// validated knowledge → 直接写入 knowledge_entries
// 不再定义单独的 ValidatedKnowledge 接口
```

### 2. 记忆提取（Memory Extraction）

**从 v1.1.0 Execution 数据提取**：

| 来源 | 提取目标 | 提取逻辑 |
|------|---------|---------|
| `runs/{run-id}/plan.json` | TaskMemory | scope, approach, risks |
| `runs/{run-id}/implementation.json` | TaskMemory | decisions, approach adjustments |
| `runs/{run-id}/review.json` | TaskMemory | review outcomes, grading |
| `repairs/{repair-id}/` | knowledge_entries | pattern + fix → AP or EXP |
| `checkpoints/` | SessionMemory | 状态变更、上下文快照 |

**Repair → Knowledge 桥接**：

```typescript
// Repair 记录 → knowledge_entries
async function bridgeRepairToKnowledge(repair: RepairRecord): Promise<KnowledgeEntry> {
  // 提取错误模式
  const pattern = repair.originalReview.issues
    .filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH')
    .map(i => i.message);

  // 提取修复方案
  const fix = repair.fixPlan.approach;

  // 写入 knowledge_entries（经过 v1.1.5 的审核流程）
  return addEntry({
    type: 'AP',
    project: repair.project,
    severity: 'HIGH',
    title: repair.originalReview.issues[0].message.slice(0, 80),
    content: fix,
    pattern: pattern.join('\n'),
    fix_suggestion: fix,
    source_review: repair.reviewId,
    source_type: 'Repair提取',
    review_status: 'pending', // 走 v1.1.5 审核流程
  });
}
```

### 3. 记忆召回（Memory Recall）

**召回场景**：

| 场景 | 召回层级 | 应用方式 |
|------|---------|---------|
| 开始新 Contract | project memory | 注入项目规则到规划 Prompt |
| 继续中断的会话 | session memory | 恢复活跃任务和上下文 |
| 相似任务参考 | task memory | 注入历史方案到规划 |
| 评审代码 | knowledge_entries | 走 v1.2.0 的精准召回 |

**与 v1.2.0 的分工**：评审场景的 Knowledge 召回完全由 v1.2.0 处理，v1.2.5 不重复实现。

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
    │ confidence > 0.8 时确认
    ▼
knowledge_entries (永久)
    │ 走 v1.2.0 的精准召回
```

---

## 与 v1.2.0 的桥接

```typescript
// v1.2.5 写入 → v1.2.0 消费
bridgeRepairToKnowledge(repair)
  → knowledge_entries (review_status: 'pending')
  → 管理员审核 → review_status: 'approved'
  → v1.2.0 getKnowledgeForReview() 精准召回

// v1.2.0 反馈 → v1.2.5 升级
knowledge hit + adopted → confidence += 0.1
confidence > 0.8 + 30d → project memory → knowledge bridge
```

---

## 前置依赖

| 依赖 | 来源 | 说明 |
|------|------|------|
| v1.1.0 Execution 数据 | v1.1.0 | Run/Repair/Checkpoint 记录 |
| v1.1.5 Knowledge 审核流程 | v1.1.5 | review_status 字段和审核 API |
| v1.2.0 Knowledge 精准召回 | v1.2.0 | confidence 字段、指纹去重 |

---

## 验收标准

### 记忆分层
- [ ] 4 层记忆模型定义完成（session/task/project/knowledge bridge）
- [ ] `sessions/memory/` 目录结构和 JSON Schema
- [ ] 从 Execution 数据提取记忆的 Extractor 实现

### 记忆召回
- [ ] 跨会话恢复（session memory）
- [ ] 相似任务参考（task memory）
- [ ] 项目规则注入（project memory）

### 记忆写回与升级
- [ ] Repair → knowledge_entries 桥接
- [ ] task → project 聚合
- [ ] TTL 自动清理和归档

### 桥接
- [ ] Repair 提取的 Knowledge 走 v1.1.5 审核流程
- [ ] 审核通过的 Knowledge 可被 v1.2.0 召回

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Execution 数据不足 | 高 | 先用 v1.1.0 示例数据开发，待真实数据积累 |
| Repair → Knowledge 桥接质量低 | 中 | 先 pending 审核不自动 approved，人工兜底 |
| 记忆存储膨胀 | 中 | TTL 清理 + 归档 + 压缩 |
| 与 v1.2.0 confidence 体系冲突 | 低 | 共用 confidence 字段，升级路径一致 |

---

*最后更新: 2026-04-28*
