# v1.2.5 Harness Memory 分层系统设计

> 日期：2026-04-29
> 状态：draft
> 前置：v1.2.0（CodeReview 侧 Knowledge 精准召回）
> 后置：v1.3.0（Capability Superpower 基础）

---

## 1. 目标

实现 Phase 4: Memory Superpower（Harness 侧），将 Execution 数据沉淀为分层记忆，使 AI 编排跨会话不丢失上下文。

**与 v1.2.0 的边界**：

| | v1.2.0（CodeReview 侧） | v1.2.5（Harness 侧） |
|---|---|---|
| 服务对象 | LLM 评审 GitLab MR | AI agent 编排 |
| 数据来源 | LLM 评审结果 → Knowledge | Execution 数据 → Memory |
| 存储 | `knowledge_entries` 表 | `sessions/memory/` 文件系统 |
| 用户价值 | 评审更准更一致 | 编排更智能、上下文不丢失 |

两者完全独立，不桥接。

---

## 2. 架构选型

- **存储**：纯文件系统（与 execution/ 同构，零依赖）
- **召回**：规则驱动（CLAUDE.md 规则，AI 自动执行）
- **结构**：层级目录 + 全局索引文件（index.json）
- **性质**：混合文档+代码 spec，包含规则定义、shell 脚本、TypeScript API 和前端组件

---

## 3. 存储层

### 3.1 目录结构

```
sessions/memory/
├── index.json                    # 全局索引（所有条目元数据摘要）
├── session/
│   ├── 2026-04-29.json           # 每天一个
│   └── 2026-04-28.json
├── task/
│   ├── run-20260428-001.json     # 一个 run 一个
│   └── run-20260428-002.json
├── project/
│   ├── conventions.json          # 按主题分
│   ├── risks.json
│   └── best-practices.json
├── archive/
│   ├── session/
│   ├── task/
│   └── project/
└── stats.json                    # 命中、升级、归档统计
```

### 3.2 index.json

```json
{
  "lastUpdated": "2026-04-29T10:00:00Z",
  "entries": [
    {
      "id": "run-20260428-001",
      "layer": "session" | "task" | "project",
      "file": "task/run-20260428-001.json",
      "scope": "v1.1.0 Execution 层基础设施",
      "createdAt": "2026-04-28",
      "expiresAt": "2026-05-05",
      "hitCount": 3,
      "lastHitAt": "2026-04-29",
      "tags": ["execution", "schema", "v1.1.0"]
      // layer 枚举: "session" | "task" | "project"
      // 归档后条目从 entries 移除，不保留 layer 值
    }
  ]
}
```

### 3.3 Session Memory Schema

```typescript
interface SessionMemory {
  id: string;                      // = "2026-04-29"
  sessionDate: string;
  activeTasks: ActiveTask[];
  contextSnapshot: {
    currentContract: string | null;  // Contract ID，如 "2026-04-28-v110-execution-layer"
    currentPhase: string | null;
    lastAction: string;
  };
  pendingDecisions: string[];
  createdAt: string;
  expiresAt: string;               // createdAt + 1d
}
```

### 3.4 Task Memory Schema

```typescript
interface TaskMemory {
  id: string;                      // = run-id
  contractId: string;
  scope: string;
  approach: string;
  risks: string[];
  decisions: Decision[];            // { decision: string; rationale: string }
  reviewResult: "passed" | "failed";
  keyIssues: string[];
  repairPattern?: string;          // 如有关联 repair
  createdAt: string;
  expiresAt: string;               // createdAt + 7d
}
```

### 3.5 Project Memory Schema

```typescript
interface ProjectMemory {
  id: string;
  projectName: string;             // 关联项目名，区分不同项目
  type: "conventions" | "risks" | "best-practices";
  content: string;
  sourceTaskIds: string[];
  confidence: number;              // 0-1，基于命中数
  createdAt: string;
  expiresAt: string;               // lastHitAt + 30d
  lastHitAt: string;
}
```

---

## 4. 记忆提取

### 4.1 提取时机

| 触发 | 提取目标 | 写入层 |
|------|---------|--------|
| 会话启动时 | 读当天 session，不存在则创建 | session |
| 会话关键节点（写代码/做决策/完成任务） | 更新 session 上下文快照 | session |
| Run 完成（review 通过） | plan + implementation + review → task | task |
| Repair 完成（修复通过） | repair 4 文件 → task（含 repairPattern） | task |
| task memory hitCount ≥ 3 | 聚合相似 task → project | project |

### 4.2 Session 提取逻辑

AI 在对话开始时执行：

1. 读 `sessions/YYYY-MM-DD.md` 获取今日目标和任务
2. 读 `active-tasks.md` 获取活跃任务
3. 写入 `sessions/memory/session/YYYY-MM-DD.json`
4. 更新 `index.json`

### 4.3 Task 提取逻辑

AI 在 Run 完成后执行：

1. 读 `runs/{run-id}/plan.json` → scope, approach, risks
2. 读 `runs/{run-id}/implementation.json` → decisions, approach adjustments
3. 读 `runs/{run-id}/review.json` → reviewResult, key issues
4. 写入 `sessions/memory/task/{run-id}.json`
5. 更新 `index.json` 添加条目

### 4.4 Project 提取逻辑

AI 在 task memory hitCount ≥ 3 时执行：

1. 扫描 `sessions/memory/task/` 下所有条目
2. 按主题分组（conventions / risks / best-practices）
3. 合并同类项，标注 sourceTaskIds 和 confidence
4. 写入 `sessions/memory/project/{type}.json`
5. 更新 `index.json`

---

## 5. 记忆召回

### 5.1 召回时机

| 召回时机 | 召回层 | 读取文件 | 注入方式 |
|---------|--------|---------|---------|
| 对话启动 | session | `memory/session/{today}.json` | 恢复活跃任务和上下文 |
| 对话启动 | project | `memory/project/*.json` | 注入项目规则到规划 Prompt |
| 创建新 Contract | project | `memory/project/conventions.json` | 检查是否与已有规则冲突 |
| 创建新 Contract | task | `memory/task/` 中 scope 相似的条目 | 参考历史方案和风险 |
| 修复失败参考 | task | Repair 对应的 task memory | 注入历史修复方案 |
| 会话结束 | session | 更新当日 session memory | 持久化上下文快照 |

### 5.2 召回匹配规则

纯文件名 + index.json 标签匹配，无代码：

1. **精确匹配**：当前 Contract scope 与 task memory scope 相同 → 直接命中
2. **标签匹配**：当前任务 tags 与 index.json 条目 tags 有交集 → 候选
3. **项目级全量**：project memory 总量小，创建 Contract 时全量加载

命中时执行：
- 读取对应 memory 文件
- `index.json` 中对应条目 `hitCount++`
- 更新 `lastHitAt` 时间戳

### 5.3 CLAUDE.md 集成规则

在会话机制区块新增：

```markdown
**规则 4：记忆召回**
- 对话启动时：读取 memory/session/{today} 恢复上下文，读取 memory/project/ 注入项目规则
- 创建 Contract 时：扫描 memory/task/ 寻找相似 scope，参考历史方案
- 命中记忆时：更新 index.json hitCount，hitCount ≥ 3 触发升级检查
```

---

## 6. 记忆升级、TTL 清理与统计

### 6.1 升级路径

```
session (1d TTL)
    │ 到期 → 归档到 archive/session/
    │
task (7d TTL)
    │ hitCount ≥ 3 → 升级到 project memory
    │ 到期未达阈值 → 归档到 archive/task/
    │
project (30d TTL)
    │ 命中时续命 → expiresAt = lastHitAt + 30d
    │ 30d 未命中 → 归档到 archive/project/
    │
archive/ (永久保留，不再升级)
```

### 6.2 升级触发

| 升级 | 条件 | 执行时机 |
|------|------|---------|
| task → project | hitCount ≥ 3 且距创建 ≥ 1d | AI 更新 hitCount 时检查 |
| 注：1d 最短期限防止单次会话内反复命中导致过早升级，需跨至少 2 天的命中才可信 |
| project 续命 | 被命中 | AI 命中时执行，expiresAt = lastHitAt + 30d |

### 6.3 TTL 清理

脚本 `scripts/memory-maintenance.sh`：

1. 扫描 index.json，找 expiresAt < today 的条目
2. task 条目先检查 hitCount ≥ 3 且 createdAt 距今 ≥ 1d，达到则升级而非归档
3. 归档文件 mv 到 archive/{layer}/
4. 从 index.json 移除条目
5. 更新 stats.json

执行方式：手动或 cron，不强依赖自动化。AI 也可在对话启动时检查并提示。

### 6.4 stats.json

```json
{
  "totalEntries": 12,
  "byLayer": {
    "session": 3,
    "task": 5,
    "project": 4
  },
  "upgrades": {
    "taskToProject": 2,
    "projectRenewed": 1
  },
  "archived": {
    "session": 1,
    "task": 0,
    "project": 0
  },
  "lastMaintenance": "2026-04-29T10:00:00Z"
}
```

### 6.5 记忆统计页（前端）

新增路由 `/memory`，组件 `MemoryPage.tsx`，API `/api/memory/stats`：

- 各层条目数量（session / task / project / archive）
- 最近升级和命中趋势
- 即将过期的条目列表
- 手动触发维护按钮

---

## 7. 涉及文件

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `sessions/memory/index.json` | 全局索引 |
| 新建 | `sessions/memory/session/` | Session memory 目录 |
| 新建 | `sessions/memory/task/` | Task memory 目录 |
| 新建 | `sessions/memory/project/` | Project memory 目录 |
| 新建 | `sessions/memory/archive/session/` | 归档目录 |
| 新建 | `sessions/memory/archive/task/` | 归档目录 |
| 新建 | `sessions/memory/archive/project/` | 归档目录 |
| 新建 | `sessions/memory/stats.json` | 统计数据 |
| 新建 | `scripts/memory-maintenance.sh` | TTL 清理与升级脚本 |
| 新建 | `src/server/routes/memory.ts` | Memory stats API |
| 新建 | `src/client/pages/MemoryPage.tsx` | 记忆统计前端页 |
| 修改 | `CLAUDE.md` | 新增规则 4：记忆召回 |
| 修改 | `src/server/index.ts` | 挂载 memory 路由 |
| 修改 | `src/client/App.tsx` | 新增 Memory 导航和路由 |

---

## 8. 验收标准

### 存储层
- [ ] `sessions/memory/` 目录结构完整
- [ ] index.json Schema 定义完成
- [ ] 三层 memory JSON Schema 定义完成

### 提取
- [ ] Session 提取：对话启动时创建/更新 session memory
- [ ] Task 提取：从 execution runs 提取 task memory
- [ ] Project 提取：hitCount ≥ 3 时聚合升级

### 召回
- [ ] 对话启动时恢复 session 上下文
- [ ] 创建 Contract 时注入 project 规则
- [ ] 命中时更新 hitCount 和 lastHitAt

### 升级与清理
- [ ] task → project 升级逻辑
- [ ] project 命中续命逻辑
- [ ] `memory-maintenance.sh` 脚本实现 TTL 清理

### 前端
- [ ] `/memory` 页面展示统计
- [ ] `/api/memory/stats` API 可用

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Execution 数据少 | 高 | 先用现有 1 run + 1 repair 数据验证，待积累 |
| 召回相关性低 | 高 | 小规模测试，调整标签和匹配规则 |
| index.json 不一致 | 中 | 维护脚本含一致性校验 |
| 记忆存储膨胀 | 低 | TTL + 归档 + stats 监控 |

---

*最后更新: 2026-04-29*
