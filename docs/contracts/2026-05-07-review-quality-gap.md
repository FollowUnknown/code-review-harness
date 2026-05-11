# Contract: AI 评审质量提升 — 知识注入过滤 + 根因分析增强

> 日期: 2026-05-07
> 状态: completed
> 类型: Business Task
> 版本: v1.3.9

## 背景

架构师对 R-d8a62b89 (Java 后端代码) 做了人工评审，发现 AI 遗漏了一个"治标不治本"的根因问题。同时发现知识注入混乱 — Java 评审注入了大量 Vue 前端知识。

## 问题清单

### 问题 1：知识注入未按技术栈过滤

**现状**：Layer 1（Universal AP）无差别加载所有项目的 HIGH/CRITICAL 反模式。

| 项目 | AP 条数 | 技术栈 |
|------|---------|--------|
| qiqiao | 73 | Vue 前端 |
| qixi | 12 | Vue 前端 |
| java-backend | 8 | Java 后端 |
| shared | 6 | 通用 |
| do1cloud-form | 0 | Java 后端（无知识） |

Java 评审注入了 112 条知识，其中大部分是 Vue/前端相关，Java 后端知识被淹没。

**修复方案**：
- `knowledge.ts` Layer 1 改为：只加载 `shared` 通用 + 当前 techStack 匹配的 AP
- 其他 Layer（Layer 2-6）保持 project 级过滤不变
- 预期效果：Java 评审只看到 `shared`(6) + `java-backend`(8) ≈ 14 条相关知识

### 问题 2："根因分析"维度评分标准过窄

**现状**：AI 对根因分析的判断是 *"变更不涉及错误消息或异常抛出，无需根因分析"* — 只在出异常时才做根因分析。

**架构师的评审对比**：

| 维度 | AI | 架构师 |
|------|----|----|
| 根因分析 | 5/5 "无需根因分析" | 中 — 识别出"治标不治本" |
| 核心发现 | 缺少 debug 日志 (LOW) | 消费端去重而非源头去重 |
| 上下文需求 | 只看了 diff (L227-237) | 需要看 L206-223 数据构建过程 |

**修复方案**：
- 重写 `根因分析` 维度的评分标准（`defaults.ts` DIMENSION_CRITERIA）
- 从"有无异常"改为引导 AI 判断"修复是否解决根因"
- 新判定重点：变量命名、数据来源、上下游调用链
- 评分参考：5分=根因修复, 3分=症状修复但有注释说明, 1分=症状修复且未标注

### 问题 3：评审上下文不足（仅 diff）

**现状**：`review mode: diff_only`，AI 只看到变更行（L227-237），无法看到数据构建过程（L206-223），导致无法判断"治标vs治本"。

**修复方案**：
- 增加 `context_lines` 配置，评审时附带 diff 上下文（变更方法完整体或 ±30 行）
- 或增加 `method_level` review mode：解析 Java 方法边界，提供完整方法体
- 这是中长期改进，先不阻塞本次修复

## 优先级

1. **P0** — 问题 1：知识注入过滤（影响所有非前端项目的评审质量）
2. **P1** — 问题 2：根因分析维度重写（影响评审深度）
3. **P2** — 问题 3：评审上下文扩展（需较大改动，后续版本）

## 涉及文件

- `src/server/services/knowledge.ts` — Layer 1 过滤逻辑
- `src/server/llm/prompts/defaults.ts` — 根因分析评分标准
- `src/server/routes/review-local.ts` — 评审上下文（P2）

## 验收标准

1. Java 评审不再注入 QQ-*/QX-* 前端知识
2. 根因分析维度能识别"治标 vs 治本"模式
3. 现有前端项目评审不受影响

## 验证方案

使用实际 MR 重新评审，对比 AI 输出与架构师评审：

**验证用例**：
- MR: `fixbug-0011278-【运行平台】---聚合表触发同一条实例多次更新，导致提交失败` → `fixbug-4.0.5-0423`
- 项目: `do1cloud-form`
- 文件: `AggsDocumentChangeListener.java`
- 技术栈: Java 后端

**期望结果（架构师评审结论）**：
1. 知识注入：不应包含 QQ-*/QX-* 等 Vue 前端知识，应以 java-backend 和 shared 为主
2. 根因分析得分 ≤ 3 分（而非 5/5），comment 应提及"治标不治本"或"消费端去重而非源头去重"
3. 应产出至少一个 MEDIUM+ issue，指向根因问题：
   - 问题描述方向：修复在消费端增加去重，但根因是 aggsFormOldDataVersionList 构建过程中两个查询路径（aggsDocIds + getAggsFormDataWithDimension）可能返回重复 id
   - 建议方向：在 addAll 前基于 id 去重合并，从源头消除重复

**验证流程**：
1. 实施 P0 + P1 修复
2. 重启后端服务
3. 对同一 MR 重新发起评审
4. 检查新评审的：知识注入数量/来源、根因分析得分、issues 列表
5. 如验证不通过 → 分析差距 → 调整修复 → 重新验证
