# v1.4.0 - Capability Superpower 与技能治理

> 版本周期: 待定（依赖 v1.3.0 完成）
> 状态: 待规划
> 前置: v1.3.0（Capability Superpower 基础）
> 后置: v2.0.0（知识图谱）

## 版本目标

实现 **Phase 5: Capability Superpower** 的高级治理功能，包括 Skill 的版本管理、Provider 的智能路由、以及 Capability 的依赖治理。

**Superpower Phase 定位**：
```
Phase 3 Execution (v1.1.0) ──┐
    │ 产生执行数据            │
Phase 4 Memory (v1.2.0) ────┤
    │ 沉淀为记忆              │
Phase 5 Capability (v1.3.0-v1.4.0) ◄──┘  ★ 当前版本目标
    │ 治理与装配
    ▼
完整的 Harness 框架
```

---

## v1.4.0 与 v1.3.0 的关系

| 版本 | 核心功能 | 关系 |
|------|---------|------|
| v1.3.0 | Capability 基础（注册、发现、执行、治理） | 基础层 ✅ |
| v1.4.0 | Capability 高级（版本、路由、依赖） | 增强层 🆕 |

**v1.4.0 在 v1.3.0 基础上增加**：
- Skill 版本管理（多版本共存、平滑升级）
- Provider 智能路由（负载均衡、故障转移、性能优化）
- Capability 依赖治理（依赖图、循环检测、版本冲突解决）

---

## 核心功能

### 1. Skill 版本管理（Skill Versioning）

**目标**：支持 Skill 的多版本共存，实现平滑升级和回滚。

**功能清单**：
- 版本注册：同一 Skill 可注册多个版本
- 版本选择：根据 Capability 要求选择合适的 Skill 版本
- 平滑升级：支持蓝绿部署、金丝雀发布
- 版本回滚：快速回滚到上一稳定版本

**版本模型**：
```typescript
interface SkillVersion {
  skillId: string;
  version: string; // 语义化版本，如 "1.2.3"
  status: 'draft' | 'beta' | 'stable' | 'deprecated';
  
  // 版本能力声明
  capabilities: CapabilityDeclaration[];
  
  // 兼容性声明
  compatibility: {
    minRuntime: string;
    supportedPlatforms: string[];
    breaksIn: string[]; // 与哪些版本不兼容
  };
  
  // 灰度策略
  rollout: {
    strategy: 'all' | 'percentage' | 'whitelist';
    percentage?: number; // 百分比灰度
    whitelist?: string[]; // 白名单用户
  };
  
  createdAt: number;
  updatedAt: number;
}

// 版本选择器
class SkillVersionSelector {
  select(
    skillId: string,
    requirements: CapabilityRequirements,
    context: ExecutionContext
  ): SkillVersion {
    // 1. 获取所有可用版本
    const versions = this.registry.getVersions(skillId);
    
    // 2. 过滤符合要求的版本
    const compatible = versions.filter(v =>
      this.meetsRequirements(v, requirements) &&
      this.isCompatible(v, context)
    );
    
    // 3. 根据灰度策略选择
    return this.selectByRollout(compatible, context);
  }
}
```

### 2. Provider 智能路由（Provider Smart Routing）

**目标**：根据负载、性能、成本等因素，智能选择最优 Provider。

**功能清单**：
- 负载均衡：多 Provider 间分配请求
- 故障转移：Provider 故障时自动切换
- 性能优化：根据延迟、吞吐量选择 Provider
- 成本控制：根据预算选择性价比最高的 Provider

**路由模型**：
```typescript
interface ProviderRoutingStrategy {
  name: string;
  select(
    providers: Provider[],
    request: ExecutionRequest,
    context: RoutingContext
  ): Provider;
}

// 负载均衡策略
class LoadBalancingStrategy implements ProviderRoutingStrategy {
  name = 'load-balancing';
  
  select(providers, request, context): Provider {
    // 选择当前负载最低的 Provider
    return providers.reduce((best, current) =>
      current.metrics.load < best.metrics.load ? current : best
    );
  }
}

// 故障转移策略
class FailoverStrategy implements ProviderRoutingStrategy {
  name = 'failover';
  
  select(providers, request, context): Provider {
    // 按优先级排序，选择第一个健康的 Provider
    const healthy = providers.filter(p => p.health.status === 'healthy');
    return healthy[0] || providers[0]; // 如果没有健康的，返回第一个（可能失败）
  }
}

// 成本优化策略
class CostOptimizationStrategy implements ProviderRoutingStrategy {
  name = 'cost-optimization';
  
  select(providers, request, context): Provider {
    const budget = context.budget;
    
    // 在预算内选择性价比最高的
    const affordable = providers.filter(p =>
      p.pricing.estimate(request) <= budget
    );
    
    return affordable.reduce((best, current) =>
      current.metrics.performance / current.pricing.estimate(request) >
      best.metrics.performance / best.pricing.estimate(request)
        ? current
        : best
    );
  }
}

// 复合路由策略
class CompositeRoutingStrategy implements ProviderRoutingStrategy {
  name = 'composite';
  
  constructor(private strategies: ProviderRoutingStrategy[]) {}
  
  select(providers, request, context): Provider {
    // 根据上下文动态选择策略
    if (context.requirements.highAvailability) {
      return this.strategies.find(s => s.name === 'failover').select(providers, request, context);
    }
    
    if (context.budget) {
      return this.strategies.find(s => s.name === 'cost-optimization').select(providers, request, context);
    }
    
    // 默认负载均衡
    return this.strategies.find(s => s.name === 'load-balancing').select(providers, request, context);
  }
}
```

### 3. Capability 依赖治理（Capability Dependency Governance）

**目标**：管理 Capability 之间的依赖关系，解决版本冲突。

**功能清单**：
- 依赖图构建：分析 Capability 之间的依赖关系
- 循环检测：检测并解决循环依赖
- 版本冲突解决：处理 Capability 版本冲突
- 依赖升级：安全地升级 Capability 依赖

**依赖治理模型**：
```typescript
interface CapabilityDependency {
  capabilityId: string;
  versionRange: string; // 语义化版本范围，如 "^1.2.0"
  optional: boolean; // 是否为可选依赖
  devOnly: boolean; // 是否仅在开发时需要
}

interface CapabilityDependencyGraph {
  nodes: Map<string, CapabilityNode>;
  edges: Map<string, string[]>; // capabilityId -> 依赖的 capabilityIds
}

interface CapabilityNode {
  id: string;
  version: string;
  dependencies: CapabilityDependency[];
  dependents: string[]; // 哪些 Capability 依赖我
}

// 依赖治理器
class CapabilityDependencyGovernor {
  private graph: CapabilityDependencyGraph;
  
  // 构建依赖图
  buildGraph(capabilities: Capability[]): CapabilityDependencyGraph {
    const graph: CapabilityDependencyGraph = {
      nodes: new Map(),
      edges: new Map()
    };
    
    // 1. 创建节点
    for (const cap of capabilities) {
      graph.nodes.set(cap.id, {
        id: cap.id,
        version: cap.version,
        dependencies: cap.dependencies || [],
        dependents: []
      });
    }
    
    // 2. 建立边和反向依赖
    for (const cap of capabilities) {
      const deps = cap.dependencies || [];
      graph.edges.set(cap.id, deps.map(d => d.capabilityId));
      
      // 建立反向依赖
      for (const dep of deps) {
        const depNode = graph.nodes.get(dep.capabilityId);
        if (depNode) {
          depNode.dependents.push(cap.id);
        }
      }
    }
    
    this.graph = graph;
    return graph;
  }
  
  // 检测循环依赖
  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const dfs = (nodeId: string, path: string[]): void => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);
      
      const neighbors = this.graph.edges.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (recursionStack.has(neighbor)) {
          // 发现循环
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart).concat([neighbor]);
          cycles.push(cycle);
        }
      }
      
      recursionStack.delete(nodeId);
    };
    
    for (const nodeId of this.graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    }
    
    return cycles;
  }
  
  // 解决版本冲突
  resolveVersionConflicts(): Map<string, string> {
    const resolutions = new Map<string, string>();
    const conflicts = this.findVersionConflicts();
    
    for (const [capabilityId, versions] of conflicts) {
      // 使用语义化版本解析选择最优版本
      const resolvedVersion = this.selectBestVersion(versions);
      resolutions.set(capabilityId, resolvedVersion);
    }
    
    return resolutions;
  }
  
  // 安全升级依赖
  upgradeDependencies(
    capabilityId: string,
    targetVersions: Map<string, string>
  ): UpgradePlan {
    // 1. 分析影响范围
    const impact = this.analyzeUpgradeImpact(capabilityId, targetVersions);
    
    // 2. 制定升级计划
    const plan: UpgradePlan = {
      steps: [],
      rollbackPlan: [],
      verificationSteps: []
    };
    
    // 3. 按依赖拓扑排序执行
    const sortedCapabilities = this.topologicalSort(impact.affectedCapabilities);
    
    for (const cap of sortedCapabilities) {
      plan.steps.push({
        capabilityId: cap.id,
        fromVersion: cap.currentVersion,
        toVersion: targetVersions.get(cap.id),
        action: 'upgrade'
      });
    }
    
    return plan;
  }
  
  // 辅助方法：查找版本冲突
  private findVersionConflicts(): Map<string, string[]> {
    const conflicts = new Map<string, string[]>();
    const versionMap = new Map<string, Set<string>>();
    
    for (const [capabilityId, node] of this.graph.nodes) {
      for (const dep of node.dependencies) {
        if (!versionMap.has(dep.capabilityId)) {
          versionMap.set(dep.capabilityId, new Set());
        }
        versionMap.get(dep.capabilityId).add(dep.versionRange);
      }
    }
    
    for (const [capabilityId, versions] of versionMap) {
      if (versions.size > 1) {
        conflicts.set(capabilityId, Array.from(versions));
      }
    }
    
    return conflicts;
  }
  
  // 辅助方法：选择最优版本
  private selectBestVersion(versions: string[]): string {
    // 使用语义化版本比较，选择满足所有约束的最高版本
    // 简化实现：返回最高版本
    return versions.sort((a, b) => {
      // 语义化版本比较逻辑
      const parse = (v: string) => v.split('.').map(Number);
      const [aMajor, aMinor, aPatch] = parse(a);
      const [bMajor, bMinor, bPatch] = parse(b);
      
      if (aMajor !== bMajor) return bMajor - aMajor;
      if (aMinor !== bMinor) return bMinor - aMinor;
      return bPatch - aPatch;
    })[0];
  }
  
  // 辅助方法：分析升级影响
  private analyzeUpgradeImpact(
    capabilityId: string,
    targetVersions: Map<string, string>
  ): UpgradeImpact {
    const affected = new Set<string>();
    const visit = (id: string) => {
      if (affected.has(id)) return;
      affected.add(id);
      
      const node = this.graph.nodes.get(id);
      if (node) {
        for (const dependent of node.dependents) {
          visit(dependent);
        }
      }
    };
    
    visit(capabilityId);
    
    return {
      affectedCapabilities: Array.from(affected).map(id => this.graph.nodes.get(id)),
      breakingChanges: [], // 分析破坏性变更
      incompatibleDependencies: [] // 分析不兼容依赖
    };
  }
  
  // 辅助方法：拓扑排序
  private topologicalSort(capabilities: CapabilityNode[]): CapabilityNode[] {
    const sorted: CapabilityNode[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();
    
    const visit = (node: CapabilityNode) => {
      if (temp.has(node.id)) {
        throw new Error(`Circular dependency detected at ${node.id}`);
      }
      if (visited.has(node.id)) return;
      
      temp.add(node.id);
      
      for (const dep of node.dependencies) {
        const depNode = this.graph.nodes.get(dep.capabilityId);
        if (depNode) visit(depNode);
      }
      
      temp.delete(node.id);
      visited.add(node.id);
      sorted.push(node);
    };
    
    for (const cap of capabilities) {
      if (!visited.has(cap.id)) {
        visit(cap);
      }
    }
    
    return sorted;
  }
}

// 类型定义补充
interface UpgradePlan {
  steps: UpgradeStep[];
  rollbackPlan: RollbackStep[];
  verificationSteps: VerificationStep[];
}

interface UpgradeStep {
  capabilityId: string;
  fromVersion: string;
  toVersion: string;
  action: 'upgrade' | 'downgrade' | 'replace';
}

interface RollbackStep {
  capabilityId: string;
  targetVersion: string;
  backupData: string;
}

interface VerificationStep {
  type: 'health_check' | 'smoke_test' | 'integration_test';
  command: string;
  expectedResult: string;
}

interface UpgradeImpact {
  affectedCapabilities: (CapabilityNode | undefined)[];
  breakingChanges: BreakingChange[];
  incompatibleDependencies: IncompatibleDependency[];
}

interface BreakingChange {
  capabilityId: string;
  changeType: 'api_change' | 'behavior_change' | 'removal';
  description: string;
  migrationGuide: string;
}

interface IncompatibleDependency {
  capabilityId: string;
  requiredVersion: string;
  actualVersion: string;
  conflictType: 'version_mismatch' | 'circular_dependency' | 'missing_dependency';
}

interface CapabilityNode {
  id: string;
  version: string;
  dependencies: CapabilityDependency[];
  dependents: string[];
}

interface CapabilityDependency {
  capabilityId: string;
  versionRange: string;
  optional: boolean;
}
```

---

## 与 v1.3.0 的关系

```
v1.3.0 (Capability 基础)
│
├─ SkillRegistry ───────────────────┐
├─ ProviderRegistry ────────────────┤
├─ CapabilityRegistry ──────────────┤
├─ CapabilityGovernor ──────────────┤
├─ CapabilitySandbox ───────────────┤
├─ CapabilityExecution ───────────┤
└─ CapabilityEvents ────────────────┘
          │
          ▼ 增强为
          │
v1.4.0 (Capability 高级)
│
├─ SkillVersioning ◄── 新增 ★
├─ ProviderRouting ◄── 新增 ★
└─ DependencyGovernance ◄── 新增 ★
```

**v1.4.0 在 v1.3.0 基础上增强**：

| v1.3.0 基础功能 | v1.4.0 增强功能 | 增强点 |
|----------------|----------------|--------|
| Skill 注册/发现 | **Skill 版本管理** | 多版本共存、平滑升级、版本回滚 |
| Provider 注册/选择 | **Provider 智能路由** | 负载均衡、故障转移、性能优化 |
| Capability 依赖声明 | **Capability 依赖治理** | 依赖图、循环检测、版本冲突解决 |

---

## 前置依赖

| 依赖 | 来源 | 说明 |
|------|------|------|
| v1.3.0 Capability 基础 | v1.3.0 | 必须有 SkillRegistry、ProviderRegistry、CapabilityRegistry 才能增强 |
| v1.1.0 Execution 数据 | v1.1.0 | 用于分析 Provider 性能和故障模式 |
| v1.2.0 Memory 数据 | v1.2.0 | 用于优化 Skill 版本选择和 Provider 路由 |

---

## 验收标准

### Skill 版本管理
- [ ] 同一 Skill 可注册多个版本
- [ ] 版本选择器根据 Capability 要求选择合适的 Skill 版本
- [ ] 灰度发布策略实现（百分比、白名单）
- [ ] 版本回滚机制实现
- [ ] 版本兼容性分析和冲突检测

### Provider 智能路由
- [ ] 负载均衡策略实现（轮询、加权、最少连接）
- [ ] 故障转移机制实现（健康检查、自动切换）
- [ ] 性能优化策略实现（延迟优先、吞吐量优先）
- [ ] 成本控制策略实现（预算约束、性价比优先）
- [ ] 复合路由策略（根据上下文动态选择）

### Capability 依赖治理
- [ ] 依赖图构建和可视化
- [ ] 循环依赖检测和报警
- [ ] 版本冲突检测和解决方案推荐
- [ ] 升级影响分析（影响范围、破坏性变更）
- [ ] 升级计划生成（拓扑排序、回滚策略）

### 综合验收
- [ ] Skill 多版本共存场景验证
- [ ] Provider 故障转移场景验证
- [ ] Capability 版本冲突解决场景验证
- [ ] 完整升级流程验证（从 v1.3.0 到 v1.4.0）

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| v1.3.0 Capability 基础不稳定 | 高 | 等待 v1.3.0 稳定后再启动 v1.4.0；预留适配层 |
| Skill 版本管理复杂性 | 高 | 从简单场景开始（单 Skill 双版本）；逐步增加复杂性 |
| Provider 路由算法效果不佳 | 中 | 预留人工干预接口；持续优化算法；A/B 测试验证 |
| Capability 依赖图过于复杂 | 中 | 限制依赖层级；提供依赖优化建议；可视化辅助理解 |

---

## 附录：v1.3.0 → v1.4.0 升级指南

### 数据迁移

```typescript
// v1.3.0 Skill 数据迁移到 v1.4.0 版本化模型
async function migrateSkillToVersioned(skill: v13Skill): Promise<v14SkillVersion> {
  return {
    skillId: skill.id,
    version: '1.0.0', // 默认版本
    status: 'stable',
    capabilities: skill.capabilities,
    compatibility: {
      minRuntime: '1.0.0',
      supportedPlatforms: ['node', 'browser'],
      breaksIn: []
    },
    rollout: {
      strategy: 'all'
    },
    createdAt: skill.createdAt,
    updatedAt: Date.now()
  };
}

// v1.3.0 Provider 数据迁移到 v1.4.0 路由模型
async function migrateProviderForRouting(provider: v13Provider): Promise<v14Provider> {
  return {
    ...provider,
    routing: {
      enabled: true,
      strategies: ['load-balancing', 'failover'],
      healthCheck: {
        enabled: true,
        interval: 30000,
        timeout: 5000
      },
      failover: {
        maxRetries: 3,
        retryDelay: 1000,
        fallbackProvider: 'default'
      }
    },
    metrics: {
      ...provider.metrics,
      routingHistory: []
    }
  };
}
```

### 配置迁移

```yaml
# v1.3.0 configuration
capabilities:
  - id: code-review
    skill: code-review-skill
    provider: openai

# v1.4.0 configuration
capabilities:
  - id: code-review
    skill:
      id: code-review-skill
      version: '^2.0.0'  # 版本约束
      fallbackVersion: '1.5.0'  # 回退版本
    provider:
      routing:
        strategy: 'smart'  # 智能路由
        strategies:
          - 'load-balancing'
          - 'failover'
          - 'cost-optimization'
        healthCheck:
          enabled: true
        failover:
          maxRetries: 3
```

---

**确认：v1.4.0 文档已完成，定义了 Skill 版本管理、Provider 智能路由、Capability 依赖治理三个核心功能，以及与 v1.3.0 的关系。**