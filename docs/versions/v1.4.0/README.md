# v1.4.0 -- 按需求评审 + 产品线 + 多工程集成

> 状态: ✅ 已完成
> 前置: v1.3.9 (AST + knowledge improvements)
> 后置: v1.5.0
> 详细设计: [design.md](./design.md)

## 背景

实际评审场景中，一个产品需求通常跨 7-8 个后端项目（如 bpms-runtime + do1cloud-form + bpms-component）或多个前端项目。七巧是一个产品，不管前后端，所有工程归属同一个产品线。后端负责人需要看整个产品线所有项目的 commit diff，逐个文件标注问题。

当前系统只支持单项目评审，需要改为:
1. 支持按需求评审（一次评审覆盖多个项目，自动按技术栈分组）
2. 引入产品线概念（组织项目、共享知识）
3. 知识库按三层结构分层（基础 / 产品线 / 前后端逻辑）
4. 合并评审：前后端自动分组评审，合并为一份产品级报告
5. 跨项目依赖感知

## 核心目标

1. **合并评审** -- 用户选产品线 + 分支，系统自动扫描全部项目、按技术栈分组、独立评审、合并为产品级报告
2. **产品线管理** -- 项目按产品线归组，产品线级知识共享
3. **知识库三层结构** -- Layer 0 基础知识 / Layer 1 产品线知识 / Layer 2 前后端逻辑（+ 隐含 Layer 3 项目级）
4. **依赖感知** -- 改动被依赖项目时提示下游影响

## 功能清单

### 1. 产品线管理
- [ ] product_lines 表 + repo_mappings 扩展
- [ ] 产品线 CRUD API + 管理页面
- [ ] 快速导入: 输入目录前缀批量创建 repo_mapping 并关联产品线
- [ ] 产品线级维度集配置

### 2. 合并评审（按需求）
- [ ] 多项目并行 diff 扫描 (buildMultiProjectScanContext)
- [ ] 按技术栈自动分组 (techstack-grouper)
- [ ] 需求评审 SSE 路由 + job tracking
- [ ] 技术栈组报告 + 产品级报告合并
- [ ] 需求评审前端页面（按技术栈分组 tab 展示）
- [ ] 预扫描: 选择分支后显示各项目 diff 统计，可排除项目

### 3. 知识库三层结构改造
- [ ] knowledge_entries 增加 scope_level 字段 (foundation/product/integration/project)
- [ ] 数据迁移: 标注已有知识的 scope_level
- [ ] 改造 getKnowledgeForReview 为 KnowledgeQuery 接口
- [ ] 新增 preloadSharedKnowledge 共享知识缓存
- [ ] 删除硬编码 TECHSTACK_KNOWLEDGE_PROJECTS

### 4. 跨项目依赖感知
- [ ] project_dependencies 表 + CRUD
- [ ] Maven pom.xml 依赖扫描器
- [ ] 评审时注入依赖提示
- [ ] ReviewIssue 增加 crossProjectImpact 字段

### 5. 报告展示
- [ ] 需求评审报告类型支持 (TechStackGroupReport + RequirementReviewReport)
- [ ] 按技术栈分组 tab，组内按项目 tab
- [ ] 跨项目影响标注
- [ ] 跨技术栈问题汇总（前后端 API 不一致等）

## 验收标准
- [ ] 七巧产品线（前后端所有项目）可按需求评审，选择分支后自动检测有 diff 的项目
- [ ] 系统自动按技术栈分组（Java 后端一组、Vue 前端一组），各组独立评审
- [ ] 最终合并为一份"七巧产品需求评审报告"，包含跨技术栈问题汇总
- [ ] 知识按三层结构注入，合并评审下共享知识只加载一次
- [ ] 产品线管理页面可创建/编辑产品线，批量导入项目
- [ ] 依赖感知在改动公共 API 时给出下游影响提示
- [ ] 单项目评审流程（/local-review）不受影响，向后兼容

## 实施分阶段

| 阶段 | 内容 | 预计时间 |
|------|------|----------|
| Phase 1 | 数据模型 + 产品线基础 | 2 天 |
| Phase 2 | 知识库分层改造 | 2 天 |
| Phase 3 | 多项目扫描 + 需求评审 | 3 天 |
| Phase 4 | 跨项目依赖感知 | 1.5 天 |
| Phase 5 | 集成测试 + 验收 | 1.5 天 |
| **合计** | | **10 天** |

## 开放问题

第二轮讨论已解答 Q1-Q13。Q14 已实现，Q15-Q17 已确认不需要。

---

*第二轮讨论更新于: 2026-05-09*
*收工于: 2026-05-11*
