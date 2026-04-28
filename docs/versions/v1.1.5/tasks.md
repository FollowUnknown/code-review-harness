# v1.1.5 Implementation Tasks

> 状态说明：⬜ 待开始 | 🔄 进行中 | ✅ 完成 | ❌ 阻塞 | ⏭ 跳过
> 前置: v1.1.0（Execution Superpower 完成）

---

## 现有实现盘点

大量基础设施已存在，实际需要补充的差距较小：

| 模块 | 已有 | 差距 |
|------|------|------|
| 用户系统 | users表、setup/login/me、authRequired/adminOnly | 邮箱注册、Token refresh/logout |
| 评审计划 | plans CRUD、批量执行(SSE)、导出、3个前端页面 | 基本完整 |
| Knowledge | CRUD、confirm/deprecate、前端页面 | 审核流程（suggested_by/reviewed_by/review_status） |
| 前端 | LoginPage、PlanListPage、PlanDetailPage、KnowledgePage | 注册页、用户管理页、审核面板 |

---

## 模块 1: 用户系统补充

### TASK-101: Token 刷新/登出 API
- **状态**: ✅
- **优先级**: P0
- **依赖**: 无
- **描述**:
  - `POST /api/auth/refresh` — Token 刷新
  - `POST /api/auth/logout` — 登出（客户端清除 Token，服务端可选 blacklist）
- **验收**:
  - [ ] Token 过期后可刷新
  - [ ] 登出后 Token 失效

### TASK-102: 前端注册页面
- **状态**: ✅
- **优先级**: P1
- **依赖**: 无
- **描述**:
  - 注册表单（username + 密码 + displayName）
  - 仅在 setup 阶段显示（已有用户时隐藏注册入口）
  - Token 持久化和自动刷新
- **验收**:
  - [ ] 首次 setup 端到端可用
  - [ ] 已有用户后注册入口隐藏

### TASK-103: 用户管理页面（管理员）
- **状态**: ✅
- **优先级**: P1
- **依赖**: 无
- **描述**:
  - 用户列表（管理员可见所有用户）
  - 角色变更操作
  - 删除用户（已有 API，补前端）
- **验收**:
  - [ ] 管理员可查看/管理用户
  - [ ] 普通用户无法访问此页面

---

## 模块 2: Knowledge 审核流程

### TASK-104: Knowledge 审核字段迁移
- **状态**: ✅
- **优先级**: P0
- **依赖**: 无
- **描述**:
  - knowledge_entries 表增加字段：
    - `suggested_by TEXT` — 提交者 user_id
    - `reviewed_by TEXT` — 审核者 user_id
    - `review_status TEXT DEFAULT 'approved' CHECK(review_status IN ('pending', 'approved', 'rejected'))` — 审核状态
    - `review_comment TEXT` — 审核备注
  - 已有数据 review_status 默认 approved（不破坏现有流程）
  - 在 db.ts 的 migrateKnowledgeEntriesTable 中添加
- **验收**:
  - [ ] Migration 脚本可执行
  - [ ] 已有数据 review_status 为 approved

### TASK-105: Knowledge 提交建议 API
- **状态**: ✅
- **优先级**: P0
- **依赖**: TASK-104
- **描述**:
  - 修改 `POST /api/knowledge/` — 普通用户也可创建，review_status = pending
  - 管理员创建时 review_status = approved（保持现有行为）
  - `GET /api/knowledge/` 列表增加 review_status 过滤
- **验收**:
  - [ ] 普通用户提交状态为 pending
  - [ ] 管理员提交直接 approved

### TASK-106: Knowledge 管理员审核 API
- **状态**: ✅
- **优先级**: P0
- **依赖**: TASK-104
- **描述**:
  - `GET /api/knowledge/pending` — 查看待审核列表（admin only）
  - `POST /api/knowledge/:id/review` — 审核通过/拒绝（admin only）
    - 通过：review_status → approved, reviewed_by = 当前用户
    - 拒绝：review_status → rejected, reviewed_by = 当前用户, review_comment = 理由
- **验收**:
  - [ ] 管理员可查看待审核列表
  - [ ] 审核通过/拒绝正常工作
  - [ ] 普通用户无法访问审核接口

### TASK-107: 知识库审核前端
- **状态**: ✅
- **优先级**: P1
- **依赖**: TASK-105, TASK-106
- **描述**:
  - KnowledgePage 增加审核标签页（管理员可见）
  - 提交建议表单（普通用户）
  - 我的建议列表（查看审核状态）
  - 审核面板（管理员：待审核列表、通过/拒绝操作）
- **验收**:
  - [ ] 提交建议端到端可用
  - [ ] 管理员审核端到端可用

---

## 安全验收

### TASK-108: 安全专项检查
- **状态**: ✅
- **优先级**: P0
- **依赖**: 所有功能任务
- **描述**:
  - 密码哈希验证（bcryptjs）
  - JWT Token 防篡改测试
  - API 权限中间件全覆盖检查
  - SQL 注入防护（参数化查询）
- **验收**:
  - [ ] 无硬编码密钥
  - [ ] 密码不可逆
  - [ ] 所有 API 鉴权覆盖

---

## Release Gate

- [ ] **RG-101**: Token 刷新/登出正常
- [ ] **RG-102**: 注册页面可用
- [ ] **RG-103**: 管理员用户管理页面可用
- [ ] **RG-104**: Knowledge 提交建议 → 审核入库流程
- [ ] **RG-105**: 安全验收全部通过

---

## 任务依赖图

```
TASK-101 (refresh/logout API) ──→ TASK-102 (注册前端)
TASK-103 (用户管理页) ← 无依赖，可并行

TASK-104 (Knowledge 审核字段) ──┬──→ TASK-105 (提交 API)
                                └──→ TASK-106 (审核 API) ──→ TASK-107 (审核前端)

TASK-108 (安全检查) ← 依赖所有功能任务完成
```
