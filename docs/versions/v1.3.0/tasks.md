# v1.3.0 Implementation Tasks

> 状态说明：⬜ 待开始 | 🔄 进行中 | ✅ 完成 | ❌ 阻塞 | ⏭ 跳过
> 前置: v1.2.0（Memory Superpower 完成）

---

## 模块 1: Skill Registry

### TASK-301: Skill 数据模型与存储
- **状态**: ⬜
- **优先级**: P0
- **依赖**: 无
- **描述**:
  - 定义 Skill 接口（id, name, description, capabilities, provider, config）
  - 创建 `~/.claude/superpowers/skills/` 目录
  - 定义 Skill 注册文件格式（YAML/JSON）
- **验收**:
  - [ ] Skill 接口定义完成
  - [ ] 存储目录就位
  - [ ] 注册文件格式可解析

### TASK-302: Skill 注册与发现
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-301
- **描述**:
  - SkillRegistry 类实现
  - 注册新 Skill
  - 按 ID/名称/能力查询 Skill
  - 列出所有已注册 Skill
- **验收**:
  - [ ] 注册/发现 API 可用
  - [ ] 查询结果准确

### TASK-303: 内置 Skill 注册
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-302
- **描述**:
  - 注册现有 Agent 为 Skill：planner, generator, evaluator, code-reviewer, security-reviewer
  - 注册 CLAUDE.md 编排规则为 Skill：business-task-flow, platform-task-flow
  - 定义每个 Skill 的能力声明
- **验收**:
  - [ ] 内置 Skill 可被发现
  - [ ] 能力声明完整

---

## 模块 2: Provider Registry

### TASK-304: Provider 数据模型与存储
- **状态**: ⬜
- **优先级**: P0
- **依赖**: 无
- **描述**:
  - 定义 Provider 接口（id, name, type, config, health, metrics, pricing）
  - 创建 `~/.claude/superpowers/providers/` 目录
  - 定义 Provider 注册文件格式
- **验收**:
  - [ ] Provider 接口定义完成
  - [ ] 存储目录就位

### TASK-305: Provider 注册与选择
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-304
- **描述**:
  - ProviderRegistry 类实现
  - 注册新 Provider
  - 按 Skill 需求选择合适 Provider
  - 健康检查和指标收集
- **验收**:
  - [ ] 注册/选择 API 可用
  - [ ] 健康检查可触发

### TASK-306: 内置 Provider 注册
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-305
- **描述**:
  - 注册内置 Provider：claude-sonnet, claude-opus, claude-haiku
  - 定义各 Provider 的能力范围、性能指标、定价
- **验收**:
  - [ ] 内置 Provider 可被发现
  - [ ] 能力和指标定义完整

---

## 模块 3: Capability Registry

### TASK-307: Capability 数据模型
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-302, TASK-305
- **描述**:
  - 定义 Capability 接口（id, name, skills[], provider, dependencies, governance）
  - Capability 是 Skill + Provider 的组合
  - 定义 Capability 注册文件格式
- **验收**:
  - [ ] Capability 接口定义完成
  - [ ] 可组合 Skill + Provider

### TASK-308: Capability 注册与发现
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-307
- **描述**:
  - CapabilityRegistry 类实现
  - 注册 Capability（指定 Skill + Provider）
  - 按 ID/名称/能力查询
  - 依赖声明和解析
- **验收**:
  - [ ] 注册/发现 API 可用
  - [ ] 依赖解析正确

### TASK-309: 内置 Capability 注册
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-308
- **描述**:
  - 注册内置 Capability：
    - code-review（code-reviewer skill + claude-sonnet）
    - security-review（security-reviewer skill + claude-opus）
    - planning（planner skill + claude-sonnet）
    - generation（generator skill + claude-sonnet）
    - evaluation（evaluator skill + claude-haiku）
- **验收**:
  - [ ] 内置 Capability 可被发现
  - [ ] Skill + Provider 组合正确

---

## 模块 4: Capability Governance

### TASK-310: Governor 审批机制
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-308
- **描述**:
  - CapabilityGovernor 类实现
  - 审批策略：auto-approve, require-approval, deny
  - 基于 governance 规则的自动判断
  - 审批日志
- **验收**:
  - [ ] 审批策略生效
  - [ ] 日志可追溯

### TASK-311: Sandbox 隔离执行
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-310
- **描述**:
  - CapabilitySandbox 类实现
  - 资源限制（时间、内存、调用次数）
  - 执行监控和指标收集
  - 异常捕获和恢复
- **验收**:
  - [ ] 资源限制生效
  - [ ] 异常不影响主流程

### TASK-312: Capability 执行引擎
- **状态**: ⬜
- **优先级**: P0
- **依赖**: TASK-310
- **描述**:
  - CapabilityExecution 类实现
  - 调用已注册 Capability
  - 编排多 Capability 协作（串行/并行）
  - 执行结果收集和报告
- **验收**:
  - [ ] 单 Capability 调用成功
  - [ ] 多 Capability 编排成功
  - [ ] 执行结果可追溯

---

## 模块 5: Capability Events

### TASK-313: 事件系统
- **状态**: ⬜
- **优先级**: P1
- **依赖**: TASK-312
- **描述**:
  - 生命周期事件：registered, activated, deprecated, removed
  - 执行事件：invoked, completed, failed, timed_out
  - 治理事件：approved, denied, escalated
  - 事件存储和查询
- **验收**:
  - [ ] 事件正确触发
  - [ ] 事件可查询
  - [ ] 审计日志完整

---

## Release Gate

- [ ] **RG-301**: Skill Registry 注册/发现可用
- [ ] **RG-302**: Provider Registry 注册/选择可用
- [ ] **RG-303**: Capability Registry 组合/依赖可用
- [ ] **RG-304**: Governor 审批机制生效
- [ ] **RG-305**: Capability 执行引擎可用
- [ ] **RG-306**: 内置 Skill/Provider/Capability 注册完成

---

## 任务依赖图

```
TASK-301 (Skill 模型) ──→ TASK-302 (Skill 注册/发现) ──→ TASK-303 (内置 Skill) ──┐
                                                                              │
TASK-304 (Provider 模型) ──→ TASK-305 (Provider 注册/选择) ──→ TASK-306 (内置) ──┤
                                                                              │
TASK-302 + TASK-305 ──→ TASK-307 (Capability 模型) ──→ TASK-308 (Cap 注册/发现) ──→ TASK-309 (内置 Cap)
                                                                              │
TASK-308 ──→ TASK-310 (Governor) ──┬──→ TASK-311 (Sandbox)
                                    └──→ TASK-312 (执行引擎) ──→ TASK-313 (事件系统)
```
