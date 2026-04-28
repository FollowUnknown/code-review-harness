# v1.2.0 Implementation Tasks

> 状态说明：⬜ 待开始 | 🔄 进行中 | ✅ 完成 | ❌ 阻塞 | ⏭ 跳过
> 前置: v1.1.5（用户管理与 Knowledge 审核流程）

---

## 现有实现盘点

| 模块 | 已有 | 差距 |
|------|------|------|
| Knowledge 召回 | `getKnowledgeForReview()` 6层注入 | 召回靠 project 名匹配，无代码模式/语义匹配 |
| Knowledge 注入 | `buildKnowledgePrompt()` 按类型格式化 | 行数硬限制，无优先级排序 |
| Knowledge 沉淀 | `extractLearnings()` 从评审提取 | 无指纹去重、无置信度、无生命周期 |
| 评审质量 | 有评分维度和分数 | 无一致性测试、无 A/B 对比 |

---

## 模块 1: Knowledge 精准召回

### TASK-201: 代码模式匹配召回
- **状态**: ⬜
- **优先级**: P0
- **依赖**: 无
- **描述**:
  - `getKnowledgeForReview()` 增加代码模式匹配
  - AP.pattern 对变更文件列表匹配（正则或子串）
  - 匹配到的 AP 提升优先级，提前注入
  - 返回匹配信息供前端展示
- **验收**:
  - [ ] AP.pattern 匹配变更文件生效
  - [ ] 匹配的 AP 优先级高于未匹配的

### TASK-202: 相关性评分排序
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-201
- **描述**:
  - 召回的 Knowledge 条目按相关性评分排序
  - 评分维度：项目匹配、代码模式匹配、严重度、命中率
  - 高分条目优先注入 Prompt
- **验收**:
  - [ ] 评分算法实现
  - [ ] 排序结果合理（人工验证）

### TASK-203: Token 预算控制
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-202
- **描述**:
  - 替代当前行数硬限制（2000行）
  - 按 Token 数控制注入总量
  - 低分条目在 Token 不足时截断
  - 保留行数限制作为 fallback
- **验收**:
  - [ ] Token 预算生效
  - [ ] 截断后 Prompt 仍完整可解析

### TASK-204: 命中反馈闭环
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-201
- **描述**:
  - 评审时记录哪些 Knowledge 被采纳（issue 修复建议命中 AP）
  - 采纳的 Knowledge 提升 hit_count + confidence
  - 未采纳的不惩罚（可能是正确的但未触发）
  - 前端展示 Knowledge 命中情况
- **验收**:
  - [ ] 命中反馈记录到 review_knowledge_usage
  - [ ] confidence 基于反馈更新

---

## 模块 2: Knowledge 自动沉淀增强

### TASK-205: 指纹去重
- **状态**: ⬜
- **优先级**: P0
- **依赖**: 无
- **描述**:
  - knowledge_entries 增加 `fingerprint` 字段（TEXT）
  - fingerprint 生成：type + project + title 标准化 + pattern
  - `extractLearnings()` 创建前查重，相似指纹 MERGE 到已有 AP
  - MERGE 时增加 hit_count，更新 content
- **验收**:
  - [ ] fingerprint 字段和索引
  - [ ] 相同 fingerprint 不重复创建
  - [ ] MERGE 逻辑正确

### TASK-206: confidence 字段和计算
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-205
- **描述**:
  - knowledge_entries 增加 `confidence` 字段（REAL, 默认 0.5）
  - 新建 Knowledge: confidence = 0.3（自动提取）或 0.7（人工确认）
  - 命中+采纳: confidence += 0.1（上限 1.0）
  - 命中+未采纳: confidence -= 0.05（下限 0.1）
  - CONFIRMED 时 confidence = max(current, 0.7)
- **验收**:
  - [ ] confidence 字段和默认值
  - [ ] 命中反馈更新 confidence
  - [ ] 确认时提升 confidence

### TASK-207: Knowledge 生命周期管理
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-206
- **描述**:
  - 增加 `last_verified_at` 字段
  - confidence < 0.2 且 30 天无命中 → 自动 DEPRECATED
  - CONFIRMED 且 90 天无命中 → 标记待验证
  - 提供手动刷新验证操作
- **验收**:
  - [ ] 低 confidence 自动降级
  - [ ] 长期未命中标记待验证
  - [ ] 手动刷新操作

---

## 模块 3: 评审 Prompt 增强

### TASK-208: 按相关性动态构建 Prompt
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-202
- **描述**:
  - `buildKnowledgePrompt()` 改为按相关性排序构建
  - 高 confidence + 高相关性 → 必须注入
  - 低 confidence 或低相关性 → Token 允许时注入
  - 注入标注来源 ID，便于追溯
- **验收**:
  - [ ] 动态构建逻辑实现
  - [ ] 注入内容可追溯

### TASK-209: 变更文件精准匹配
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-201
- **描述**:
  - 评审时传入变更文件列表
  - BN/RULE 匹配变更文件路径（module 字段）
  - EXP 匹配变更文件路径
  - 匹配到的 Knowledge 优先注入
- **验收**:
  - [ ] 文件路径匹配生效
  - [ ] 匹配的 Knowledge 优先级提升

---

## 模块 4: 评审质量可量化

### TASK-210: 评审一致性测试
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-208
- **描述**:
  - 选 3-5 个历史 MR，各评审 3 次
  - 比较评分一致性（方差、排名相关性）
  - 记录 baseline 数据
- **验收**:
  - [ ] 一致性 > 85%
  - [ ] baseline 数据记录

### TASK-211: 评审质量仪表盘
- **状态**: ⬜
- **优先级**: P2
- **依赖**: TASK-210
- **描述**:
  - 前端新增评审质量页面
  - 展示：一致性趋势、Knowledge 命中率、误报率
  - 支持 v1.1.x vs v1.2.0 对比
- **验收**:
  - [ ] 仪表盘数据正确
  - [ ] 对比视图可用

---

## Release Gate

- [ ] **RG-201**: 代码模式匹配召回生效
- [ ] **RG-202**: 相关性评分和 Token 预算控制生效
- [ ] **RG-203**: 指纹去重和 confidence 计算
- [ ] **RG-204**: 评审 Prompt 按相关性动态构建
- [ ] **RG-205**: 评审一致性 > 85%
- [ ] **RG-206**: Knowledge 命中率 > 30%

---

## 任务依赖图

```
TASK-201 (代码模式匹配) ──┬──→ TASK-202 (相关性评分) ──→ TASK-203 (Token 预算) ──→ TASK-208 (动态 Prompt)
    │                     └──→ TASK-204 (命中反馈)                                   │
    │                                                                            TASK-209 (文件精准匹配)
    │                                                                                │
TASK-205 (指纹去重) ──→ TASK-206 (confidence) ──→ TASK-207 (生命周期)               │
                                                                                    │
                                                                         TASK-208 ──→ TASK-210 (一致性测试) ──→ TASK-211 (仪表盘)
```
