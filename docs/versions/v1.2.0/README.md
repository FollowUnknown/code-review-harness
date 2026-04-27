# v1.2.0 - Memory Superpower 与 AI 评审质量

> 版本周期: 待定（依赖 v1.1.0 完成）
> 状态: 待规划
> 前置: v1.1.0（Execution Superpower 完成）
> 后置: v1.3.0（Capability Superpower）

## 版本目标

实现 **Phase 4: Memory Superpower**，将 v1.1.0 Execution 产生的数据沉淀为分层记忆，并基于记忆优化 AI 评审质量。

**Superpower Phase 定位**：
```
Phase 3 Execution (v1.1.0) ──┐
    │ 产生执行数据            │
    ▼                        │
Phase 4 Memory (v1.2.0) ◄────┘  ★ 当前版本目标
    │ 提取、召回、写回        │
    ▼                        │
Phase 5 Capability (v1.3.0) ─┘
    技能注册、路由、治理
```

---

## 核心功能

### 1. 记忆分层（Memory Layering）

**目标**：建立 4 层记忆模型，从 v1.1.0 Execution 数据中提取。

**4 层记忆结构**：

| 层级 | 来源（v1.1.0 Execution） | 记忆内容 | TTL |
|------|-------------------------|---------|-----|
| **session memory** | `sessions/YYYY-MM-DD.md` | 当前会话临时状态、活跃任务 | 1天 |
| **task memory** | `sessions/execution/runs/{run-id}/` | 单次 Run 的计划、实现、评审记录 | 7天 |
| **project memory** | `docs/contracts/` + 历史 Run 聚合 | 项目规则、约定、最佳实践 | 30天 |
| **validated knowledge** | `sessions/execution/repairs/{repair-id}/` | 已确认的错误模式、修复方案、可复用知识 | 永久 |

**从 v1.1.0 Execution 提取记忆**：

```typescript
// v1.2.0 记忆提取器
interface MemoryExtractor {
  // 从 Run 记录提取 task memory
  extractTaskMemory(run: ExecutionRun): TaskMemory;
  
  // 从 Repair 记录提取 validated knowledge
  extractValidatedKnowledge(repair: ExecutionRepair): ValidatedKnowledge;
  
  // 从多个 Run 聚合 project memory
  aggregateProjectMemory(runs: ExecutionRun[]): ProjectMemory;
}

// 示例：从 v1.1.0 Run 记录提取
const run = load('sessions/execution/runs/run-20260428-001/plan.json');
const taskMemory: TaskMemory = {
  id: run.runId,
  scope: run.content.scope,
  approach: run.content.approach,
  risks: run.content.risks,
  timestamp: run.timestamp,
  ttl: '7d'
};
```

### 2. 记忆召回（Memory Recall）

**目标**：在 AI 评审时自动召回相关记忆，提升评审质量。

**召回策略**：

| 场景 | 召回记忆层级 | 召回条件 | 应用方式 |
|------|-------------|---------|---------|
| 开始新 Run | project memory | Contract 匹配 | 注入项目规则到 Prompt |
| 评审代码 | validated knowledge | 代码模式匹配 | 注入历史错误模式到评审维度 |
| 修复问题 | task memory | 相似 Run 匹配 | 注入之前修复方案到修复计划 |
| 跨会话恢复 | session memory | 会话中断 | 恢复活跃任务和上下文 |

**召回实现**：

```typescript
interface RecallPolicy {
  // 根据当前上下文召回记忆
  recall(context: ExecutionContext): Memory[];
  
  // 相关性评分
  scoreRelevance(memory: Memory, context: ExecutionContext): number;
  
  // 注入 Prompt
  injectIntoPrompt(memories: Memory[], prompt: Prompt): Prompt;
}

// 示例：评审时召回 validated knowledge
const codeToReview = load('src/user/service.ts');
const memories = recallPolicy.recall({
  type: 'code_review',
  file: 'src/user/service.ts',
  code: codeToReview,
  contract: '2026-04-28-story-code-review'
});
// 召回结果：[{ type: 'validated_knowledge', pattern: 'sql-injection', ... }]
```

### 3. 记忆写回（Memory Writeback）

**目标**：将新的执行数据写回记忆层，形成正向循环。

**写回策略**：

| 来源 | 写回目标 | 升级路径 |
|------|---------|---------|
| Run 完成 | task memory | task memory → project memory（聚合） |
| Repair 完成 | validated knowledge | 直接写入，永久保存 |
| 跨 Run 模式发现 | project memory | 多次 task memory 聚合 |
| 会话结束 | session memory 归档 | 活跃任务写入 active-tasks.md |

**写回实现**：

```typescript
interface WritebackPolicy {
  // 判断是否应该升级记忆
  shouldPromote(memory: Memory): boolean;
  
  // 执行写回
  writeback(source: ExecutionSource): Memory;
  
  // 升级记忆层级
  promote(memory: Memory): Memory;
}

// 示例：Repair 完成写回 validated knowledge
const repair = load('sessions/execution/repairs/repair-20260428-001');
const knowledge: ValidatedKnowledge = writebackPolicy.writeback(repair);
// 结果写入：docs/knowledge/validated/sql-injection-pattern.md
```

### 4. AI 评审质量提升

**基于记忆的评审优化**：

| 优化维度 | 无记忆（v1.1.0） | 有记忆（v1.2.0） |
|---------|-----------------|-----------------|
| 评审一致性 | 每次从头开始，标准可能变化 | 基于 project memory，保持评审标准一致 |
| 错误发现率 | 只发现表面问题 | 基于 validated knowledge，发现历史相似错误 |
| 修复建议质量 | 通用建议 | 基于 task memory，提供历史成功修复方案 |
| 上下文理解 | 只理解当前代码 | 基于 project memory，理解项目背景和约束 |

**示例：基于记忆的评审流程**：

```typescript
// v1.2.0 基于记忆的评审
async function reviewWithMemory(code: string, context: ReviewContext): Promise<ReviewResult> {
  // 1. 召回相关记忆
  const memories = await recallPolicy.recall({
    type: 'code_review',
    code,
    contract: context.contractId
  });
  
  // 2. 构建增强 Prompt
  const prompt = buildPromptWithMemories(code, memories);
  
  // 3. 执行评审
  const review = await aiReview(prompt);
  
  // 4. 写回新记忆（如果发现新模式）
  if (discoverNewPattern(review)) {
    await writebackPolicy.writeback(review);
  }
  
  return review;
}
```

---

## 与 v1.1.0 的关系

```
v1.1.0 (Execution Superpower)
    │ 产生 Execution 数据
    ▼
sessions/execution/
├── runs/           ──────┐
├── repairs/              │  v1.2.0 提取为
└── checkpoints/          │  4 层记忆
                          ▼
v1.2.0 (Memory Superpower)
    │ 记忆召回/写回
    ▼
AI 评审质量提升
（一致性、发现率、修复质量、上下文理解）
```

**v1.1.0 → v1.2.0 的数据流转**：

1. v1.1.0 产生 Execution 数据（Run/Repair/Checkpoint）
2. v1.2.0 从 Execution 数据提取 4 层记忆
3. v1.2.0 基于记忆提升 AI 评审质量
4. v1.2.0 将新的执行数据写回记忆（正向循环）

---

## 前置依赖

| 依赖 | 来源 | 说明 |
|------|------|------|
| v1.1.0 Execution 数据 | v1.1.0 | 必须有 Run/Repair/Checkpoint 记录才能提取记忆 |
| Session 机制 | 已有 | 依赖 `sessions/` 机制存储记忆 |
| Contract 机制 | 已有 | 依赖 `docs/contracts/` 关联记忆 |

---

## 验收标准

### 记忆分层
- [ ] 4 层记忆模型定义完成（session/task/project/validated）
- [ ] 从 v1.1.0 Execution 数据提取记忆的 Extractor 实现
- [ ] 记忆存储到 `sessions/memory/`（按层级组织）

### 记忆召回
- [ ] 召回策略实现（根据场景召回不同层级记忆）
- [ ] 相关性评分算法
- [ ] 记忆注入 Prompt 的实现

### 记忆写回
- [ ] 写回策略实现（Run → task memory → project memory）
- [ ] Repair → validated knowledge 的升级路径
- [ ] 记忆升级和归档机制

### AI 评审质量提升
- [ ] 基于记忆的评审流程实现
- [ ] 与 v1.1.0 无记忆评审对比测试
- [ ] 评审一致性、错误发现率、修复质量提升可量化

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| v1.1.0 Execution 数据不足 | 高 | 延迟 v1.2.0 启动，等待 v1.1.0 产生足够数据；或先用模拟数据开发 |
| 记忆召回准确性低 | 高 | 小规模测试召回效果；调整相关性算法；人工标注训练 |
| 记忆存储膨胀 | 中 | 设置 TTL 自动清理；归档历史记忆；压缩存储 |
| 与 v1.1.0 数据格式不兼容 | 中 | 定义清晰的接口契约；v1.1.0 冻结后 v1.2.0 开发；版本适配器 |

---

## 附录：Memory Superpower 详细设计

### 记忆分层详细设计

```typescript
// 4层记忆模型

// 1. Session Memory（会话级，TTL: 1天）
interface SessionMemory {
  id: string;
  sessionDate: string; // YYYY-MM-DD
  activeTasks: ActiveTask[];
  contextSnapshots: ContextSnapshot[];
  lastCheckpoint: Checkpoint;
  ttl: '1d';
}

// 2. Task Memory（任务级，TTL: 7天）
interface TaskMemory {
  id: string; // run-id
  contractId: string;
  type: 'plan' | 'implementation' | 'review';
  content: {
    scope: string;
    approach: string;
    risks: string[];
    decisions: Decision[];
  };
  timestamp: number;
  ttl: '7d';
  // 升级路径：7天后聚合为 project memory
}

// 3. Project Memory（项目级，TTL: 30天）
interface ProjectMemory {
  id: string;
  projectName: string;
  type: 'rules' | 'conventions' | 'best-practices' | 'constraints';
  content: string;
  sourceTaskIds: string[]; // 从哪些 Task Memory 聚合而来
  confidence: number; // 0-1，置信度
  timestamp: number;
  ttl: '30d';
  // 升级路径：30天后确认可转为 validated knowledge
}

// 4. Validated Knowledge（已验证知识，永久）
interface ValidatedKnowledge {
  id: string;
  type: 'pattern' | 'anti-pattern' | 'fix-recipe' | 'rule';
  name: string;
  description: string;
  pattern: string; // 正则或 AST 模式
  fix?: string; // 修复方案
  examples: {
    bad: string;
    good: string;
  }[];
  sourceRepairIds: string[]; // 从哪些 Repair 记录验证而来
  validationCount: number; // 验证次数
  successRate: number; // 成功率
  timestamp: number;
  ttl: 'permanent'; // 永久保存
}
```

### 记忆召回详细设计

```typescript
// 召回策略
interface RecallPolicy {
  // 主召回方法
  recall(context: RecallContext): Promise<Memory[]>;
}

// 召回上下文
interface RecallContext {
  type: 'code_review' | 'planning' | 'implementation' | 'repair';
  code?: string;
  file?: string;
  contractId?: string;
  currentPhase?: 'plan' | 'implement' | 'review';
  recentMemories?: string[]; // 最近已召回的记忆ID，避免重复
}

// 相关性评分
interface RelevanceScorer {
  score(memory: Memory, context: RecallContext): number;
}

// 具体召回策略实现
class LayeredRecallPolicy implements RecallPolicy {
  async recall(context: RecallContext): Promise<Memory[]> {
    const memories: Memory[] = [];
    
    // 1. 召回 session memory（当前会话上下文）
    const sessionMemories = await this.recallSessionMemory(context);
    memories.push(...sessionMemories);
    
    // 2. 召回 task memory（相似任务历史）
    const taskMemories = await this.recallTaskMemory(context);
    memories.push(...taskMemories);
    
    // 3. 召回 project memory（项目规则和约定）
    const projectMemories = await this.recallProjectMemory(context);
    memories.push(...projectMemories);
    
    // 4. 召回 validated knowledge（已验证的错误模式）
    const validatedMemories = await this.recallValidatedKnowledge(context);
    memories.push(...validatedMemories);
    
    // 5. 相关性排序和过滤
    const scoredMemories = memories.map(m => ({
      memory: m,
      score: this.scorer.score(m, context)
    }));
    
    scoredMemories.sort((a, b) => b.score - a.score);
    
    // 返回前 N 个，按层级去重
    return this.deduplicateByLayer(scoredMemories.map(s => s.memory)).slice(0, 10);
  }
}
```

### 记忆写回详细设计

```typescript
// 写回策略
interface WritebackPolicy {
  // 判断是否应该升级记忆
  shouldPromote(memory: Memory): boolean;
  
  // 执行写回
  writeback(source: ExecutionSource): Promise<Memory>;
  
  // 升级记忆层级
  promote(memory: Memory): Promise<Memory>;
}

// 具体写回策略实现
class LayeredWritebackPolicy implements WritebackPolicy {
  async writeback(source: ExecutionSource): Promise<Memory> {
    switch (source.type) {
      case 'run_complete':
        // Run 完成 → 写入 task memory
        return this.writeTaskMemory(source.run);
        
      case 'repair_complete':
        // Repair 完成 → 写入 validated knowledge
        return this.writeValidatedKnowledge(source.repair);
        
      case 'session_end':
        // 会话结束 → 归档 session memory
        return this.archiveSessionMemory(source.session);
        
      default:
        throw new Error(`Unknown source type: ${source.type}`);
    }
  }
  
  shouldPromote(memory: Memory): boolean {
    switch (memory.type) {
      case 'task':
        // Task memory 7天后聚合为 project memory
        return Date.now() - memory.timestamp > 7 * 24 * 60 * 60 * 1000;
        
      case 'project':
        // Project memory 30天后确认可转为 validated knowledge
        return Date.now() - memory.timestamp > 30 * 24 * 60 * 60 * 1000 &&
               memory.confidence > 0.8;
        
      default:
        return false;
    }
  }
  
  async promote(memory: Memory): Promise<Memory> {
    if (!this.shouldPromote(memory)) {
      return memory;
    }
    
    switch (memory.type) {
      case 'task':
        // 聚合多个 task memory 为 project memory
        return this.aggregateToProjectMemory(memory);
        
      case 'project':
        // 确认并转为 validated knowledge
        return this.confirmToValidatedKnowledge(memory);
        
      default:
        return memory;
    }
  }
}
```

---

## 与 v1.1.0 的数据流转

```
v1.1.0 Execution 数据产生
│
├─ sessions/execution/runs/{run-id}/
│  ├─ plan.json ─────────────┐
│  ├─ implementation.json ───┼──► v1.2.0 提取为 task memory
│  └─ review.json ───────────┘
│
├─ sessions/execution/repairs/{repair-id}/
│  ├─ original-review.json ──┐
│  ├─ fix-plan.json ─────────┼──► v1.2.0 提取为 validated knowledge
│  ├─ verification.json ─────┤
│  └─ retry-result.json ─────┘
│
└─ sessions/execution/checkpoints/{checkpoint-id}.json
   └── 状态变更记录 ───────────► v1.2.0 提取为 session/task memory 边界

v1.2.0 Memory 使用
│
├─ 评审时代码召回相关记忆 ────► 提升评审一致性
├─ 修复时召回历史修复方案 ────► 提升修复质量
├─ 规划时召回项目规则和约定 ──► 提升规划准确性
└─ 写回新产生的记忆 ─────────► 形成正向循环
```

---

## 验收标准

### 记忆提取
- [ ] 从 v1.1.0 Run 记录提取 task memory 的 Extractor 实现
- [ ] 从 v1.1.0 Repair 记录提取 validated knowledge 的 Extractor 实现
- [ ] 从 v1.1.0 Checkpoint 记录提取 session memory 的 Extractor 实现

### 记忆召回
- [ ] 4 层记忆召回策略实现
- [ ] 相关性评分算法实现
- [ ] 记忆注入 Prompt 的实现
- [ ] 召回效果可量化（A/B 测试对比）

### 记忆写回
- [ ] 记忆写回策略实现
- [ ] 记忆升级策略实现（task → project → validated）
- [ ] 写回和升级的可观测性（日志、指标）

### AI 评审质量提升（可量化）
- [ ] 评审一致性提升（同一代码多次评审结果一致性 > 90%）
- [ ] 错误发现率提升（与 v1.1.0 对比，发现更多历史相似错误）
- [ ] 修复建议质量提升（修复成功率 > 80%）
- [ ] 规划准确性提升（规划与实际执行匹配度 > 85%）

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| v1.1.0 Execution 数据格式变更 | 高 | 定义清晰的接口契约；v1.1.0 冻结后 v1.2.0 开发；版本适配器 |
| 记忆召回准确性低 | 高 | 小规模测试召回效果；人工标注训练；A/B 测试对比 |
| 记忆存储膨胀 | 中 | TTL 自动清理；归档历史记忆；压缩存储；抽样保留 |
| 记忆升级策略不准确 | 中 | 人工审核升级；置信度阈值调整；升级效果可观测 |

---

## 与 Superpower Roadmap 的关系

```
Superpower Roadmap
│
├─ Phase 1: Session ✅ (已有 sessions/ 机制)
│
├─ Phase 2: Orchestration ✅ (已有 CLAUDE.md 双轨编排)
│
├─ Phase 3: Execution (v1.1.0) ──► 产生数据
│  ├─ Run/StageRun/Artifact
│  ├─ Review fail → Generator repair 回环
│  └─ 阶段证据、artifact 留存
│
├─ Phase 4: Memory (v1.2.0) ◄── 使用数据 ★ 当前版本目标
│  ├─ 记忆分层（session/task/project/validated）
│  ├─ 记忆召回（Recall Policy）
│  ├─ 记忆写回（Writeback Policy）
│  └─ 基于记忆的 AI 评审质量提升
│
└─ Phase 5: Capability (v1.3.0+) 
   ├─ Skill Registry
   ├─ Provider Routing
   └─ Capability Governance
```

**关键理解**：
- v1.2.0 不是独立开发，而是**消费 v1.1.0 产生的数据**
- v1.1.0 的 Execution 数据是 v1.2.0 的**原料**
- v1.2.0 的目标是把原料**提炼**为可用的记忆，并**应用**到 AI 评审中

