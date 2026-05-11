# v1.3.9 — AST 增强 + 知识库 UI + 工具链修复

> 状态: ✅ 完成
> 前置: v1.3.7
> 后置: v1.4.0
> 创建: 2026-05-11 (补建目录)

## 背景

继 v1.3.7 多技术栈评审后，v1.3.9 聚合了以下改进：
- AST 代码结构感知，增强评审上下文
- 知识库 UI 优化（DEPRECATED 恢复/删除、scope_level 过滤）
- LLM provider 自动检测
- Local Review Job 持久化（断线恢复）
- 开发工具链修复（predev 自动杀端口、Vite proxy 导出优化）
- AI 评审质量分析（知识注入过滤 + 根因分析增强）

## 关联 Contract

| Contract | 日期 | 状态 | 范围 |
|----------|------|------|------|
| [2026-05-07-local-review-job-persistence](../../contracts/2026-05-07-local-review-job-persistence.md) | 2026-05-07 | completed | Local Review Job 持久化，断线恢复 |
| [2026-05-07-predev-kill-ports](../../contracts/2026-05-07-predev-kill-ports.md) | 2026-05-07 | completed | npm run dev 前自动杀端口 |
| [2026-05-07-review-quality-gap](../../contracts/2026-05-07-review-quality-gap.md) | 2026-05-07 | completed | AI 评审质量提升 — 知识注入过滤 + 根因分析 |
| [2026-05-08-vite-proxy-export-fix](../../contracts/2026-05-08-vite-proxy-export-fix.md) | 2026-05-08 | completed | Vite Proxy + 导出优化 |
| [2026-05-09-ast-review-pipeline](../../contracts/2026-05-09-ast-review-pipeline.md) | 2026-05-09 | completed | 知识库 UI 优化 + AST 方案规划 |

---

*补建于: 2026-05-11 (v1.4.2 治理)*
