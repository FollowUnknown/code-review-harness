# v1.3.7 — 多技术栈评审

> 状态: ⚪ 待规划
> 前置: v1.3.6
> 后置: v1.4.0

## 背景

v1.3.6 真实 MR 验证暴露了 3 层差距（详见 [gap-analysis](../v1.3.6/gap-analysis.md)）：

1. **维度错配**：Java 后端项目 `do1cloud-form` 用了前端维度集（Vue 2 / qiqiao），9 维中 6 维"不适用"打 5 分
2. **知识库空白**：无 Java 后端知识库，注入的全是 Vue 2 反模式，LLM 无后端工程参考
3. **评审深度不足**：AI 只发现 NPE 和测试覆盖，遗漏架构师发现的 4 个问题（数据结构、根因分析、注释风格、可观测性）

## 目标

让 AI 评审能识别项目技术栈，选择匹配的维度集和知识库，达到接近架构师的评审深度。

## 范围

### 做

1. **技术栈推断**：基于 diff 文件扩展名统计推断技术栈（.java → Java 后端，.vue → Vue 前端）
2. **Java 后端维度集**：数据结构选择、算法复杂度、异常处理、并发安全、日志与可观测性、代码可维护性、根因分析、测试覆盖
3. **Java 后端知识库种子**：AP-JAVA（反模式）、CONV-JAVA（约定）、EXP-JAVA（经验）
4. **维度匹配改造**：`getDimensionsForProject` → 先按技术栈选维度集，再按 project 细分
5. **知识召回改造**：`getKnowledgeForReview` 增加技术栈维度过滤

### 不做

- 不改 classifier.ts（风险分级逻辑不变）
- 不改前端维度集和知识库（已验证有效）
- 不改 MR 审查路由流程

## 验收标准

- [ ] Java 后端项目评审时使用 Java 后端维度集（非前端维度）
- [ ] Java 后端项目评审时注入后端知识库内容
- [ ] 对 R-2e98011c 同一 MR 重新评审，能发现 ≥3/4 个架构师发现的问题
- [ ] 前端项目评审不受影响（回归测试通过）

## 任务（待拆解）

| 编号 | 任务 | 依赖 |
|------|------|------|
| 137-01 | 技术栈推断模块（classifier 扩展或独立模块） | - |
| 137-02 | Java 后端维度集 + 评分标准 | - |
| 137-03 | Java 后端知识库种子（AP/CONV/EXP） | 137-02 |
| 137-04 | 维度匹配改造（技术栈优先） | 137-01, 137-02 |
| 137-05 | 知识召回改造（技术栈过滤） | 137-01, 137-03 |
| 137-06 | 端到端验证（同一 MR 对比） | 全部 |
| 137-07 | Java 后端关联文件发现（related-finder/symbol-extractor/context-extractor 改造） | 137-01 |

## 详细设计

### 137-07: Java 后端关联文件发现

当前 `local-scan/` 下三个模块仅支持前端技术栈：

| 模块 | 前端局限 | Java 需要的改造 |
|------|----------|----------------|
| `related-finder.ts` | grepSymbol 仅搜 `.ts/.tsx/.js/.vue` | 增加 `.java` 扩展名搜索 |
| `related-finder.ts` | findImporters 匹配 ESM `from` 导入 | 增加 Java `import cn.com.do1...` 模式 |
| `symbol-extractor.ts` | extractChangedSymbols 仅匹配前端模式 | 增加 Java class/interface/method 声明提取 |
| `symbol-extractor.ts` | classifyFile 无 Java 分类 | 增加 Controller/Service/Mapper/Entity/DTO/Config 分类 |
| `context-extractor.ts` | Vue 特定逻辑，Java 文件截断到 300 行 | 增加 Java 上下文提取（类签名、方法签名） |

**Java 关联文件链**：
```
Controller → Service(Interface) → ServiceImpl → Mapper/DAO → Entity/DTO
```

**改动范围**：仅 `src/server/services/local-scan/` 下三个文件，不影响评审路由和 Prompt 逻辑。

## 文档

| 文件 | 内容 |
|------|------|
| [gap-analysis](../v1.3.6/gap-analysis.md) | 差距分析与建设方案（v1.3.6 产出） |
