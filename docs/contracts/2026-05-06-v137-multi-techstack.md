# Sprint Contract: v1.3.7 多技术栈评审

> 状态: completed
> 创建: 2026-05-06
> 版本: v1.3.7

## 目标

让 AI 评审能识别项目技术栈，选择匹配的维度集和知识库，达到接近架构师的评审深度。

## 范围

### 做

1. **137-01**: 技术栈推断模块 — 基于 diff 文件扩展名统计推断技术栈
2. **137-02**: Java 后端维度集 + 评分标准 — 8 维度 1-5 分规则
3. **137-03**: Java 后端知识库种子 — AP/CONV/EXP 种子数据
4. **137-04**: 维度匹配改造 — `getDimensionsForProject` 先按技术栈选维度集
5. **137-05**: 知识召回改造 — `getKnowledgeForReview` 增加技术栈维度过滤
6. **137-07**: Java 后端关联文件发现 — related-finder/symbol-extractor/context-extractor 改造

### 不做

- 不改 classifier.ts（风险分级逻辑不变）
- 不改前端维度集和知识库
- 不改 MR 审查路由流程
- 不改 UI（纯后端改动）

## 文件影响

| 文件 | 改动类型 |
|------|----------|
| `src/server/services/techstack.ts` | 新建 — 技术栈推断模块 |
| `src/server/llm/prompts/defaults.ts` | 修改 — 增加 Java 维度评分标准 |
| `src/server/services/dimensions.ts` | 修改 — 技术栈优先匹配 |
| `src/server/services/knowledge.ts` | 修改 — 技术栈过滤 |
| `src/server/db.ts` | 修改 — Java 维度集种子 |
| `src/server/services/local-scan/related-finder.ts` | 修改 — Java 支持 |
| `src/server/services/local-scan/symbol-extractor.ts` | 修改 — Java 符号提取 |
| `src/server/services/local-scan/context-extractor.ts` | 修改 — Java 上下文提取 |
| `scripts/seed-java-knowledge.ts` | 新建 — Java 知识库种子脚本 |
| `knowledge-base/java-backend.md` | 新建 — Java 知识库源文件 |

## 验收标准

- [ ] Java 后端项目评审时使用 Java 后端维度集
- [ ] Java 后端项目评审时注入后端知识库内容
- [ ] Java 文件能发现关联文件（Controller → Service → Mapper → Entity）
- [ ] 前端项目评审不受影响（回归测试通过）

## Grading Criteria

| 项目 | 标准 | 权重 |
|------|------|------|
| 技术栈推断准确性 | .java ≥60% → java-backend, .vue ≥60% → vue-frontend | 必须 |
| 维度匹配 | Java 项目不使用前端维度 | 必须 |
| 知识注入 | Java 项目注入 AP-JAVA/CONV-JAVA/EXP-JAVA | 必须 |
| 关联文件 | Java 文件间 import 链完整发现 | 必须 |
| 前端回归 | 前端项目评审结果不变 | 必须 |
