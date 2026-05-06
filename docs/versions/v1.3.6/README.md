# v1.3.6 — 知识库闭环 + 评审质量

> 状态: ✅ 完成
> 前置: v1.3.5
> 后置: v1.3.7

## 目标

修复知识库"写入但不读取"的断层，让评审真正消费和沉淀知识。

## 已完成

### 核心任务（Contract）
- [x] 136-01: 种子数据确认
- [x] 136-02: review-local 知识闭环（extract + adopt + track）
- [x] 136-03: review-diff 知识闭环
- [x] 136-04: Prompt 评分标准（8 维度 1-5 分规则 + 风险级别 checklist）
- [x] 136-05: 知识自动确认（confidence ≥ 0.7 AND hit_count ≥ 2）

### 技术债修复
- [x] computePassed 去重（extract isSecurityDimension + computePassed 辅助函数）
- [x] parseMarkdownReview 收紧（只匹配已知维度、修复 issue 正则）
- [x] seed 脚本安全检查（`NODE_ENV=production` 阻断）

### 真实 MR 验证发现 & 修复
- [x] GitLab 空 diff 恢复（raw file API 补全 88 个新文件）
- [x] callLLM 429/5xx 重试（3 次，指数退避 + Anthropic SDK 支持）
- [x] JSON 未转义引号恢复（fixUnescapedQuotes）
- [x] plans.ts 类型错误修复（`|| null` → `?? undefined`）

### Harness Hook 增强
- [x] PreToolUse: Contract + Session 强制检查（阻断型）
- [x] PostToolUse: src/ 编辑自动记录到 session 文件
- [x] Stop: 强制今日总结 + 自动 memory 快照

### 评审质量差距分析
- [x] 架构师 vs AI 评审对比（R-2e98011c）
- [x] gap-analysis.md 落盘 → 推进到 v1.3.7

## 验收结果

| 验收标准 | 结果 |
|----------|------|
| system_prompt 包含知识库内容 | ✅ 确认（R-2e98011c 有知识注入） |
| 评审后 knowledge_entries 有新沉淀 | ✅ extractLearnings 已接入所有路由 |
| review_knowledge_usage 有命中记录 | ✅ trackKnowledgeHits 含 adoptedIds |
| 8 个维度有 1-5 分评分规则 | ✅ DIMENSION_CRITERIA 覆盖所有维度 |
| S/A 级有具体检查清单 | ✅ RISK_CHECKLISTS 按 level 注入 |
| TEMP → CONFIRMED 自动确认 | ✅ confidence ≥ 0.7 AND hit_count ≥ 2 |

## 遗留问题（→ v1.3.7）

详见 [gap-analysis.md](./gap-analysis.md)。

1. **维度错配**：Java 后端项目用了前端维度集，需技术栈推断
2. **知识库空白**：无 Java 后端知识库，需建 AP-JAVA / CONV-JAVA / EXP-JAVA
3. **Hook 执行**：Contract 状态更新后才能编辑 src/，新会话需先建 session

## 文档

| 文件 | 内容 |
|------|------|
| [contract](../../contracts/2026-05-02-v136-knowledge-loop.md) | Sprint Contract（completed） |
| [gap-analysis.md](./gap-analysis.md) | 真实 MR 对比分析与 v1.3.7 建设方案 |

## 提交记录

| Commit | 内容 |
|--------|------|
| `662736a` | feat(v1.3.6): 知识闭环 + 评分标准 + 模块推断 |
| `15a3cab` | refactor: computePassed 去重 + knowledge tracking 修复 |
| `06073fe` | fix: 技术债 — 类型错误、markdown 解析、seed 安全 |
| `afe5406` | fix: GitLab 空 diff 恢复 |
| `a138d82` | fix: 429/5xx 重试 |
| `e96b48f` | fix: JSON 未转义引号恢复 |
