# v1.4.2 任务拆解

> 治理迭代，任务粒度偏细以保证可追溯
> 架构评审: 2026-05-11, architect + 迭代沟通 agent
> 关键决策: v1.3.8 并入 v1.3.9 | v1.4.0 文档 5→4 | review_pending 与 hook 联动

## Phase 0: 架构确认（已完成）

- [x] V142-000: Architect + 迭代沟通 agent 联合评审 → CRITICAL-1/2 已解，GO

## Phase 1: Contract 规范化

- [ ] V142-001: 扫描 13 个 contract，列出当前 status 与实际完成情况不一致清单 (P0)
- [ ] V142-002: 统一 13 个 contract 的 frontmatter 为 blockquote 风格（Schema 见 README）(P0)
- [ ] V142-003: 补齐 13 个 contract 的 `version` 字段 (P0)
- [ ] V142-004: 统一 13 个 contract 的 `status` 为受控词汇 (P0)
- [ ] V142-005: 关闭已完成但 status 未更新的 contract（v137-multi-techstack → completed, v1.2.0-knowledge-precision → completed, local-code-scan → completed）

## Phase 2: 清理与一致化

- [ ] V142-006: v1.3.8 contract 归入 v1.3.9（local-review-job-persistence 版本号改为 v1.3.9）(P0)
- [ ] V142-007: 创建 v1.3.9 最小目录（README + 关联 Contract 表：local-review-job-persistence, predev-kill-ports, vite-proxy-export-fix, ast-review-pipeline）(P0)
- [ ] V142-008: 审计 v1.4.0-archived/ 内容（Capability Superpower 概念是否对 v2.0 有用），提取摘要后删除目录 (P1)
- [ ] V142-009: 修正 v1.3.0 README 状态矛盾：`待规划` → `✅ 完成` (P0)
- [ ] V142-010: 统一子目录 README 中与总表矛盾的自我状态描述 (P1)

## Phase 3: 版本反向引用

- [ ] V142-011: v1.4.0 README 底部增加「关联 Contract」段（作为模板示范）(P1)
- [ ] V142-012: v1.3.7 README 关联 Contract 段规范化 (P1)
- [ ] V142-013: v1.3.9, v1.4.1 README 增加关联 Contract 段 (P1)

## Phase 4: v1.4.0 文档精简

- [ ] V142-014: 合并 scenario-analysis.md + business-scenarios.md → user-scenarios.md (P2)
- [ ] V142-015: 保留 change-impact-map.md 独立（架构决策 2），删除原 scenario-analysis + business-scenarios (P2)

## Phase 5: 规则沉淀

- [ ] V142-016: CLAUDE.md 增加 Contract 创建规范（version 必填、blockquote 格式、status 受控词汇）(P0)
- [ ] V142-017: CLAUDE.md 增加版本结项规则（关联 contract 全部 completed 才能关）(P0)
- [ ] V142-018: CLAUDE.md 增加 review_pending → pre-commit hook 联动规则（in_progress → review_pending → code-reviewer → review-passed hash → completed → commit）(P0)
- [ ] V142-019: 更新 versions/README.md 路线图（v1.4.2 状态 → `🔄 进行中`）(P1)

## 验收

- [ ] V142-020: 逐项核对 v1.4.2 README 验收标准 (P0)
