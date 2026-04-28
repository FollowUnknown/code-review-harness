# 代码评审改进计划

> 创建时间: 2026-04-26
> 状态: draft
> 基于: Harness Phase 2 编排 + V2 平台化架构

---

## 背景与目标

### 当前现状

V2 平台化升级已完成 Phase 1-4：
- ✅ 用户系统（登录/注册/权限）
- ✅ 评审数据持久化（列表/详情/继续评审）
- ✅ 评审存档（Review Plan + 批量评审）
- ✅ LLM 模块抽离 + Prompt 管理

**活跃任务（待开展）**：
- TASK-002: OpenCodeServer 本地源码扫描（第二期）
- TASK-003: 前端组件测试补充
- TASK-004: 用户管理模块（管理员邀请/角色/列表）

### 核心问题

当前代码评审流程存在以下痛点：

1. **评审粒度粗**: 仅支持文件级风险分级，缺乏函数/代码块级分析
2. **问题追踪弱**: Issue 展示刚完成优化，但缺少与代码位置的精准关联
3. **知识沉淀难**: Knowledge 提取后，与 Issue 的映射关系需手动维护
4. **评审标准不一**: 不同项目/团队对 "好代码" 的定义差异大，缺乏可配置维度
5. **增量评审局限**: 仅支持 commit 维度的增量，不支持函数/模块级增量

### 改进目标

基于 Harness Phase 2 双轨编排 + Contract 状态机，实现：

1. **精细化评审**: 支持函数/类级别的风险识别和问题定位
2. **智能化关联**: Issue ↔ Knowledge ↔ Code 自动关联图谱
3. **标准化评审**: 可配置的多维度评分体系（团队/项目级别）
4. **增量化追踪**: 支持函数/模块级的增量评审和演进追踪
5. **自动化工作流**: 评审 → Knowledge 提取 → 下次评审自动注入 闭环

---

## 总体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Code Review Improvement                         │
├─────────────────────────────────────────────────────────────────────────┤
│  精细化评审        智能化关联        标准化评审        增量化追踪         │
│  ├─ AST解析       ├─ 知识图谱       ├─ 维度配置      ├─ 函数级diff      │
│  ├─ 函数级分析    ├─ 自动关联       ├─ 评分模板      ├─ 演进追踪        │
│  └─ 精准定位      └─ 闭环注入       └─ 团队标准     └─ 趋势分析        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Harness Phase 2 双轨编排层                              │
├─────────────────────────────────────────────────────────────────────────┤
│  Business Task (代码评审改进)         │  Platform Task (评审框架升级)   │
│  ├─ 多维评分体系实现                  │  ├─ AST 解析服务模块化          │
│  ├─ Issue-Knowledge 关联图谱          │  ├─ 知识图谱存储与查询          │
│  ├─ 增量评审追踪                      │  ├─ 评审维度配置服务            │
│  └─ 评审报告可视化                    │  └─ 函数级 diff 引擎            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Contract 状态机                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  draft → confirmed → in_progress → review_pending → completed           │
│              ↑__________________________________________↓               │
│                           (评审不通过回退)                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 阶段规划

### Phase 1: 精细化评审基础（2 周）

**目标**: 建立 AST 解析 + 函数级分析能力

#### 1.1 AST 解析服务

```typescript
// src/server/services/ast-parser.ts
export interface ASTParseResult {
  filePath: string;
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust';
  functions: FunctionInfo[];
  classes: ClassInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  complexity: CyclomaticComplexity;
}

export interface FunctionInfo {
  name: string;
  startLine: number;
  endLine: number;
  params: ParameterInfo[];
  returnType?: string;
  async: boolean;
  complexity: number;
  dependencies: string[]; // 调用的其他函数
}
```

**技术选型**:
- TypeScript/JavaScript: `@typescript/typescript` 或 `ts-morph`
- Python: `ast` 标准库或 `astroid`
- Go: `go/ast` 标准库
- Rust: `syn` crate（通过 WASM 或子进程）

#### 1.2 函数级风险分析

```typescript
// src/server/services/function-analyzer.ts
export interface FunctionRisk {
  functionName: string;
  filePath: string;
  lineRange: [number, number];
  riskLevel: 'S' | 'A' | 'B' | 'C';
  riskFlags: RiskFlag[];
  metrics: FunctionMetrics;
}

export interface FunctionMetrics {
  cyclomaticComplexity: number; // 圈复杂度
  cognitiveComplexity: number;  // 认知复杂度
  linesOfCode: number;
  parameterCount: number;
  nestedDepth: number;
  exitPoints: number;
}

export type RiskFlag = 
  | 'high_complexity'      // 复杂度 > 10
  | 'too_many_params'      // 参数 > 5
  | 'deep_nesting'          // 嵌套 > 4
  | 'long_function'         // 行数 > 50
  | 'multiple_return'       // 多个返回点
  | 'async_complexity'      // 异步嵌套
  ;
```

#### 1.3 与现有评审流程集成

```typescript
// src/server/services/review-enhancer.ts
export async function enhanceReviewWithAST(
  reviewInput: ReviewInput,
  diffs: GitLabDiff[]
): Promise<EnhancedReviewInput> {
  const astResults = await Promise.all(
    diffs
      .filter(d => isCodeFile(d.new_path))
      .map(d => parseAST(d.new_path, d.diff))
  );
  
  const functionRisks = analyzeFunctionRisks(astResults);
  
  // 将函数级风险注入 prompt
  const enhancedPrompt = buildEnhancedPrompt(reviewInput, functionRisks);
  
  return {
    ...reviewInput,
    astAnalysis: astResults,
    functionRisks,
    enhancedPrompt,
  };
}
```

**完成标准**:
- [ ] AST 解析服务支持 TypeScript/JavaScript/Python
- [ ] 函数级风险分析（复杂度、参数、嵌套等）
- [ ] AST 分析结果注入评审 prompt
- [ ] 测试覆盖率 ≥ 80%

---

### Phase 2: 智能化关联（2 周）

**目标**: 建立 Issue-Knowledge-Code 关联图谱

#### 2.1 知识图谱存储

```typescript
// src/server/services/knowledge-graph.ts
export interface KnowledgeNode {
  id: string;
  type: 'issue' | 'knowledge' | 'code_location' | 'file' | 'function';
  content: string;
  metadata: Record<string, unknown>;
  embedding?: number[]; // 向量嵌入，用于相似度搜索
}

export interface KnowledgeEdge {
  id: string;
  from: string;
  to: string;
  type: 'located_at' | 'related_to' | 'extracted_from' | 'similar_to';
  weight: number; // 关联强度
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}
```

**存储方案**:
- 主存储: SQLite（当前）/ MySQL（Phase 5）
- 向量索引: 使用 `sqlite-vec`（SQLite 扩展）或外接 Pinecone/Milvus（后期）
- 图查询: 使用 Cypher 语法子集或自定义查询 DSL

#### 2.2 自动关联引擎

```typescript
// src/server/services/association-engine.ts
export interface AssociationRule {
  id: string;
  name: string;
  condition: (context: AssociationContext) => boolean;
  action: (context: AssociationContext) => Promise<AssociationResult>;
  priority: number;
}

export interface AssociationContext {
  issue?: ReviewIssue;
  knowledge?: KnowledgeEntry;
  codeLocation?: CodeLocation;
  review?: ReviewRecord;
  diff?: GitLabDiff;
}

// 内置关联规则
export const defaultAssociationRules: AssociationRule[] = [
  {
    id: 'issue-to-knowledge',
    name: 'Issue 自动提取 Knowledge',
    condition: (ctx) => !!ctx.issue && ctx.issue.severity === 'CRITICAL',
    action: async (ctx) => {
      // 自动将 CRITICAL issue 转为 Knowledge
      const knowledge = await extractKnowledgeFromIssue(ctx.issue!);
      return { type: 'knowledge_created', knowledge };
    },
    priority: 100,
  },
  {
    id: 'similar-issue-cluster',
    name: '相似 Issue 聚类',
    condition: (ctx) => !!ctx.issue,
    action: async (ctx) => {
      // 基于 embedding 查找相似 issue
      const similarIssues = await findSimilarIssues(ctx.issue!.message);
      return { type: 'similar_issues_found', issues: similarIssues };
    },
    priority: 80,
  },
  {
    id: 'knowledge-injection',
    name: 'Knowledge 自动注入',
    condition: (ctx) => !!ctx.review && !!ctx.diff,
    action: async (ctx) => {
      // 根据 diff 内容匹配相关 knowledge
      const relevantKnowledge = await findRelevantKnowledge(ctx.diff!);
      return { type: 'knowledge_injected', knowledge: relevantKnowledge };
    },
    priority: 90,
  },
];
```

#### 2.3 闭环工作流

```
评审 → Issue 发现 → Knowledge 提取 → 关联图谱 → 下次评审自动注入
     ↑________________________________________________________↓
```

**实现步骤**:
1. 评审完成时，遍历所有 Issue
2. CRITICAL/HIGH 级别 Issue 自动触发 Knowledge 提取
3. 建立 Issue → Knowledge → Code Location 的关联边
4. 下次评审前，根据待评审代码的文件/函数路径，查询图谱
5. 将相关 Knowledge 自动注入 prompt

**完成标准**:
- [ ] Knowledge 图谱存储（节点 + 边 + 向量索引）
- [ ] 自动关联引擎（规则配置 + 执行）
- [ ] 闭环工作流（Issue → Knowledge → 自动注入）
- [ ] 测试覆盖率 ≥ 80%

---

### Phase 3: 标准化评审（1 周）

**目标**: 可配置的多维度评分体系

#### 3.1 评审维度配置服务

```typescript
// src/server/services/dimension-service.ts
export interface DimensionSet {
  id: string;
  name: string;
  project: string | null; // null 表示全局默认
  dimensions: ReviewDimension[];
  focusAreas: FocusArea[];
  isDefault: boolean;
}

export interface ReviewDimension {
  id: string;
  name: string;
  description: string;
  weight: number; // 0-1，所有维度权重之和 = 1
  criteria: ScoringCriterion[];
  prompt: string; // 该维度的专用 prompt 片段
}

export interface ScoringCriterion {
  score: 1 | 2 | 3 | 4 | 5;
  description: string;
  examples?: string[];
}

export interface FocusArea {
  id: string;
  name: string;
  description: string;
  applicableFiles: string[]; // glob 模式，如 "src/pay/**/*.ts"
  extraPrompt: string;
}
```

#### 3.2 预设维度模板

```typescript
// src/server/services/dimension-templates.ts

export const defaultDimensionSets: DimensionSet[] = [
  {
    id: 'default-backend',
    name: '后端服务默认维度',
    project: null,
    isDefault: true,
    dimensions: [
      {
        id: 'correctness',
        name: '正确性',
        description: '代码逻辑是否正确，是否处理了边界情况',
        weight: 0.3,
        criteria: [
          { score: 5, description: '逻辑完全正确，边界条件全覆盖，有防御性编程' },
          { score: 3, description: '逻辑基本正确，主要边界已处理' },
          { score: 1, description: '逻辑错误明显，或未处理基本边界' },
        ],
        prompt: '重点关注：边界条件、空值处理、异常分支、并发安全',
      },
      {
        id: 'maintainability',
        name: '可维护性',
        description: '代码是否易于理解和维护',
        weight: 0.25,
        criteria: [
          { score: 5, description: '命名精准，结构清晰，单一职责，圈复杂度低' },
          { score: 3, description: '命名基本准确，结构合理，偶有冗长函数' },
          { score: 1, description: '命名混乱，结构混乱，上帝类/超长函数' },
        ],
        prompt: '重点关注：命名语义、函数长度、类职责、依赖关系',
      },
      {
        id: 'testability',
        name: '可测试性',
        description: '代码是否易于测试，测试是否完善',
        weight: 0.2,
        criteria: [
          { score: 5, description: '依赖注入完善，Mock 友好，单元测试覆盖率高' },
          { score: 3, description: '基本可测，主要路径有测试' },
          { score: 1, description: '高度耦合，难以测试，或测试缺失' },
        ],
        prompt: '重点关注：依赖注入、全局状态、外部调用、测试覆盖率',
      },
      {
        id: 'security',
        name: '安全性',
        description: '代码是否存在安全风险',
        weight: 0.15,
        criteria: [
          { score: 5, description: '输入验证完备，无注入风险，敏感信息处理正确' },
          { score: 3, description: '无明显安全漏洞，常规防护到位' },
          { score: 1, description: '存在 SQL 注入、XSS、硬编码密钥等严重风险' },
        ],
        prompt: '重点关注：输入验证、SQL/命令注入、XSS、敏感信息、权限校验',
      },
      {
        id: 'performance',
        name: '性能',
        description: '代码是否存在性能问题',
        weight: 0.1,
        criteria: [
          { score: 5, description: '算法复杂度合理，无冗余计算，资源使用高效' },
          { score: 3, description: '性能可接受，无明显瓶颈' },
          { score: 1, description: '存在 N+1、循环查询、内存泄漏等严重问题' },
        ],
        prompt: '重点关注：时间/空间复杂度、N+1 查询、循环内的 IO、内存使用',
      },
    ],
    focusAreas: [
      {
        id: 'payment',
        name: '支付模块',
        description: '支付相关业务代码需额外关注幂等、事务、对账',
        applicableFiles: ['src/pay/**/*.ts', 'src/order/pay*.ts'],
        extraPrompt: '重点检查：幂等性（idempotency key）、分布式事务、金额计算精度、对账痕迹',
      },
      {
        id: 'auth',
        name: '认证授权',
        description: '登录、权限、Token 相关代码',
        applicableFiles: ['src/auth/**/*.ts', 'src/middleware/auth*.ts'],
        extraPrompt: '重点检查：JWT 安全、密码强度、Session 管理、权限绕过、CSRF',
      },
    ],
  },
];
```

#### 3.3 动态 Prompt 构建

```typescript
// src/server/llm/prompts/dynamic-review.ts
export function buildDynamicReviewPrompt(
  dimensionSet: DimensionSet,
  focusArea: FocusArea | null,
  context: ReviewPromptContext
): string {
  const dimensionPrompts = dimensionSet.dimensions
    .map(d => `
## ${d.name}（权重 ${Math.round(d.weight * 100)}%）
${d.description}

评分标准：
${d.criteria.map(c => `- ${c.score}分: ${c.description}`).join('\n')}

评审要点：
${d.prompt}
`)
    .join('\n---\n');

  const focusPrompt = focusArea ? `
## 专项关注领域：${focusArea.name}
${focusArea.description}

额外检查项：
${focusArea.extraPrompt}
` : '';

  return `
你是一位专业的代码评审专家。请对以下代码变更进行多维度评审。

# 评审维度

${dimensionPrompts}

${focusPrompt}

# 待评审代码

${context.diffText}

# 输出格式

请以 JSON 格式输出评审结果：

\`\`\`json
{
  "dimensions": [
    {
      "dimensionId": "correctness",
      "score": 4,
      "comment": "逻辑正确，但边界处理可以更完善"
    }
  ],
  "overallScore": 4.2,
  "issues": [
    {
      "severity": "HIGH",
      "message": "支付回调缺少幂等校验",
      "file": "src/pay/callback.ts",
      "line": 42,
      "function": "handlePaymentCallback",
      "dimensionId": "security",
      "suggestion": "使用 redis 分布式锁或数据库唯一索引实现幂等"
    }
  ],
  "summary": "总体代码质量良好，但支付模块需要加强安全校验"
}
\`\`\`
`;
}
```

**完成标准**:
- [ ] 维度配置服务（CRUD + 模板管理）
- [ ] 预设模板（后端/前端/算法）
- [ ] 动态 Prompt 构建 + 测试
- [ ] 测试覆盖率 ≥ 80%

---

### Phase 4: 增量化追踪与闭环（2 周）

**目标**: 函数级增量评审 + 评审 → Knowledge → 自动注入闭环

#### 4.1 函数级 Diff 引擎

```typescript
// src/server/services/function-diff.ts
export interface FunctionDiff {
  type: 'added' | 'removed' | 'modified';
  functionName: string;
  filePath: string;
  before?: FunctionInfo;
  after?: FunctionInfo;
  changes: CodeChange[];
  impact: ImpactAnalysis;
}

export interface ImpactAnalysis {
  callers: string[]; // 哪些函数调用了此函数
  callees: string[]; // 此函数调用了哪些函数
  globalState: string[]; // 修改了哪些全局/模块级状态
  externalCalls: string[]; // 外部 API/DB 调用
  risk: 'high' | 'medium' | 'low';
}

export async function analyzeFunctionDiff(
  oldCommit: string,
  newCommit: string,
  repoPath: string
): Promise<FunctionDiff[]> {
  // 1. 获取两个 commit 的文件树
  // 2. 对每对文件进行 AST 解析
  // 3. 对比函数级别差异
  // 4. 分析影响范围（调用图分析）
  // 5. 返回带影响分析的 FunctionDiff[]
}
```

#### 4.2 评审 → Knowledge 自动提取

```typescript
// src/server/services/auto-knowledge-extraction.ts
export interface KnowledgeExtractionResult {
  extractedKnowledge: KnowledgeEntry[];
  associations: Association[];
  confidence: number;
}

export async function autoExtractKnowledgeFromReview(
  review: ReviewRecord,
  options: ExtractionOptions = {}
): Promise<KnowledgeExtractionResult> {
  const results: KnowledgeExtractionResult = {
    extractedKnowledge: [],
    associations: [],
    confidence: 0,
  };

  for (const issue of review.report.issues) {
    // 规则 1: CRITICAL 自动提取为 RULE
    if (issue.severity === 'CRITICAL') {
      const knowledge = await createRuleFromIssue(issue, review);
      results.extractedKnowledge.push(knowledge);
      results.associations.push({
        from: { type: 'issue', id: issue.id },
        to: { type: 'knowledge', id: knowledge.id },
        type: 'extracted_from',
      });
    }

    // 规则 2: 高频 Issue 自动聚类提取
    const similarIssues = await findSimilarIssuesInHistory(issue);
    if (similarIssues.length >= 3) {
      const knowledge = await createPatternFromIssues([issue, ...similarIssues]);
      results.extractedKnowledge.push(knowledge);
    }

    // 规则 3: 业务名词自动识别（BN）
    const businessNouns = extractBusinessNouns(issue.message);
    for (const noun of businessNouns) {
      if (await isNewBusinessNoun(noun, review.project)) {
        const knowledge = await createBusinessNoun(noun, review);
        results.extractedKnowledge.push(knowledge);
      }
    }
  }

  results.confidence = calculateExtractionConfidence(results);
  return results;
}
```

#### 4.3 Knowledge 自动注入闭环

```typescript
// src/server/services/auto-knowledge-injection.ts
export interface KnowledgeInjectionContext {
  reviewId: string;
  project: string;
  files: string[];
  functions?: string[]; // 如果是函数级评审
}

export async function autoInjectKnowledge(
  context: KnowledgeInjectionContext
): Promise<InjectedKnowledge[]> {
  const injected: InjectedKnowledge[] = [];

  // 1. 基于文件路径匹配
  const fileBasedKnowledge = await knowledgeGraph.findByFilePaths(context.files);
  injected.push(...fileBasedKnowledge.map(k => ({
    ...k,
    injectionReason: `文件路径匹配: ${k.sourceFiles?.join(', ')}`,
    relevanceScore: calculateFileRelevance(k, context.files),
  })));

  // 2. 基于函数名匹配（函数级评审时）
  if (context.functions) {
    const functionBasedKnowledge = await knowledgeGraph.findByFunctionNames(
      context.functions
    );
    injected.push(...functionBasedKnowledge.map(k => ({
      ...k,
      injectionReason: `函数名匹配`,
      relevanceScore: 0.9, // 函数名匹配得分高
    })));
  }

  // 3. 基于语义相似度（向量搜索）
  const codeEmbedding = await generateCodeEmbedding(context.files);
  const similarKnowledge = await knowledgeGraph.findByEmbedding(
    codeEmbedding,
    { threshold: 0.8, limit: 5 }
  );
  injected.push(...similarKnowledge.map(k => ({
    ...k,
    injectionReason: `语义相似度: ${(k.similarity! * 100).toFixed(1)}%`,
    relevanceScore: k.similarity!,
  })));

  // 去重并按相关性排序
  return dedupeAndSortByRelevance(injected);
}
```

**完成标准**:
- [ ] 函数级 Diff 引擎（影响分析）
- [ ] 自动 Knowledge 提取（规则引擎）
- [ ] Knowledge 自动注入闭环（文件/函数/语义匹配）
- [ ] 测试覆盖率 ≥ 80%

---

### Phase 5: 整合测试与上线（1 周）

**目标**: 集成测试、性能优化、文档完善

#### 5.1 集成测试

```typescript
// tests/integration/review-improvement.test.ts
describe('代码评审改进完整流程', () => {
  it('应完成从代码提交到 Knowledge 注入的完整闭环', async () => {
    // 1. 准备测试代码（含已知问题）
    const testCode = createTestCodeWithIssues();
    
    // 2. 执行 AST 解析
    const astResult = await astParser.parse(testCode);
    expect(astResult.functions).toHaveLength(3);
    
    // 3. 执行函数级风险分析
    const risks = await functionAnalyzer.analyze(astResult);
    expect(risks.some(r => r.riskLevel === 'S')).toBe(true);
    
    // 4. 执行评审（注入 AST 分析结果）
    const review = await reviewService.review({
      ...baseOptions,
      astAnalysis: astResult,
      functionRisks: risks,
    });
    
    // 5. 验证 Knowledge 自动提取
    const extracted = await autoKnowledgeExtraction.extract(review);
    expect(extracted.extractedKnowledge.length).toBeGreaterThan(0);
    
    // 6. 验证下次评审 Knowledge 自动注入
    const nextReviewContext = {
      project: review.project,
      files: review.files,
    };
    const injected = await autoKnowledgeInjection.inject(nextReviewContext);
    expect(injected.some(k => 
      extracted.extractedKnowledge.some(e => e.id === k.id)
    )).toBe(true);
  });
});
```

#### 5.2 性能基准

| 指标 | 目标 | 测试方法 |
|------|------|----------|
| AST 解析速度 | < 100ms/文件 | 100 个文件批量解析 |
| 函数级分析速度 | < 50ms/文件 | 复杂文件（>50 函数）|
| Knowledge 检索速度 | < 200ms | 1000 条 Knowledge 库 |
| 端到端评审延迟 | 增加 < 20% | 对比优化前的完整评审 |

#### 5.3 文档清单

- [ ] `docs/architecture/code-review-improvement.md` - 架构设计文档
- [ ] `docs/standards/dimension-definition.md` - 评审维度定义规范
- [ ] `docs/guides/knowledge-management.md` - Knowledge 管理操作指南
- [ ] `docs/api/ast-parser.md` - AST 解析服务 API 文档
- [ ] `docs/api/knowledge-graph.md` - 知识图谱 API 文档

**完成标准**:
- [ ] 集成测试通过率 100%
- [ ] 性能基准全部达标
- [ ] 文档完整性检查通过
- [ ] 无 CRITICAL/HIGH 审查问题

---

## 与现有活跃任务的整合

### TASK-002: OpenCodeServer 本地源码扫描（第二期）

**整合点**:
- Phase 1 的 AST 解析服务可作为 OpenCodeServer 的基础能力
- 函数级风险分析结果可接入 OpenCodeServer 的扫描报告
- 扫描发现的 Issue 自动进入 Knowledge 提取流程

**协作方式**:
```
OpenCodeServer 扫描 → AST 解析 → 函数级风险分析 → Issue 发现
                              ↓
                    自动 Knowledge 提取 → 关联图谱
                              ↓
                    下次 OpenCodeServer 扫描自动注入 Knowledge
```

### TASK-003: 前端组件测试补充

**整合点**:
- Phase 3 的标准化评审维度包含 "可测试性" 维度
- 组件测试覆盖率可作为评审自动检查项
- Knowledge 库中积累 "组件测试最佳实践"

**协作方式**:
```
组件代码评审 → AST 分析组件结构 → 识别测试缺口
                    ↓
              自动建议测试用例模板（来自 Knowledge）
                    ↓
              评审报告包含 "可测试性" 评分 + 改进建议
```

### TASK-004: 用户管理模块（管理员邀请/角色/列表）

**整合点**:
- Phase 2 的 Knowledge 图谱需要用户管理作为权限基础
- 评审维度配置需要区分管理员/普通用户权限
- 邀请流程中的 Knowledge 分享机制

**协作方式**:
```
用户管理模块提供：
- 管理员可配置团队级评审维度
- 普通用户继承团队维度，可创建个人维度
- Knowledge 分享权限控制（团队/公开/私有）
```

---

## 风险与缓解

| 风险 | 影响 | 可能性 | 缓解措施 |
|------|------|--------|----------|
| AST 解析性能瓶颈 | 高 | 中 | 异步解析 + 缓存 + 增量更新 |
| 知识图谱查询慢 | 高 | 中 | 向量索引 + 分页 + 预计算热点 |
| Knowledge 提取准确率低 | 中 | 高 | 规则 + ML 混合，人工校验闭环 |
| 多维度评审 prompt 过长 | 中 | 中 | 动态裁剪低权重维度 |
| 与活跃任务冲突 | 中 | 低 | 每周同步会，接口预先定义 |

---

## 成功指标

### 技术指标

| 指标 | 基线 | 目标 | 测量方式 |
|------|------|------|----------|
| 函数级问题定位准确率 | 0% | > 85% | 人工标注样本对比 |
| Knowledge 自动提取采纳率 | 0% | > 70% | 用户确认数 / 提取总数 |
| 评审报告有用性评分 | 3.5/5 | > 4.2/5 | 用户反馈问卷 |
| 平均评审时间 | 15min | < 10min | 从提交到报告生成 |

### 业务指标

| 指标 | 基线 | 目标 | 测量方式 |
|------|------|------|----------|
| 评审发现严重问题数 | - | +30% | 对比优化前后 |
| Knowledge 复用率 | 0% | > 50% | 注入次数 / 评审次数 |
| 评审维度配置使用率 | 0% | > 80% | 使用自定义维度的项目数 |

---

## 下一步行动

1. **本周**: 完成 Phase 1 详细设计评审，确定 AST 解析库选型
2. **下周**: 启动 Phase 1 开发，同步与 TASK-002/003/004 的接口定义
3. **每两周**: 进度同步会，检查与活跃任务的整合状态
4. **Phase 1 结束**: 内部试用，收集反馈调整 Phase 2 优先级

---

## 附录

### A. 术语表

| 术语 | 定义 |
|------|------|
| AST | Abstract Syntax Tree，抽象语法树 |
| Knowledge | 从评审中提取的可复用知识（BN/RULE/TERM） |
| 关联图谱 | Issue/Knowledge/Code 的关联关系图 |
| 评审维度 | 代码评审的评分维度（如正确性、可维护性）|
| 闭环 | 评审 → Knowledge → 下次评审自动注入的流程 |

### B. 参考文档

- [Harness Framework Design](./2026-04-22-harness-framework-design.md)
- [V2 Platform Upgrade Contract](../../contracts/2026-04-23-v2-platform-upgrade.md)
- [Knowledge Platform Design](./2026-04-23-knowledge-platform-design.md)
- [Session Mechanism Design](./2026-04-22-session-mechanism-design.md)

---

*文档版本: 1.0*
*最后更新: 2026-04-26*
