# v1.3.0 - 本地工程扫描

> 版本周期: 待定（依赖 v1.2.0 完成）
> 状态: 待规划
> 前置: v1.2.0（AI 驱动评审质量）
> 后置: v2.0.0（知识图谱）

## 版本目标

支持扫描本地工程项目，不依赖 GitLab MR，直接对本地代码进行 AI 评审。为 v2.0.0 的知识图谱提供大规模数据基础。

## 核心功能

### 1. 本地代码扫描

**功能清单**:
- 指定本地目录进行扫描
- 支持 Git 仓库（读取 commit/diff）
- 支持非 Git 项目（直接扫描文件）
- 自定义扫描范围（文件模式、排除规则）
- 增量扫描（仅扫描变更文件）

**使用场景**:
```bash
# 扫描整个项目
$ code-review scan ./my-project

# 扫描特定目录
$ code-review scan ./my-project/src --include "**/*.ts" --exclude "**/*.test.ts"

# 扫描最近 3 个 commit
$ code-review scan ./my-project --git-last-commits 3

# 扫描工作区未提交变更
$ code-review scan ./my-project --git-uncommitted
```

**技术要点**:
- 文件遍历：glob 模式匹配
- Git 操作：simple-git 或 child_process 调用 git
- 增量检测：文件 mtime + git status
- 大项目优化：流式处理，避免内存溢出

### 2. IDE 集成基础

**功能清单**:
- LSP 协议适配（Language Server Protocol）
- 实时诊断推送（Diagnostics）
- 代码操作支持（Code Actions）
- 悬浮提示（Hover Information）

**支持 IDE**:
| IDE | 优先级 | 技术方案 |
|-----|--------|----------|
| VS Code | P0 | LSP + 官方扩展 API |
| JetBrains 系列 | P1 | LSP + 插件开发 |
| Vim/Neovim | P2 | LSP |

**LSP 能力**:
```typescript
// LSP Server 实现
interface CodeReviewLSPServer {
  // 文本同步
  onDidOpen(params: TextDocumentItem): void;
  onDidChange(params: DidChangeTextDocumentParams): void;
  onDidSave(params: TextDocumentIdentifier): void;
  
  // 诊断推送
  publishDiagnostics(uri: string, diagnostics: Diagnostic[]): void;
  
  // 代码操作
  onCodeAction(params: CodeActionParams): CodeAction[];
  
  // 悬浮提示
  onHover(params: HoverParams): Hover;
}

// 诊断转换
function convertReviewIssueToDiagnostic(issue: ReviewIssue): Diagnostic {
  return {
    range: {
      start: { line: issue.line - 1, character: 0 },
      end: { line: issue.line, character: 0 }
    },
    severity: convertSeverity(issue.severity),
    message: issue.message,
    source: 'code-review-ai',
    code: issue.dimensionId,
    relatedInformation: issue.suggestion ? [{
      location: { uri: issue.file, range: ... },
      message: `Suggestion: ${issue.suggestion}`
    }] : undefined
  };
}
```

### 3. 批量项目扫描

**功能清单**:
- 扫描多个项目（批量模式）
- 统一报告汇总
- 趋势分析（多轮扫描对比）
- 问题优先级排序

**适用场景**:
- 技术债盘点：扫描所有微服务，汇总技术债清单
- 安全审计：扫描所有项目，识别安全隐患
- 架构治理：检查架构规范遵守情况

**批量报告**:
```typescript
interface BatchScanReport {
  summary: {
    totalProjects: number;
    totalFiles: number;
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
  };
  projectReports: Array<{
    projectName: string;
    projectPath: string;
    issueCount: number;
    topIssues: ReviewIssue[];
    score: number;
  }>;
  trends?: Array<{
    scanTime: string;
    totalIssues: number;
    newIssues: number;
    resolvedIssues: number;
  }>;
}
```

### 4. 扫描配置管理

**配置项**:
```yaml
# .code-review.yml
scan:
  include:
    - "src/**/*.{ts,tsx,js,jsx}"
    - "lib/**/*.py"
  exclude:
    - "**/*.test.{ts,tsx}"
    - "**/node_modules/**"
    - "**/dist/**"
    - "**/.git/**"
  
  git:
    enabled: true
    scanLastCommits: 10
    scanUncommitted: true
    baseBranch: "main"
  
  limits:
    maxFiles: 1000
    maxFileSizeKB: 500
    maxTotalLines: 100000

review:
  dimensions:
    - correctness
    - maintainability
    - security
  
  ai:
    model: "claude-sonnet-4.6"
    temperature: 0.3
    maxRounds: 2
    context: full  # full | minimal
  
  knowledge:
    enabled: true
    injectRelated: true
    minRelevance: 0.7

report:
  format: markdown  # markdown | json | html
  output: ./reports
  includeDiff: true
  includeContext: true
```

**配置加载优先级**:
1. 命令行参数（最高优先级）
2. 项目级 `.code-review.yml`
3. 用户级 `~/.code-review/config.yml`
4. 系统默认值

## 与前后版本的关系

### 前置依赖（v1.2.0）
- **AI 评审能力**: v1.2.0 优化的 Prompt 和多轮交互直接用于本地扫描
- **上下文管理**: v1.2.0 的项目/文件上下文分析用于本地代码理解
- **评审维度**: v1.2.0 的维度配置复用到本地扫描

### 后置支撑（v2.0.0 知识图谱）
- **数据基础**: 大量本地扫描产生的 Issue/Knowledge 成为图谱节点
- **关系发现**: 跨项目扫描发现代码模式关联，构建图谱边
- **推理验证**: 图谱的推理结果通过本地扫描验证

## 技术架构

### 新增模块

```
src/server/scanner/
├── local/                     # 本地扫描
│   ├── file-scanner.ts       # 文件遍历
│   ├── git-scanner.ts        # Git 变更扫描
│   ├── increment-detector.ts # 增量检测
│   └── index.ts
├── lsp/                       # LSP 协议
│   ├── server.ts             # LSP Server
│   ├── handlers.ts           # 协议处理器
│   ├── diagnostics.ts        # 诊断管理
│   └── index.ts
├── batch/                     # 批量扫描
│   ├── batch-runner.ts       # 批量执行器
│   ├── report-aggregator.ts  # 报告聚合
│   └── trend-analyzer.ts     # 趋势分析
├── config/                    # 配置管理
│   ├── config-loader.ts      # 配置加载
│   ├── config-validator.ts   # 配置校验
│   └── schema.ts             # 配置 Schema
└── index.ts

src/client/
├── vscode-extension/          # VS Code 扩展（独立目录）
│   ├── package.json
│   ├── src/
│   │   ├── extension.ts
│   │   ├── lsp-client.ts
│   │   └── commands.ts
│   └── README.md
└── ...
```

### CLI 接口

```typescript
// CLI 命令定义
interface ScanCommand {
  command: 'scan';
  options: {
    path: string;                    // 扫描路径
    include?: string[];              // 包含模式
    exclude?: string[];              // 排除模式
    gitLastCommits?: number;         // Git 最近 N 个 commit
    gitUncommitted?: boolean;        // Git 未提交变更
    gitBaseBranch?: string;          // Git base branch
    output?: string;                 // 输出路径
    format?: 'markdown' | 'json' | 'html';
    config?: string;                 // 配置文件路径
    incremental?: boolean;           // 增量扫描
    verbose?: boolean;               // 详细输出
  };
}

// 使用示例
// code-review scan ./my-project --git-last-commits 5 --output ./reports
```

### 数据流

```
CLI / IDE / API
    ↓
Scanner Entry
    ↓
Config Loader（加载 .code-review.yml）
    ↓
File Scanner（遍历文件）/ Git Scanner（提取 diff）
    ↓
AI Reviewer（复用 v1.2.0 能力）
    ↓
Report Generator（生成报告）
    ↓
Output（本地文件 / IDE 诊断 / HTTP 响应）
```

## 验收标准

### 功能验收

| 模块 | 验收点 | 通过标准 |
|------|--------|----------|
| 本地扫描 | 文件遍历 | 正确识别 include/exclude 模式 |
| 本地扫描 | Git 集成 | 正确提取 commit diff |
| 本地扫描 | 增量扫描 | 仅扫描变更文件，速度提升 50%+ |
| IDE 集成 | LSP 协议 | VS Code 扩展可安装使用 |
| IDE 集成 | 实时诊断 | 保存文件后 3s 内显示诊断 |
| IDE 集成 | 悬浮提示 | 显示问题详情和建议 |
| 批量扫描 | 多项目 | 支持 10+ 项目批量扫描 |
| 批量扫描 | 趋势分析 | 可对比多轮扫描结果 |
| 配置管理 | 配置文件 | 支持 .code-review.yml |

### 性能验收

- [ ] 单文件扫描 < 2s（不含 AI 评审）
- [ ] AI 评审复用 v1.2.0 优化指标
- [ ] 1000 文件项目增量扫描 < 30s
- [ ] LSP 启动时间 < 5s

### 兼容性验收

- [ ] 支持 macOS/Linux/Windows
- [ ] 支持 Node.js 18/20/22
- [ ] 支持 Git 2.30+
- [ ] VS Code 1.80+

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LSP 协议复杂度高 | 中 | 使用成熟库（vscode-languageserver） |
| 大项目内存溢出 | 高 | 流式处理，分批提交 AI 评审 |
| 本地扫描性能差 | 中 | 增量扫描 + 并发控制 |
| 多 IDE 支持成本高 | 中 | 优先 VS Code，其他 IDE 社区贡献 |

---

## 与 v2.0.0 知识图谱的衔接

```
v1.3.0 本地扫描产生的数据:
├── 跨项目 Issue 模式
├── 代码依赖关系
├── 知识库条目
└── 评审历史记录
            ↓
    v2.0.0 知识图谱构建:
    ├── 节点: Issue / Knowledge / Code / Project
    ├── 边: 关联 / 相似 / 依赖 / 包含
    └── 推理: 模式发现 / 风险预测 / 知识推荐
            ↓
    反哺 v1.3.0 本地扫描:
    ├── 更精准的知识注入
    ├── 更智能的风险预测
    └── 更高效的评审推荐
```

---

*本文档为 v1.3.0 详细需求，确认后进入 Harness 执行阶段*