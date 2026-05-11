# v1.4.1 — Bugfix & UX 补全

> 状态: ✅ 完成
> 前置: v1.4.0
> 后置: v1.4.2

## 背景

v1.4.0 初版上线后，实际使用中暴露出若干问题：需求评审页面空白崩溃、字段映射不匹配、缺少操作指引等。本版本集中修复。

## 核心修复

- RequirementReviewPage 字段映射崩溃（`totalDiffChars` vs `totalTokens` 不匹配）
- 需求评审流程 UX 改进
- 评审页面增加操作指南
- 产品线页面项目路径可编辑 + 校验

## 关联 Contract

| Contract | 日期 | 状态 | 范围 |
|----------|------|------|------|
| [2026-05-11-fix-requirement-page-crash](../../contracts/2026-05-11-fix-requirement-page-crash.md) | 2026-05-11 | confirmed | 需求评审页面崩溃修复 |

## 提交

| Commit | 内容 |
|--------|------|
| `d7060e1` | fix: requirement review page crash and UX improvements |
| `5f5234a` | feat(v1.4.0): add operation guide to review pages |
| `e739ad2` | feat(v1.4.0): product line page - editable project path with verify |

---

*创建于: 2026-05-11（补记）*
