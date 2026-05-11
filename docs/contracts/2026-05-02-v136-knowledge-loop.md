# Contract: v1.3.6 — 知识库闭环修复

> 日期: 2026-05-02
> 状态: completed
> 类型: Business Task
> 版本: v1.3.6

## 背景

v1.2.0 实现了知识库精准召回和沉淀机制（6 层注入、指纹去重、命中追踪），v1.3.0 实现了本地扫描评审。但实际评审 R-67a18418 显示：**知识库注入为空，评审后无沉淀**。

## 问题

3 个独立断层：

1. **知识全卡 TEMP**：5 条知识从未 CONFIRMED，而查询要求 CONFIRMED → 召回 0 条
2. **本地路由缺闭环**：review-local.ts 和 review-diff.ts 缺少 extractLearnings / trackKnowledgeHits / determineAdoptedKnowledge
3. **Prompt 无评分标准**：8 个维度只有名字，AI 凭自身理解评分，不可复现

## 范围

### 做
- 确认/清理现有知识条目
- review-local.ts 补全知识闭环（load + learn + track）
- review-diff.ts 补全知识闭环
- Prompt 增加 8 维度评分标准 + 风险级别指导语
- 知识自动确认规则（confidence > 0.7 AND hit_count >= 2）

### 不做
- 不改 classifier.ts
- 不改前端
- 不改 MR 评审路由（已有闭环）
- 不改 harness 框架本身

## 验收标准

- [ ] 评审时 system_prompt 包含知识库内容（非空）
- [ ] 评审后 knowledge_entries 表有新沉淀
- [ ] review_knowledge_usage 表有命中记录
- [ ] 8 个维度有明确的 1-5 分评分规则
- [ ] S/A 级有具体检查清单
- [ ] TEMP → CONFIRMED 自动确认规则生效

## 任务

| 编号 | 任务 | 依赖 |
|------|------|------|
| 136-01 | 种子数据确认 | - |
| 136-02 | review-local 知识闭环 | 136-01 |
| 136-03 | review-diff 知识闭环 | 136-01 |
| 136-04 | Prompt 评分标准 + 风险指导 | - |
| 136-05 | 知识自动确认规则 | 136-02, 136-03, 136-04 |
| 136-06 | 端到端验证 | 136-05 |
