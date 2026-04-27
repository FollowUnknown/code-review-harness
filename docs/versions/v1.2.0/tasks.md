# v1.2.0 Implementation Tasks

> 状态说明：⬜ 待开始 | 🔄 进行中 | ✅ 完成 | ❌ 阻塞 | ⏭ 跳过
> 前置: v1.1.5（用户管理与分配完成）

---

## 模块 1: 记忆分层

### TASK-201: 记忆目录结构
- **状态**: ⬜
- **优先级**: P0
- **依赖**: 无
- **描述**:
  - 创建 `sessions/memory/` 目录结构
  - 按层级组织：`session/`、`task/`、`project/`、`validated/`
  - 定义记忆文件命名规范
- **验收**:
  - [ ] 目录结构就位
  - [ ] README 说明各层级用途

### TASK-202: 4 层记忆模型定义
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-201
- **描述**:
  - 定义 SessionMemory 接口（TTL: 1天）
  - 定义 TaskMemory 接口（TTL: 7天）
  - 定义 ProjectMemory 接口（TTL: 30天）
  - 定义 ValidatedKnowledge 接口（永久）
  - JSON Schema 定义
- **验收**:
  - [ ] 4 层记忆接口定义完成
  - [ ] JSON Schema 可验证
  - [ ] TTL 策略可配置

### TASK-203: Memory Extractor — Run → TaskMemory
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-202
- **描述**:
  - 从 v1.1.0 `sessions/execution/runs/` 提取 task memory
  - 提取字段：scope, approach, risks, decisions
  - 标记 `extractedForMemory: true`
- **验收**:
  - [ ] 可从 Run 记录提取 TaskMemory
  - [ ] 提取后标记已处理

### TASK-204: Memory Extractor — Repair → ValidatedKnowledge
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-202
- **描述**:
  - 从 v1.1.0 `sessions/execution/repairs/` 提取 validated knowledge
  - 提取字段：错误模式(pattern)、修复方案(fix)、示例(bad/good)
  - 标记 `extractedForKnowledge: true`
  - 计算 validationCount 和 successRate
- **验收**:
  - [ ] 可从 Repair 记录提取 ValidatedKnowledge
  - [ ] 提取后标记已处理
  - [ ] 自动计算验证指标

### TASK-205: Memory Extractor — Checkpoint → SessionMemory
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-202
- **描述**:
  - 从 v1.1.0 `sessions/execution/checkpoints/` 提取 session memory
  - 提取字段：状态变更、上下文快照
  - 自动按 `memoryLayer` 分类
- **验收**:
  - [ ] 可从 Checkpoint 提取 SessionMemory
  - [ ] 按 memoryLayer 正确分类

### TASK-206: TaskMemory → ProjectMemory 聚合
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-203
- **描述**:
  - 7 天后 TaskMemory 自动聚合为 ProjectMemory
  - 相似 Task 去重合并
  - 计算 confidence 置信度
- **验收**:
  - [ ] 聚合逻辑正确
  - [ ] 去重合并无丢失
  - [ ] confidence 计算合理

---

## 模块 2: 记忆召回

### TASK-207: 召回策略框架
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-202
- **描述**:
  - 定义 RecallPolicy 接口
  - 定义 RecallContext 上下文
  - 实现 LayeredRecallPolicy（按场景召回不同层级）
- **验收**:
  - [ ] 召回框架可扩展
  - [ ] 按场景正确分层召回

### TASK-208: 相关性评分算法
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-207
- **描述**:
  - 实现 RelevanceScorer 接口
  - 评分维度：文本相似度、代码模式匹配、Contract 关联度
  - 返回 Top N 记忆（默认 10）
- **验收**:
  - [ ] 评分算法可量化
  - [ ] Top N 返回结果合理

### TASK-209: 记忆注入 Prompt
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-208
- **描述**:
  - 召回的记忆注入 AI 评审 Prompt
  - 按层级格式化：project memory → 规则段、validated knowledge → 检查段
  - 控制注入长度，避免 Prompt 过长
- **验收**:
  - [ ] 记忆注入 Prompt 格式正确
  - [ ] 注入后 Prompt 长度可控
  - [ ] 注入内容可追溯

---

## 模块 3: 记忆写回

### TASK-210: 写回策略框架
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-202
- **描述**:
  - 定义 WritebackPolicy 接口
  - 实现 LayeredWritebackPolicy
  - 写回触发点：Run 完成、Repair 完成、会话结束
- **验收**:
  - [ ] 写回框架可扩展
  - [ ] 各触发点正确写回

### TASK-211: 记忆升级路径
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-210, TASK-206
- **描述**:
  - TaskMemory → ProjectMemory 升级（7 天后聚合）
  - ProjectMemory → ValidatedKnowledge 升级（30 天 + confidence > 0.8）
  - 升级日志和指标
- **验收**:
  - [ ] 升级逻辑正确
  - [ ] 升级条件可配置
  - [ ] 升级过程可观测

### TASK-212: TTL 清理与归档
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-210
- **描述**:
  - Session Memory 1 天后自动清理
  - Task Memory 7 天后升级或归档
  - Project Memory 30 天后升级或归档
  - 归档到 `sessions/memory/archive/`
- **验收**:
  - [ ] TTL 自动清理生效
  - [ ] 归档数据不丢失
  - [ ] 存储空间可控

---

## 模块 4: AI 评审质量提升

### TASK-213: 基于记忆的评审流程
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-209, TASK-210
- **描述**:
  - 评审前自动召回相关记忆
  - 记忆注入 Prompt 增强评审
  - 评审后写回新记忆
  - 发现新模式时自动写回
- **验收**:
  - [ ] 评审前召回记忆
  - [ ] 评审后写回记忆
  - [ ] 完整正向循环

### TASK-214: 评审质量对比测试
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-213
- **描述**:
  - 同一代码多次评审一致性 > 90%
  - 与 v1.1.0 无记忆评审对比
  - 错误发现率提升可量化
  - 修复建议质量提升可量化
- **验收**:
  - [ ] 一致性 > 90%
  - [ ] 修复成功率 > 80%
  - [ ] 对比数据可呈现

---

## Release Gate

- [ ] **RG-201**: 4 层记忆模型定义完成且可验证
- [ ] **RG-202**: 从 v1.1.0 Execution 数据提取记忆成功
- [ ] **RG-203**: 记忆召回注入 Prompt 生效
- [ ] **RG-204**: 记忆写回和升级路径正常
- [ ] **RG-205**: AI 评审质量可量化提升
- [ ] **RG-206**: TTL 清理和归档生效

---

## 任务依赖图

```
TASK-201 (目录结构) ──→ TASK-202 (4 层模型) ──┬──→ TASK-203 (Run→TaskMemory) ──→ TASK-206 (Task→Project 聚合)
    │                                          ├──→ TASK-204 (Repair→Validated)      │
    │                                          ├──→ TASK-205 (Checkpoint→Session)    │
    │                                          ├──→ TASK-207 (召回框架) ──→ TASK-208 (评分) ──→ TASK-209 (注入 Prompt) ──┐
    │                                          └──→ TASK-210 (写回框架) ──→ TASK-211 (升级路径)                            │
    │                                                                       │                                   │
    │                                                                       └──→ TASK-212 (TTL 清理)             │
    │                                                                                                           │
    └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                                                                    │
TASK-209 + TASK-210 ──→ TASK-213 (基于记忆评审) ──→ TASK-214 (质量对比)
TASK-206 + TASK-210 ──→ TASK-211 (升级路径)
```
