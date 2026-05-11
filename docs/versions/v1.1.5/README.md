# v1.1.5 - 用户管理与分配

> 版本周期: 待定（依赖 v1.1.0 完成）
> 状态: ✅ 完成
> 前置: v1.1.0（Harness 框架升级）
> 后置: v1.2.0（AI 驱动评审质量）

## 版本目标

建立团队级代码评审协作基础，支持多用户登录、个人评审计划管理，以及知识库权限分级管控（普通成员沉淀知识，管理员审核入库）。

## 核心功能

### 1. 用户系统

**功能清单**:
- 用户注册/登录（邮箱+密码）
- JWT Token 认证
- 用户基础信息（昵称、头像、角色）
- 密码找回/重置

**技术要点**:
- bcrypt 密码加密
- JWT 过期与刷新机制
- 登录态持久化（localStorage + 自动刷新）

### 2. 角色与权限

**角色定义**:
| 角色 | 权限 |
|------|------|
| 管理员 | 查看所有用户、查看所有评审计划、审核 Knowledge 入库、管理用户角色 |
| 普通用户 | 创建自己的评审计划、执行代码评审、提交 Knowledge 建议（待审核） |

**权限验证点**:
- API 级别：中间件统一鉴权
- 数据级别：查询自动过滤（普通用户只能看到自己的数据）
- 操作级别：敏感操作二次确认（如删除、角色变更）

### 3. 个人评审计划

**功能清单**:
- 创建/编辑/删除评审计划
- 计划内添加/删除 MR 链接
- 批量执行评审（队列模式）
- 查看历史评审记录
- 导出评审报告（Markdown）

**数据模型**:
```typescript
interface ReviewPlan {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  items: ReviewPlanItem[];
  createdAt: number;
  updatedAt: number;
}

interface ReviewPlanItem {
  id: string;
  mrUrl: string;
  status: 'pending' | 'reviewing' | 'completed' | 'failed';
  reviewId?: string;
  result?: ReviewResult;
  position: number;
}
```

### 4. 知识库权限管控

**权限规则**:
| 操作 | 普通用户 | 管理员 |
|------|----------|--------|
| 提交 Knowledge 建议 | ✅ | ✅ |
| 查看已入库 Knowledge | ✅ | ✅ |
| 审核/入库 Knowledge | ❌ | ✅ |
| 编辑/删除已入库 Knowledge | ❌ | ✅ |
| 查看所有待审核建议 | ❌ | ✅ |

**流程设计**:
```
普通用户评审 → 发现知识 → 提交 Knowledge 建议
                                    ↓
                        管理员审核面板（查看所有建议）
                                    ↓
                        审核通过 → 入库到知识库
                        审核拒绝 → 反馈给用户
```

## 与前后版本的关系

### 前置依赖（v1.1.0）
- **Agent 上下文管理**：多用户会话隔离需要 Agent 上下文快照支持
- **Contract 子任务拆分**：个人评审计划的大规模 MR 评审需要并行执行
- **Session 恢复机制**：用户登录态与评审会话的绑定与恢复

### 后置支撑（v1.2.0）
- **用户数据基础**：v1.2.0 的 AI 驱动评审需要基于用户历史评审数据训练/优化
- **个人知识库**：v1.1.5 用户沉淀的知识在 v1.2.0 中通过 Prompt 注入
- **评审习惯学习**：v1.2.0 的多轮交互基于 v1.1.5 的用户评审模式学习

## 技术要点

### 数据库变更
```sql
-- 用户表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'member' CHECK(role IN ('admin', 'member')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 评审计划表
CREATE TABLE review_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'completed', 'archived')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 评审计划项表
CREATE TABLE review_plan_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  mr_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewing', 'completed', 'failed')),
  review_id TEXT,
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES review_plans(id)
);

-- Knowledge 审核表（扩展原 knowledge 表）
ALTER TABLE knowledge_entries ADD COLUMN suggested_by TEXT;
ALTER TABLE knowledge_entries ADD COLUMN reviewed_by TEXT;
ALTER TABLE knowledge_entries ADD COLUMN review_status TEXT DEFAULT 'approved' 
  CHECK(review_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE knowledge_entries ADD COLUMN review_comment TEXT;
```

### API 变更
```typescript
// 用户认证
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me

// 评审计划（需认证）
GET    /api/plans
POST   /api/plans
GET    /api/plans/:id
PUT    /api/plans/:id
DELETE /api/plans/:id
POST   /api/plans/:id/items
DELETE /api/plans/:id/items/:itemId
POST   /api/plans/:id/execute

// Knowledge 审核（管理员）
GET  /api/knowledge/pending
POST /api/knowledge/:id/review
```

## 验收标准

### 功能验收

| 模块 | 验收点 | 通过标准 |
|------|--------|----------|
| 用户系统 | 注册/登录/登出 | 全流程正常，Token 正确过期 |
| 用户系统 | 角色权限 | 普通用户无法访问管理员接口 |
| 评审计划 | CRUD | 增删改查正常，数据持久化 |
| 评审计划 | 批量执行 | 多个 MR 顺序/并行执行正常 |
| 知识库 | 提交建议 | 普通用户提交，状态为 pending |
| 知识库 | 管理员审核 | 审核通过入库，拒绝反馈理由 |

### 性能验收

- [ ] 用户登录响应时间 < 500ms
- [ ] 评审计划列表加载 < 300ms（100 个计划）
- [ ] 批量执行 10 个 MR 总时间 < 串行执行的 60%
- [ ] 知识库审核操作 < 200ms

### 安全验收

- [ ] 密码哈希存储（bcrypt）
- [ ] JWT Token 防篡改
- [ ] API 权限中间件全覆盖
- [ ] SQL 注入防护（参数化查询）

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| JWT Token 安全问题 | 高 | 使用成熟库，定期轮换 Secret |
| 多用户并发评审冲突 | 中 | 乐观锁机制，冲突提示用户 |
| 知识库审核流程复杂 | 中 | 简化第一版，后续迭代优化 |
| 权限边界不清晰 | 中 | 详细权限矩阵文档，测试覆盖 |

---

*本文档为 v1.1.5 详细需求，确认后进入 Harness 执行阶段*