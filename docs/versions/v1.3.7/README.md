# v1.3.7 — 多技术栈评审

> 状态: ✅ 完成
> 前置: v1.3.6
> 后置: v1.4.0

## 背景

v1.3.6 真实 MR 验证暴露了 3 层差距（详见 [gap-analysis](../v1.3.6/gap-analysis.md)）：

1. **维度错配**：Java 后端项目 `do1cloud-form` 用了前端维度集（Vue 2 / qiqiao），9 维中 6 维"不适用"打 5 分
2. **知识库空白**：无 Java 后端知识库，注入的全是 Vue 2 反模式，LLM 无后端工程参考
3. **评审深度不足**：AI 只发现 NPE 和测试覆盖，遗漏架构师发现的 4 个问题（数据结构、根因分析、注释风格、可观测性）

## 目标

让 AI 评审能识别项目技术栈，选择匹配的维度集和知识库，达到接近架构师的评审深度。

## 已完成

### 核心任务
- [x] 137-01: 技术栈推断模块（`techstack.ts`，基于 diff 文件扩展名统计）
- [x] 137-02: Java 后端维度集 + 评分标准（9 维度 1-5 分规则 + 密钥管理）
- [x] 137-03: Java 后端知识库种子（10 AP + 5 CONV + 5 EXP = 20 条）
- [x] 137-04: 维度匹配改造（技术栈优先，`getDimensionsForProject` 增加 `techStack` 参数）
- [x] 137-05: 知识召回改造（3 层技术栈知识注入：AP/CONV/EXP layer 2b/3b/4b）
- [x] 137-07: Java 后端关联文件发现（grepSymbol/findImporters/extractExportsFromFile/extractChangedSymbols/classifyFile/extractFileContext 全部支持 Java）

### 额外修复
- [x] 单 batch LLM 失败不再中断整个 review（逐 batch try/catch + continue）
- [x] 失败 batch 在 review summary 中提示用户
- [x] Create Knowledge from Issue 按钮增加错误反馈（401/400 等显示具体错误）

## 验收结果

| 验收标准 | 结果 |
|----------|------|
| Java 后端项目评审时使用 Java 后端维度集 | ✅ `inferTechStack` → `java-backend` → 9 维 Java 维度集 |
| Java 后端项目评审时注入后端知识库内容 | ✅ 20 条 Java 知识（AP/CONV/EXP）注入 |
| Java 文件关联文件发现 | ✅ grep .java + Java import + Java symbol extraction |
| 前端项目评审不受影响 | ✅ 257 个测试全通过，前端走 `vue-frontend` 路径回退默认维度 |

## 详细设计

### 137-01: 技术栈推断

`src/server/services/techstack.ts` — `inferTechStack(filePaths: string[]): TechStack`

| 输入 | 输出 |
|------|------|
| .java ≥60% | `"java-backend"` |
| .vue/.ts/.tsx ≥60% | `"vue-frontend"` |
| 两者都有但 <60% | `"mixed"` |
| 无可分类文件 | `"unknown"` |

### 137-07: Java 后端关联文件发现

| 模块 | 改造内容 |
|------|---------|
| `related-finder.ts` | grepSymbol 增加 `.java`；findImporters 增加 Java `import` 模式；extractExportsFromFile 增加 Java class/method 模式 |
| `symbol-extractor.ts` | extractChangedSymbols 增加 Java class/interface/method/annotation 模式；classifyFile 增加 pom.xml/build.gradle/application.yml/`*Application.java` 分类 |
| `context-extractor.ts` | 新增 `extractJavaContext` — 保留 package/import/annotation/class/method 签名，去除方法体 |

### 维度匹配优先级

```
1. techStack 匹配（最高优先） → "java-backend" 维度集
2. project path 精确匹配
3. project path 前缀匹配
4. is_default=1 默认维度集
5. 空数组
```

### Java 后端维度集

| 维度 | 关键检查点 |
|------|-----------|
| 数据结构选择 | 集合类型匹配语义、泛型完整、DTO/VO/Entity 分层 |
| 算法复杂度 | 避免 O(n²)、N+1 查询、分页合理 |
| 异常处理 | 空 catch 块、cause 传递、try-with-resources |
| 并发安全 | SimpleDateFormat、@Transactional 边界、线程池 |
| 日志与可观测性 | System.out.println、敏感信息脱敏、traceId |
| 代码可维护性 | 方法 <30 行、类 <500 行、魔法值提取常量 |
| 根因分析 | 错误消息精确到字段、cause 不丢失 |
| 测试覆盖 | 核心 Service 有单测、边界条件覆盖 |
| 密钥管理 | 无硬编码密钥、走环境变量 |

## 关联 Contract

| Contract | 日期 | 状态 | 范围 |
|----------|------|------|------|
| [2026-05-06-v137-multi-techstack](../../contracts/2026-05-06-v137-multi-techstack.md) | 2026-05-06 | completed | v1.3.7 多技术栈评审 |

## 提交记录

| Commit | 内容 |
|--------|------|
| `c7e7cdd` | feat(v1.3.7): multi-techstack review — Java backend support |
| `46ba66d` | fix: single batch LLM failure no longer kills entire review |
| `b1e69f7` | fix: add error feedback to Create Knowledge from Issue button |
