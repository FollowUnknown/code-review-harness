# v1.4.2 任务拆解

> 治理迭代，任务粒度偏细以保证可追溯
> 架构评审: 2026-05-11, architect + 迭代沟通 agent
> 关键决策: v1.3.8 并入 v1.3.9 | v1.4.0 文档 5→4 | review_pending 与 hook 联动

## Phase 0: 架构确认（已完成）

- [x] V142-000: Architect + 迭代沟通 agent 联合评审 → CRITICAL-1/2 已解，GO

## Phase 1: 需求场景输出（已完成）

> 明确改之后的具体效果和目标，验证 v1.4.2 治理方向正确，不写代码

- [x] V142-001: 输出 5 个需求场景的 before/after 对比（见 README 场景 1-5）(P0)
- [x] V142-002: 确认场景覆盖所有 6 个结构问题（链路断裂、状态打架、幽灵版本、受控词汇、密度不均、废弃目录）→ 覆盖矩阵见 README (P0)
- [x] V142-003: 验收标准逐条对照场景，可度量 → 验收→场景映射表见 README (P0)

## Phase 2: Contract 规范化

- [ ] V142-010: 扫描 13 个 contract，列出当前 status 与实际完成情况不一致清单 (P0)
- [ ] V142-011: 统一 13 个 contract 的 frontmatter 为 blockquote 风格（Schema 见 README）(P0)
- [ ] V142-012: 补齐 13 个 contract 的 `version` 字段 (P0)
- [ ] V142-013: 统一 13 个 contract 的 `status` 为受控词汇 (P0)
- [ ] V142-014: 关闭已完成但 status 未更新的 contract (P0)

## Phase 3: 清理与一致化

- [ ] V142-020: v1.3.8 contract 归入 v1.3.9（local-review-job-persistence 版本号改为 v1.3.9）(P0)
- [ ] V142-021: 创建 v1.3.9 最小目录（README + 关联 Contract 表）(P0)
- [ ] V142-022: 审计 v1.4.0-archived/ 内容，提取摘要后删除目录 (P1)
- [ ] V142-023: 修正 v1.3.0 README 状态矛盾：`待规划` → `✅ 完成` (P0)
- [ ] V142-024: 统一子目录 README 中与总表矛盾的自我状态描述 (P1)

## Phase 4: 版本反向引用

- [ ] V142-030: v1.4.0 README 底部增加「关联 Contract」段（作为模板示范）(P1)
- [ ] V142-031: v1.3.7 README 关联 Contract 段规范化 (P1)
- [ ] V142-032: v1.3.9, v1.4.1 README 增加关联 Contract 段 (P1)

## Phase 5: v1.4.0 文档精简

- [ ] V142-040: 合并 scenario-analysis.md + business-scenarios.md → user-scenarios.md (P2)
- [ ] V142-041: 保留 change-impact-map.md 独立（架构决策 2），删除原 scenario-analysis + business-scenarios (P2)

## Phase 6: 规则沉淀

- [ ] V142-050: CLAUDE.md 增加 Contract 创建规范（version 必填、blockquote 格式、status 受控词汇）(P0)
- [ ] V142-051: CLAUDE.md 增加版本结项规则（关联 contract 全部 completed 才能关）(P0)
- [ ] V142-052: CLAUDE.md 增加 review_pending → pre-commit hook 联动规则 (P0)
- [ ] V142-053: 更新 versions/README.md 路线图（v1.4.2 状态 → `🔄 进行中`）(P1)

## 验收

- [ ] V142-060: 逐项核对 v1.4.2 README 验收标准 + 需求场景效果验证 (P0)
