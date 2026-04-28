# v1.2.0 - Knowledge 精准召回与评审质量提升

> 版本周期: 待定（依赖 v1.1.5 完成）
> 状态: 待规划
> 前置: v1.1.5（用户管理与 Knowledge 审核流程）
> 后置: v1.2.5（Harness 侧 Memory 系统）

## 版本目标

强化现有 Knowledge 系统，提升 AI 评审的精准度和一致性。

**核心思路**：不另起一套记忆系统，而是把现有 `knowledge_entries` + `buildKnowledgePrompt()` + `getKnowledgeForReview()` 做得更精准。

```
v1.1.x（现有）
    │ Knowledge 基础：CRUD、分层注入、extractLearnings
    │ 问题：召回靠项目名匹配、无置信度、沉淀无生命周期
    ▼
v1.2.0（本版本）
    │ Knowledge 精准化：代码模式匹配、置信度评分、自动沉淀+生命周期
    │ 评审质量提升：更精准的注入、质量可量化
    ▼
v1.2.5（Harness 侧）
    │ Memory 分层系统（session/task/project/validated）
    │ 消费 Execution 数据，桥接到 Knowledge
```

---

## 现有实现盘点

| 模块 | 已有 | 差距 |
|------|------|------|
| Knowledge 召回 | `getKnowledgeForReview()` 按 project + type 6层注入 | 召回靠 project 名精确匹配，无代码模式/语义匹配 |
| Knowledge 注入 | `buildKnowledgePrompt()` 按类型格式化 | 注入长度控制粗放（行数限制），无优先级排序 |
| Knowledge 沉淀 | `extractLearnings()` 从评审结果提取 | 只提取低分维度+高危 issue，无置信度，无生命周期 |
| Knowledge 生命周期 | status: TEMP → CONFIRMED → DEPRECATED | 无 TTL、无 confidence、无自动归档 |
| 评审质量 | 有评分维度和分数 | 无一致性测试、无 A/B 对比 |

---

## 核心功能

### 1. Knowledge 精准召回

**目标**：评审时召回更相关的 Knowledge，减少无关注入。

| 优化维度 | 当前（v1.1.x） | 目标（v1.2.0） |
|---------|---------------|---------------|
| 匹配方式 | project 名精确匹配 | project + 代码模式匹配 + 语义相似度 |
| 召回排序 | 按层级固定顺序 | 按相关性评分排序 |
| 注入控制 | 行数硬限制 2000 行 | Token 预算 + 优先级截断 |
| 命中追踪 | `hit_count++` | 命中+反馈闭环（是否采纳建议） |

**关键改动**：

```
getKnowledgeForReview(project, module?)
  ↓ 增加
  - 代码模式匹配（AP.pattern 对变更文件匹配）
  - 语义相似度（title/content 与变更描述比较）
  - 按相关性评分排序
  - Token 预算控制（而非行数）
```

### 2. Knowledge 自动沉淀增强

**目标**：从评审结果更精准地沉淀 Knowledge，带置信度和生命周期。

| 优化维度 | 当前（v1.1.x） | 目标（v1.2.0） |
|---------|---------------|---------------|
| 提取范围 | 低分维度 + CRITICAL/HIGH issue | 增加重复模式合并、代码模式归纳 |
| 置信度 | 无 | 新增 `confidence` 字段（0-1） |
| 去重 | 无 | 新增 `fingerprint` 字段，相似条目合并 |
| 生命周期 | 手动 CONFIRMED/DEPRECATED | 增加 TTL、自动归档、confidence 衰减 |

**关键改动**：

```
extractLearnings(report, project, reviewId)
  ↓ 增加
  - 指纹去重（相似 issue 不重复创建 AP）
  - confidence 计算（基于 issue 严重度 + 代码路径匹配度）
  - 已有相似 AP 时 MERGE 而非新建
  - 评审确认后提升 confidence
```

### 3. 评审 Prompt 增强

**目标**：更精准的 Knowledge 注入，减少噪声，提升评审一致性。

| 优化维度 | 当前（v1.1.x） | 目标（v1.2.0） |
|---------|---------------|---------------|
| Prompt 构建 | 固定格式按类型分段 | 按相关性动态构建，高置信度优先 |
| 上下文理解 | 只注入项目 Knowledge | 增加变更文件路径匹配的精准 Knowledge |
| 注入位置 | Prompt 尾部固定段 | 按评审阶段分层注入（通用规则 → 项目约定 → 文件特定） |
| 反馈闭环 | 无 | 评审结果反馈到 Knowledge 命中率 |

### 4. 评审质量可量化

**目标**：建立评审质量基线，持续追踪改进。

| 指标 | 度量方式 | 目标 |
|------|---------|------|
| 评审一致性 | 同一 MR 多次评审结果的一致度 | > 85% |
| Knowledge 命中率 | 评审中采纳 Knowledge 建议的比例 | > 30% |
| 误报率 | 被标记为误报的 issue 比例 | < 15% |
| 沉淀质量 | 新沉淀 Knowledge 被后续评审命中的比例 | > 20% |

---

## 与 v1.2.5 的边界

| 职责 | v1.2.0（CodeReview 侧） | v1.2.5（Harness 侧） |
|------|------------------------|---------------------|
| 存储位置 | `knowledge_entries` 表 | `sessions/memory/` 文件系统 |
| 数据来源 | 评审结果（LLM 产出） | Execution 数据（Run/Repair/Checkpoint） |
| 核心能力 | 精准召回、自动沉淀、评审增强 | 3 层记忆、跨会话恢复、记忆升级 |
| 服务对象 | LLM 评审 MR | AI agent 编排 |
| 用户价值 | 评审更准、更一致 | AI 编排更智能、上下文不丢失 |

---

## 验收标准

### Knowledge 精准召回
- [ ] 代码模式匹配召回实现（AP.pattern 对变更文件匹配）
- [ ] 相关性评分排序实现
- [ ] Token 预算控制替代行数限制
- [ ] 命中反馈闭环

### Knowledge 自动沉淀增强
- [ ] 指纹去重（相似 issue 合并）
- [ ] confidence 字段和计算
- [ ] MERGE 而非重复创建
- [ ] 评审确认提升 confidence

### 评审 Prompt 增强
- [ ] 按相关性动态构建 Prompt
- [ ] 变更文件路径精准匹配
- [ ] 评审结果反馈到命中率

### 评审质量可量化
- [ ] 评审一致性 > 85%
- [ ] Knowledge 命中率 > 30%
- [ ] 误报率 < 15%
- [ ] 对比数据可呈现

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 语义匹配准确率低 | 中 | 先做代码模式精确匹配作为 baseline，语义匹配做增量 |
| Token 预算控制影响评审质量 | 中 | 保留行数限制作为 fallback，逐步切到 Token 控制 |
| 指纹去重误合并 | 高 | 去重前展示给用户确认，低置信度不自动合并 |
| 评审一致性测试数据不足 | 中 | 先用历史 MR 做回放测试，积累 baseline |

---

*最后更新: 2026-04-28*
