# v1.4.2 — 版本/Contract 关系治理

> 状态: 设计中
> 前置: v1.4.0
> 后置: v1.5.0
> 类型: Platform Task（治理迭代）

## 背景

在当前 `docs/versions/` 和 `docs/contracts/` 两个目录的审查中发现以下问题：

1. **双向链路断裂**：只有 38% 的 contract 声明了版本号，只有 15% 的 version README 反向引用了 contract
2. **状态三层打架**：`versions/README.md` 总表、子目录 README、tasks.md 三者状态互相矛盾
3. **幽灵版本**：v1.3.9 在总表中标记完成但目录不存在，v1.3.8 只存在于 contract 头部
4. **Contract 状态无受控词汇**：`in_progress` / `in-progress` / `draft (待确认)` 混用
5. **文档密度严重不均**：v1.4.0 有 5 个文件 ~5000+ 行，部分版本只有 1 个文件
6. **废弃目录未清理**：v1.4.0-archived/ 仍留在树中

## 核心目标

不引入新功能，纯粹治理 `docs/versions/` 和 `docs/contracts/` 的关系，建立可维护的双向追溯链路。

## 治理原则

> **版本和 contract 之间只需要一条双向链路：contract 声明 version，version 列出 contract。** 这条链路目前是断的，补上之后其他问题自然消解。

## 功能清单

### 1. Contract 规范化
- [ ] Contract frontmatter 增加必填 `version` 字段
- [ ] Contract 状态统一为受控词汇：`draft / confirmed / in_progress / review_pending / completed`
- [ ] 补齐现有 contract 的 version 字段（活跃 contract）
- [ ] 关闭已完成但状态未更新的 contract（v137-multi-techstack 等）

### 2. Version 反向引用
- [ ] 每个活跃 version 的 README 底部增加「关联 Contract」段落
- [ ] 列出所有服务于该版本的 contract 及其状态

### 3. 清理与一致化
- [ ] 删除 v1.4.0-archived/ 目录
- [ ] 为 v1.3.9 补最小目录（README 说明做了什么 + 关联 contract）
- [ ] 统一 versions/README.md 总表为唯一状态真相源
- [ ] 修正子目录 README 中与总表矛盾的状态描述

### 4. v1.4.0 文档精简
- [ ] 合并 `scenario-analysis.md` 和 `business-scenarios.md`
- [ ] `change-impact-map.md` 与 `design.md` 去重
- [ ] 目标：从 5 个文件精简到 3 个

### 5. 规则沉淀
- [ ] 在 CLAUDE.md 中增加 contract 创建/结项规则
- [ ] Contract 状态必须在受控词汇集合内
- [ ] 版本结项时必须检查关联 contract 全部 completed

## 不做

- 不给已结项的老版本（v1.1.0 ~ v1.3.0）补 contract 反向链接
- 不给未声明版本的老 contract 补 version 字段
- 不建自动化校验脚本（那是 Phase 2/3 的事）
- 不改变现有 API 或业务逻辑
- 不动 `sessions/` 目录结构

## 验收标准

- [ ] 所有活跃 contract 的 `version` 字段非空
- [ ] 所有 contract 的 `status` 在受控词汇集合内
- [ ] 所有活跃 version README 底部有关联 Contract 列表
- [ ] v1.4.0-archived/ 已删除
- [ ] v1.3.9 目录存在且有关联 contract
- [ ] versions/README.md 与子目录 README 状态一致
- [ ] v1.4.0 文档从 5 个精简到 ≤3 个
- [ ] CLAUDE.md 包含 contract 创建/结项规则
- [ ] 无 CRITICAL 或 HIGH 级别的遗漏

## 关联 Contract

> 本版本将通过以下 contract 落地（设计完成后创建）

| Contract | 范围 | 状态 |
|----------|------|------|
| (待创建) | Contract 规范化 + 受控词汇 | — |
| (待创建) | 清理与一致化 | — |
| (待创建) | v1.4.0 文档精简 | — |
| (待创建) | CLAUDE.md 规则沉淀 | — |

---

*创建于: 2026-05-11*
