# v1.1.0 Harness 迭代优化计划

> 版本: v1.1.0
> 周期: 2026-04-28 ~ 2026-05-09
> 核心目标: 优化 Harness 框架的双轨编排与 Agent 协作机制

---

## 背景与问题

当前 Harness Phase 2 虽已落地双轨编排，但在实际运行中存在以下问题：

1. **Agent 上下文切换开销大** - Planner/Generator/Evaluator 状态清理不彻底
2. **Contract 粒度太粗** - 大任务 Contract 难以追踪，缺少子任务拆分机制  
3. **双轨切换逻辑复杂** - Business/Platform Task 判断规则不清晰
4. **评审回环效率低** - Evaluator 失败后 Generator 重试缺少增量优化

## 迭代目标

### 目标 1: 优化 Agent 上下文管理（40% 工作量）

**具体改进**:
- 标准化 Agent 切换时的上下文清理协议
- 引入 Agent Memory 快照机制，支持快速恢复
- 优化 Agent 状态持久化，支持跨会话延续

**验收标准**:
- [ ] Agent 切换时间从当前 ~3s 降至 < 1s
- [ ] 大任务（>50 文件）Agent 切换不掉上下文
- [ ] 支持中断后从最近 Agent 状态恢复

### 目标 2: Contract 子任务拆分机制（30% 工作量）

**具体改进**:
- 大 Contract 自动拆分为子 Contract 树
- 父子 Contract 状态联动，子任务完成自动聚合
- 支持子任务并行执行，结果合并

**验收标准**:
- [ ] Contract 支持 >100 文件的任务拆分
- [ ] 子任务失败不影响兄弟任务执行
- [ ] 子任务结果自动聚合到父 Contract 报告

### 目标 3: 双轨编排规则简化（20% 工作量）

**具体改进**:
- 明确 Business/Platform Task 判定规则
- 引入 Task 类型自动识别（基于文件路径/关键词）
- 简化双轨切换逻辑，减少人工判断

**验收标准**:
- [ ] 90% 任务能自动识别 Business/Platform 类型
- [ ] 双轨切换无需人工确认，自动路由
- [ ] 误判任务支持一键切换轨道

### 目标 4: 评审回环增量优化（10% 工作量）

**具体改进**:
- Evaluator 反馈结构化，明确问题分类
- Generator 重试时仅修改被指出问题的文件
- 支持部分文件通过，仅重试失败文件

**验收标准**:
- [ ] 评审失败重试时间减少 50%+
- [ ] 仅修改被评审指出的问题，不引入新变更
- [ ] 支持部分通过，未失败文件不重审

---

## 技术方案

### Agent 上下文管理优化

```typescript
// Agent 上下文快照
interface AgentSnapshot {
  agentType: 'planner' | 'generator' | 'evaluator';
  contractId: string;
  memory: AgentMemory;
  state: AgentState;
  timestamp: number;
}

// Agent 切换时保存/恢复
class AgentContextManager {
  async switchTo(
    targetAgent: AgentType,
    contractId: string
  ): Promise<Agent> {
    // 1. 保存当前 Agent 快照
    await this.saveSnapshot(this.currentAgent);
    
    // 2. 加载或创建目标 Agent
    const snapshot = await this.loadSnapshot(targetAgent, contractId);
    const agent = snapshot 
      ? await this.restoreFromSnapshot(snapshot)
      : await this.createAgent(targetAgent, contractId);
    
    // 3. 预热 Agent 上下文
    await agent.warmup();
    
    return agent;
  }
}
```

### Contract 子任务拆分

```typescript
// 子任务 Contract
interface SubContract {
  id: string;
  parentId: string;
  scope: TaskScope;
  status: ContractStatus;
  dependencies: string[]; // 依赖的其他子任务
}

// 大任务自动拆分
class ContractSplitter {
  async split(contract: Contract): Promise<SubContract[]> {
    const files = contract.scope.files;
    
    // 按文件依赖关系分组
    const groups = await this.groupByDependencies(files);
    
    // 为每组创建子 Contract
    return groups.map((group, index) => ({
      id: `${contract.id}-sub-${index}`,
      parentId: contract.id,
      scope: { files: group },
      status: 'draft',
      dependencies: this.findDependencies(group, groups),
    }));
  }
}

// 并行执行 + 结果合并
class ParallelContractExecutor {
  async execute(subContracts: SubContract[]): Promise<MergedResult> {
    // 按依赖拓扑排序
    const sorted = this.topologicalSort(subContracts);
    
    // 并行执行无依赖的任务
    const results = await Promise.all(
      sorted.map(contract => 
        this.executeWithRetry(contract)
      )
    );
    
    // 合并结果
    return this.mergeResults(results);
  }
}
```

### 双轨自动识别

```typescript
// 任务类型自动识别
interface TaskClassifier {
  classify(task: TaskDescription): TaskType;
}

class AutoTaskClassifier implements TaskClassifier {
  private rules: ClassificationRule[] = [
    // Platform Task 规则
    {
      type: 'platform',
      patterns: [
        /架构|框架|编排|机制|设计|重构/i,
        /session|contract|agent|harness/i,
        /superpower|capability|provider/i,
      ],
      filePatterns: [
        /docs\/.*\.(design|spec)\./,
        /\.claude\/agents\/.*\.md/,
        /docs\/contracts\/.*\.md/,
      ],
    },
    // Business Task 规则
    {
      type: 'business',
      patterns: [
        /功能|特性|bug|修复|优化|页面|组件/i,
        /api|endpoint|route|controller/i,
        /ui|view|component|page/i,
      ],
      filePatterns: [
        /src\/.*\.(ts|tsx|js|jsx)$/,
        /tests\/.*\.(test|spec)\./,
      ],
    },
  ];

  classify(task: TaskDescription): TaskType {
    // 计算 Platform 特征得分
    const platformScore = this.calculateScore(task, 'platform');
    // 计算 Business 特征得分
    const businessScore = this.calculateScore(task, 'business');
    
    // 阈值判断
    if (platformScore > 0.7 && platformScore > businessScore) {
      return 'platform';
    }
    if (businessScore > 0.7 && businessScore > platformScore) {
      return 'business';
    }
    
    // 模糊情况默认按 Platform 处理
    return 'platform';
  }
  
  private calculateScore(task: TaskDescription, type: TaskType): number {
    const rule = this.rules.find(r => r.type === type)!;
    let score = 0;
    let matches = 0;
    
    // 文本匹配
    for (const pattern of rule.patterns) {
      if (pattern.test(task.description) || 
          pattern.test(task.title)) {
        matches++;
      }
    }
    
    // 文件匹配
    for (const filePattern of rule.filePatterns) {
      if (task.files.some(f => filePattern.test(f))) {
        matches++;
      }
    }
    
    // 归一化得分
    const totalPatterns = rule.patterns.length + rule.filePatterns.length;
    return matches / totalPatterns;
  }
}

// 一键切换轨道
interface TrackSwitcher {
  switch(taskId: string, targetTrack: TaskType): Promise<void>;
}

class QuickTrackSwitcher implements TrackSwitcher {
  async switch(taskId: string, targetTrack: TaskType): Promise<void> {
    // 1. 保存当前轨道状态
    const currentState = await this.saveCurrentState(taskId);
    
    // 2. 切换到新轨道
    await this.updateTaskTrack(taskId, targetTrack);
    
    // 3. 恢复或重置 Agent 上下文
    if (targetTrack === 'business') {
      // Business Task 重置为 Generator 初始状态
      await this.resetToGenerator(taskId);
    } else {
      // Platform Task 重置为 Planner 初始状态
      await this.resetToPlanner(taskId);
    }
    
    // 4. 记录切换历史
    await this.logTrackSwitch(taskId, currentState.track, targetTrack);
  }
}
```

### 评审回环增量优化

```typescript
// 增量评审引擎
interface IncrementalReviewEngine {
  // 部分重试：仅评审失败的文件
  partialRetry(
    failedFiles: string[],
    previousResult: ReviewResult
  ): Promise<ReviewResult>;
  
  // 增量修复：仅修改被指出问题的代码
  incrementalFix(
    file: string,
    issues: Issue[],
    originalCode: string
  ): Promise<CodeFix>;
}

class SmartIncrementalReviewEngine implements IncrementalReviewEngine {
  async partialRetry(
    failedFiles: string[],
    previousResult: ReviewResult
  ): Promise<ReviewResult> {
    // 1. 提取已通过文件的评审结论
    const passedConclusions = previousResult.files
      .filter(f => !failedFiles.includes(f.path))
      .map(f => ({
        path: f.path,
        conclusion: f.conclusion,
        canReuse: true
      }));
    
    // 2. 仅对失败文件重新评审
    const retryResults = await Promise.all(
      failedFiles.map(async file => {
        // 注入已通过文件的结论作为参考
        const context = {
          ...this.buildContext(file),
          passedConclusions,
          focus: '之前评审失败，请重点检查以下方面...'
        };
        
        return this.reviewFile(file, context);
      })
    );
    
    // 3. 合并新旧结果
    return this.mergeResults(passedConclusions, retryResults);
  }
  
  async incrementalFix(
    file: string,
    issues: Issue[],
    originalCode: string
  ): Promise<CodeFix> {
    // 按问题位置分组，避免重复修改同一区域
    const groupedIssues = this.groupIssuesByLocation(issues);
    
    // 生成最小化修复
    const fixes: CodeChange[] = [];
    
    for (const [location, locationIssues] of groupedIssues) {
      // 分析该位置需要哪些修改
      const requiredChanges = this.analyzeRequiredChanges(
        locationIssues,
        originalCode
      );
      
      // 生成最小修改集
      const minimalChanges = this.generateMinimalChanges(
        requiredChanges,
        originalCode
      );
      
      fixes.push(...minimalChanges);
    }
    
    // 检查修改冲突并解决
    const resolvedFixes = this.resolveConflicts(fixes);
    
    return {
      file,
      originalCode,
      changes: resolvedFixes,
      estimatedImpact: this.calculateImpact(resolvedFixes),
      testRecommendations: this.generateTestRecommendations(issues)
    };
  }
  
  // 优化：仅评审有变更的部分
  async reviewPartial(
    file: string,
    originalCode: string,
    modifiedCode: string,
    previousReview?: ReviewResult
  ): Promise<ReviewResult> {
    // 1. 计算代码 diff
    const diff = this.computeDiff(originalCode, modifiedCode);
    
    // 2. 识别影响范围
    const impactScope = this.analyzeImpactScope(diff, file);
    
    // 3. 检查之前评审的问题是否已解决
    const resolvedIssues = previousReview 
      ? this.checkResolvedIssues(previousReview, diff)
      : [];
    
    // 4. 仅对变更部分和新影响范围进行评审
    const partialContext = {
      diff,
      impactScope,
      resolvedIssues,
      unchangedConclusion: previousReview 
        ? this.extractUnchangedConclusion(previousReview, diff)
        : null
    };
    
    return this.reviewWithContext(file, partialContext);
  }
}
```

## 非 AI 辅助项

### 需要预先准备的工程能力

1. **AST 解析服务**（轻量封装）
   - 用途：提取函数级上下文注入 Prompt
   - 范围：仅 TypeScript/JavaScript
   - 库选型：`ts-morph`（已调研）

2. **代码片段提取**（简单工具函数）
   - 用途：从 diff 提取问题行上下文
   - 输入：diff hunk + 行号
   - 输出：6 行上下文代码

3. **Knowledge 向量检索**（可选）
   - 用途：Prompt 中注入相关 Knowledge
   - 前期：简单字符串匹配
   - 后期：考虑 `sqlite-vec`

### 明确不做的重型工程

- ❌ 复杂 Knowledge 图谱（图数据库）
- ❌ 全量 AST 可视化（语法树展示）
- ❌ 分布式评审服务（微服务拆分）
- ❌ 复杂机器学习模型（代码缺陷预测）

## 验收方式

### AI 执行流程（Harness）

```
Phase 1: Planning
├── 输入：需求文档 + 当前代码
├── 输出：实现方案 + 文件变更清单
└── 停止点：用户确认方案

Phase 2: Development
├── 输入：确认的方案
├── 输出：代码实现 + 单元测试
└── 停止点：测试覆盖率 ≥ 85%

Phase 3: Review
├── 输入：代码变更
├── 输出：审查报告
└── 停止点：无 CRITICAL/HIGH 问题

Phase 4: Commit
├── 输入：审查通过的代码
└── 输出：git commit + 合并到主干
```

### 验收检查清单

- [ ] 代码实现符合需求文档
- [ ] 单元测试覆盖率 ≥ 85%
- [ ] 无 TypeScript 类型错误
- [ ] 无 ESLint/Prettier 警告
- [ ] 构建成功
- [ ] 在测试数据上验证通过
- [ ] 代码审查通过（AI 自评 + 人工抽查）

---

## 风险评估

| 风险 | 影响 | 缓解 |
|------|------|------|
| 多轮交互延迟过高 | 高 | 设置最大轮数，超时 fallback 到单轮 |
| Prompt 过长超出限制 | 高 | 动态裁剪低权重上下文 |
| AI 输出不稳定 | 中 | 增加重试机制，结构化校验 |
| 与 v1.0.0 兼容性问题 | 中 | 严格版本隔离，灰度发布 |

---

## 下一步行动

1. **待 v1.0.0 完成后**: 复盘 v1.0.0，提取经验教训
2. **详细设计阶段**: 细化三个支柱的技术方案
3. **原型验证**: 用简单案例验证多轮交互效果
4. **正式开发**: 进入 Harness 执行流程

---

*本文档为 v1.1.0 概要计划，详细设计待 v1.0.0 完成后启动*