# Contract: 导入后端 Java 评审经验规则到知识库

> 日期: 2026-05-11
> 状态: in_progress
> 类型: Business Task
> 版本: v1.4.3

---

## 背景

后端 Java 同学提供了一份评审经验文档 (`qiqiao-code-review-rules.md`)，来源于 qiqiao-saas 代码库的 280 条 FIXME 注释 + 2363 条 git 提交，包含 50 条规则（P0:5 / P1:13 / P2:32），每条规则有 ❌ 错误代码 + ✅ 正确代码示例。需要导入到知识库系统。

## 范围

### 做
1. DB schema：`knowledge_entries` 表加 `bad_code` TEXT 和 `good_code` TEXT 两列
2. 类型层：`KnowledgeEntry` 接口、shared types、API 路由同步更新
3. 服务层：`addEntry`/`updateEntry` 支持新字段，`buildKnowledgePrompt` 预留按需注入
4. Seed：重写 `scripts/seed-java-knowledge.ts`，将 50 条规则分类为 AP/CONV/EXP 导入，与现有 20 条去重合并
5. 版本：创建 `docs/versions/v1.4.3/`

### 不做
- 不对现有 371 条 entry 回填 bad_code/good_code
- 不改造前端 /knowledge 页面展示
- v1.4.3 中不将代码字段注入 LLM prompt（token 预算约束）
- 不修改评审流程或知识注入逻辑

## 验收标准

| # | 标准 | 验证方式 |
|---|------|---------|
| 1 | `knowledge_entries` 表包含 `bad_code`、`good_code` 列 | `sqlite3 knowledge.db ".schema knowledge_entries"` |
| 2 | API POST/PUT `/api/knowledge` 接受并存储新字段 | curl 测试 |
| 3 | 50 条规则全部导入，无重复 | `SELECT COUNT(*) FROM knowledge_entries WHERE project='java-backend' AND scope_level='foundation'` |
| 4 | 与现有 20 条无 id 冲突 | 检查 fingerprint 去重 |
| 5 | 现有功能不受影响（已有测试通过） | `npx vitest run tests/knowledge.test.ts` |

## 文件影响范围

| 文件 | 改动类型 |
|------|---------|
| `src/server/db.ts` | 改 — migrateKnowledgeEntriesTable() |
| `src/server/services/knowledge.ts` | 改 — 接口 + CRUD + prompt builder |
| `src/server/routes/knowledge.ts` | 改 — 提取新字段 |
| `src/shared/types.ts` | 改 — 类型补充 |
| `scripts/seed-java-knowledge.ts` | 重写 — 50 条规则导入 |
| `docs/versions/v1.4.3/README.md` | 新建 |
| `docs/versions/README.md` | 改 — 插入 v1.4.3 |

## 风险

- **Token 预算**：代码字段不注入 prompt，仅 API 提供，风险可控
- **重叠检测**：与现有 20 条可能重叠 5-6 条，fingerprint 去重处理
- **DB migration 向前兼容**：ALTER TABLE ADD COLUMN 可重复执行，SQLite 自动忽略已存在列
