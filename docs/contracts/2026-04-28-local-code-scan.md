# Contract: 本地代码扫描评审（v1.5.0）

> 创建日期: 2026-04-28
> 状态: draft
> 类型: Business Task（功能扩展）
> 关联版本: v1.3.0 前置能力

---

## 背景与目标

当前系统完全依赖 GitLab MR URL 获取代码 diff。用户计划将 CodeReview 部署到**局域网服务器**，需要支持**不经过 GitLab**直接扫描本地代码仓库进行评审。

**核心价值**：在内网/离线环境下，仍然可以进行高质量的 AI 代码评审。

---

## 范围定义

### 做（In Scope）

1. **方案一：本地源码扫描**（核心）
   - 服务端配置本地代码仓库路径映射（project → local path）
   - API 接收 `sourceBranch` + `targetBranch` + `project`
   - 在本地仓库执行 `git diff target..source` 提取变更
   - 分析变更文件，自动发现关联文件（import 链、同模块、同目录）
   - 将 diff + 关联文件上下文打包为评审输入
   - 复用现有 LLM 评审 pipeline（classify → review → merge）
   - 输出与现有 GitLab 模式一致的 ReviewReport

2. **方案二：无源码模式**（降级方案）
   - 用户直接上传 diff/patch 文件
   - 或用户粘贴 diff 文本
   - 系统解析 diff 提取变更文件列表
   - 无关联文件上下文（或用户提供）
   - 仅对 diff 本身进行评审

3. **关联文件发现算法**（方案一关键）
   - 静态分析变更文件的 import/require 链
   - 识别同模块/同目录的相关文件
   - 识别接口定义与实现的跨文件关联
   - 控制关联文件数量上限（避免 token 爆炸）

### 不做（Out of Scope）

- 不实现完整的 CLI 工具（保留到 v1.3.0）
- 不实现 IDE 集成/LSP（保留到 v1.3.0）
- 不实现批量多项目扫描（保留到 v1.3.0）
- 不做自动 `git clone`（要求仓库已存在于服务器指定路径）
- 不做代码执行/动态分析（纯静态扫描）

---

## 用户流程

### 方案一：本地源码扫描

```
用户 → POST /api/review/local
  {
    "project": "my-project",
    "sourceBranch": "feature/login",
    "targetBranch": "main",
    "includeRelatedFiles": true,  // 是否包含关联文件上下文
    "relatedFileDepth": 1         // 关联层级：1=直接依赖，2=间接依赖
  }

服务端 →
  1. 查配置: project "my-project" → /data/repos/my-project
  2. cd /data/repos/my-project
  3. git fetch origin
  4. git diff origin/main...origin/feature/login → 获取 diff
  5. 解析变更文件列表
  6. 对每个变更文件分析关联文件（AST 解析 import）
  7. 读取关联文件完整内容（非 diff，作为上下文）
  8. 组装评审输入: diff + 关联文件内容
  9. 走现有 classify → review pipeline
  10. 返回 ReviewReport
```

### 方案二：无源码（上传 diff）

```
用户 → POST /api/review/diff
  {
    "project": "my-project",
    "diffText": "...",
    "fileName": "changes.patch"
  }

服务端 →
  1. 解析 diffText 提取变更文件列表
  2. 无关联文件上下文（或仅使用 project 的 Knowledge）
  3. 走现有 review pipeline（跳过 classify 或简化 classify）
  4. 返回 ReviewReport
```

---

## 技术方案

### 新增模块

```
src/server/services/local-scan/
├── git-diff.ts          # git diff 提取与解析
├── related-finder.ts    # 关联文件发现（AST 分析）
├── context-builder.ts   # 评审上下文组装（diff + 关联文件）
└── index.ts

src/server/routes/
├── review-local.ts      # POST /api/review/local
└── review-diff.ts       # POST /api/review/diff

src/server/config/
└── repo-mapping.ts      # project → local path 映射配置
```

### 关联文件发现算法

```typescript
// 输入: 变更文件列表 + 仓库路径
// 输出: 每个变更文件的关联文件列表

function findRelatedFiles(
  changedFiles: string[],
  repoPath: string,
  depth: number = 1
): Map<string, string[]> {
  // 1. AST 解析每个变更文件，提取:
  //    - import/from 语句
  //    - require() 调用
  //    - 同目录下的 index.ts/index.js
  //    - 同模块的其他文件（根据项目结构推断）

  // 2. 反向查找: 哪些文件 import 了变更文件
  //    （需要预构建或按需扫描）

  // 3. 控制上限: 每个变更文件最多 N 个关联文件
  //    按关联强度排序（直接 import > 同目录 > 同模块）
}
```

### 数据流

```
+-------------+     +----------------+     +------------------+
| 用户请求    | --> | LocalScanner   | --> | GitDiffExtractor |
| (branch对)  |     |                |     |                  |
+-------------+     +----------------+     +------------------+
                                                    |
+----------------+     +----------------+          v
| ReviewPipeline | <-- | ContextBuilder | <-- 变更文件列表
| (现有)         |     | (diff+关联)    |          |
+----------------+     +----------------+          v
                                          +------------------+
                                          | RelatedFinder    |
                                          | (AST 分析)       |
                                          +------------------+
```

---

## Grading Criteria

| 维度 | 权重 | 通过标准 |
|------|------|----------|
| **功能完整** | 30% | `/api/review/local` 和 `/api/review/diff` 均可完整走通评审流程 |
| **关联文件发现** | 25% | 能正确识别 import 链关联，误报率 < 20% |
| **代码质量** | 15% | 函数 < 50 行，文件 < 800 行，错误处理完整 |
| **测试覆盖** | 15% | 新增代码测试覆盖率 ≥ 80%，包含 mock git 仓库的集成测试 |
| **向后兼容** | 15% | 现有 GitLab MR 评审流程不受影响 |

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 大仓库 git diff 很慢 | 高 | 支持增量扫描，限制 diff 大小 |
| AST 解析语言覆盖不全 | 中 | 优先支持 TS/JS，其他语言fallback到正则匹配 |
| 关联文件过多导致 token 超限 | 高 | 硬上限控制 + 按关联强度截断 |
| 本地仓库路径配置错误 | 低 | 启动时校验路径有效性 |
| 无源码模式评审质量下降 | 中 | 明确提示用户"缺少上下文，评审可能不全面" |

---

## 文件影响范围

### 新增文件
- `src/server/services/local-scan/` (4 个文件)
- `src/server/routes/review-local.ts`
- `src/server/routes/review-diff.ts`
- `src/server/config/repo-mapping.ts`

### 修改文件
- `src/server/index.ts` - 注册新路由
- `src/shared/types.ts` - 新增 LocalReviewRequest, DiffReviewRequest
- `src/server/services/classifier.ts` - 适配无 GitLab meta 的场景

### 不修改
- `src/server/services/reviewer.ts` - 复用现有评审逻辑
- `src/server/llm/` - 复用现有 LLM 调用
- `src/server/routes/review.ts` - 现有 GitLab 流程不动

---

## 验收 Checklist

- [ ] `/api/review/local` 能成功评审本地仓库的 branch diff
- [ ] `/api/review/diff` 能成功评审用户上传的 patch
- [ ] 关联文件发现能正确识别 import 依赖
- [ ] Token 预算不超出现有限制
- [ ] 现有 GitLab 评审流程不受影响
- [ ] 测试覆盖率 ≥ 80%

---

*Contract 状态: draft → 待用户确认*
