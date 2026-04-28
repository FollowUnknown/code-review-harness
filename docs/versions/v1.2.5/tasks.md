# v1.2.5 Implementation Tasks

> 状态说明：⬜ 待开始 | 🔄 进行中 | ✅ 完成 | ❌ 阻塞 | ⏭ 跳过
> 前置: v1.2.0（CodeReview 侧 Knowledge 精准召回）

---

## 模块 1: 记忆分层

### TASK-251: 记忆目录结构与 Schema
- **状态**: ⬜
- **优先级**: P0
- **依赖**: 无
- **描述**:
  - 创建 `sessions/memory/` 目录结构
  - 按层级组织：`session/`、`task/`、`project/`、`archive/`
  - 定义 SessionMemory、TaskMemory、ProjectMemory JSON Schema
  - README 说明各层级用途
- **验收**:
  - [ ] 目录结构就位
  - [ ] JSON Schema 可验证

### TASK-252: Memory Extractor — Run → TaskMemory
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-251
- **描述**:
  - 从 `sessions/execution/runs/` 提取 task memory
  - 提取字段：scope, approach, risks, decisions
  - 标记 `extractedForMemory: true`
  - 写入 `sessions/memory/task/{run-id}.json`
- **验收**:
  - [ ] 可从 Run 记录提取 TaskMemory
  - [ ] 提取后标记已处理

### TASK-253: Memory Extractor — Checkpoint → SessionMemory
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-251
- **描述**:
  - 从 `sessions/execution/checkpoints/` 提取 session memory
  - 提取字段：状态变更、上下文快照
  - 写入 `sessions/memory/session/{date}.json`
- **验收**:
  - [ ] 可从 Checkpoint 提取 SessionMemory

### TASK-254: TaskMemory → ProjectMemory 聚合
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-252
- **描述**:
  - 7 天后 TaskMemory 自动聚合为 ProjectMemory
  - 相似 Task 去重合并
  - 计算 confidence（基于 Task 数量和一致性）
  - 写入 `sessions/memory/project/{project}.json`
- **验收**:
  - [ ] 聚合逻辑正确
  - [ ] 去重合并无丢失

---

## 模块 2: 记忆召回

### TASK-255: 召回策略框架
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-251
- **描述**:
  - 定义 RecallPolicy 接口
  - 实现 LayeredRecallPolicy
  - 召回场景：新 Contract（project memory）、继续会话（session memory）、相似任务（task memory）、修复参考（task memory with repair）
  - **边界**：评审 MR 时的 Knowledge 召回由 v1.2.0 负责，此处不涉及
- **验收**:
  - [ ] 召回框架可扩展
  - [ ] 按场景正确分层召回

### TASK-256: 跨会话恢复
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-255, TASK-253
- **描述**:
  - 新会话启动时读取 session memory
  - 恢复活跃任务列表和上下文
  - 在 CLAUDE.md 会话机制中集成
- **验收**:
  - [ ] 中断后恢复上下文
  - [ ] 活跃任务不丢失

---

## 模块 3: 记忆写回与升级

### TASK-257: 写回策略框架
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-251
- **描述**:
  - 定义 WritebackPolicy 接口
  - 写回触发点：Run 完成、会话结束
  - 写回目标和格式
- **验收**:
  - [ ] 各触发点正确写回

### TASK-258: 记忆升级路径
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-257, TASK-254
- **描述**:
  - TaskMemory → ProjectMemory 升级（7 天后聚合）
  - ProjectMemory 30 天未命中 → 归档
  - 升级日志
  - **注意**：升级路径终止于 project memory，不桥接到 knowledge_entries
- **验收**:
  - [ ] 升级逻辑正确
  - [ ] 归档数据不丢失

### TASK-259: TTL 清理与归档
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-257
- **描述**:
  - Session Memory 1 天后自动归档
  - Task Memory 7 天后升级或归档
  - Project Memory 30 天后归档
  - 归档到 `sessions/memory/archive/`
- **验收**:
  - [ ] TTL 自动清理生效
  - [ ] 归档数据不丢失

---

## Release Gate

- [ ] **RG-251**: 3 层记忆模型定义完成且可验证
- [ ] **RG-252**: 从 Execution 数据提取记忆成功
- [ ] **RG-253**: 跨会话恢复功能可用
- [ ] **RG-254**: 记忆升级和 TTL 清理生效

---

## 任务依赖图

```
TASK-251 (目录/Schemas) ──┬──→ TASK-252 (Run→TaskMemory) ──→ TASK-254 (Task→Project 聚合)
    │                     ├──→ TASK-253 (Checkpoint→Session)
    │                     ├──→ TASK-255 (召回框架) ──→ TASK-256 (跨会话恢复)
    │                     │
    │                     └──→ TASK-257 (写回框架) ──→ TASK-258 (升级路径)
    │                                                  │
    │                                                  └──→ TASK-259 (TTL 清理)
    │
    TASK-253 + TASK-255 ──→ TASK-256 (跨会话恢复)
    TASK-254 + TASK-257 ──→ TASK-258 (升级路径)
```
