# v1.4.2 任务拆解

> 治理迭代，任务粒度偏细以保证可追溯

## Phase 1: Contract 规范化

- [ ] V142-001: 扫描所有 contract，列出当前状态与实际完成情况的不一致清单 (P0)
- [ ] V142-002: 统一所有 contract status 为受控词汇 (P0)
- [ ] V142-003: 为所有活跃 contract 补齐 `version` 字段 (P0)
- [ ] V142-004: 关闭已完成但状态未更新的 contract（v137-multi-techstack、v1.2.0-knowledge-precision、local-code-scan）

## Phase 2: 清理与一致化

- [ ] V142-005: 删除 v1.4.0-archived/ 目录 (P1)
- [ ] V142-006: 为 v1.3.9 创建最小目录（README + 关联 contract）(P1)
- [ ] V142-007: 统一 versions/README.md 为唯一状态真相源，修正子目录 README 矛盾 (P1)
- [ ] V142-008: 为活跃 version README 底部增加「关联 Contract」段落 (P1)

## Phase 3: v1.4.0 文档精简

- [ ] V142-009: 合并 scenario-analysis.md 和 business-scenarios.md (P2)
- [ ] V142-010: change-impact-map.md 与 design.md 去重，删除重复文件 (P2)

## Phase 4: 规则沉淀

- [ ] V142-011: 在 CLAUDE.md 增加 contract 创建规则（version 必填、状态受控词汇）(P0)
- [ ] V142-012: 在 CLAUDE.md 增加版本结项规则（关联 contract 全部 completed）(P0)
- [ ] V142-013: 更新 versions/README.md 路线图，插入 v1.4.2 (P1)

## 验收

- [ ] V142-014: 逐项核对 v1.4.2 README 验收标准 (P0)
