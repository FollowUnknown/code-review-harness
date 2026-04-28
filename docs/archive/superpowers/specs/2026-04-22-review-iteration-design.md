# Story Code Review 迭代设计

> 日期：2026-04-22
> 状态：已批准

---

## 目的

参考 claude-skills 的评审能力，为 Story Code Review 添加三个核心功能：
1. 文件风险分级 + 分批评审
2. 需求驱动评审（蓝湖对接）
3. 知识库积累（SQLite）

---

## 第一步：文件风险分级 + 分批评审

### 分级标准（完整复刻 claude-skills）

创建独立模块 `src/server/services/classifier.ts`。

| 级别 | 条件 | 评审策略 | review_mode | max_related_depth |
|------|------|---------|-------------|-------------------|
| S | 新组件/页面、核心业务、新 store、diff > 120 行 | 深度，8 维 | standard | 2 |
| A | 大改、核心方法、API/权限/安全、diff > 50 行 | 标准 | standard | 1 |
| B | 10-50 行、配置类 | 快速扫描 | diff_plus_self | 0 |
| C | < 10 行、忽略项、API.js、proxy.js | 主流程快扫 + 留痕 | diff_only | 0 |

### 风险升级规则（命中任一自动升级）

1. 请求 URL/path/method 变化
2. 导出签名变化
3. 枚举值/常量值变化
4. 路由守卫/权限字段变化
5. 环境变量变化
6. proxy target 变化
7. feature flag/开关默认值变化
8. 鉴权 header/token/cookie 变化
9. API 参数结构变化
10. 默认配置值变化且可能影响运行时行为
11. 新组件/页面（新 .vue/.tsx 文件）
12. 核心业务文件变更

### 低风险提前终止

以下场景不进子代理，但必须留痕（写入 checkpoint）：
- .gitignore
- 纯 .md 文档
- 纯注释/空白/文案微调
- proxy.js
- 纯构建配置
- 纯导出常量
- 小幅常量改动
- 纯聚合导出文件

### 批次大小

| 场景 | 每批文件数 |
|------|-----------|
| 含 S | 2-3 |
| 含 A | 3-4 |
| 纯 B/C | 5-7 |
| 强关联父子文件 | 尽量同批 |

### review_mode 约束

- `diff_only`：只看 diff，不读取关联文件
- `diff_plus_self`：只看 diff + 当前文件，不追 L1/L2
- `standard`：完整评审 + 关联文件读取

---

## 第二步：需求驱动评审 + 蓝湖对接

### 架构

```
用户输入：MR URL + 蓝湖链接（可选）
    ↓
需求理解阶段：
  1. 蓝湖链接 → 获取设计稿 → 生成需求文档
  2. 无蓝湖 → 从 MR 标题/diff 推断需求
    ↓
评审阶段：
  system prompt 注入需求背景 + 知识库 + 评审维度
  "这段代码是否在正确实现这个需求？"
```

### 蓝湖对接

**短期：** 直接 API 调用（`src/server/services/lanhu.ts`）

蓝湖 API：
- `lanhu_get_pages`：获取页面列表
- `lanhu_get_ai_analyze_page_result`：获取 AI 分析结果

**中期：** MCP Client（`@modelcontextprotocol/sdk`）

- 连接蓝湖 MCP Server（HTTP transport）
- 动态发现工具，不硬编码 API 路径
- 复用 claude-skills 已有的 MCP 配置

### 无蓝湖降级逻辑

1. 从 MR 标题推断需求类型（fix/feat/refactor/chore）
2. 从文件路径推断业务模块
3. 从 diff 推断功能点（新增 methods/props/watch 等）
4. 向用户展示摘要，确认是否修正

### 需求理解输出

`01-requirement-understanding`：
- 需求类型
- 业务模块
- 功能点列表
- 冲突与待确认（需求与代码不一致时标注）

---

## 第三步：知识库积累（SQLite）

### 数据库结构

```sql
CREATE TABLE entries (
  id TEXT PRIMARY KEY,          -- AP-001, EXP-007, ...
  type TEXT NOT NULL,            -- AP/EXP/BN/CONV
  project TEXT NOT NULL,         -- 项目名
  module TEXT,                   -- 业务模块
  severity TEXT,                 -- HIGH/MEDIUM/LOW
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'TEMP',    -- TEMP/CONFIRMED
  source_review TEXT,            -- 来源评审 ID
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  mr_url TEXT NOT NULL,
  project TEXT,
  report TEXT NOT NULL,          -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 知识条目类型

| 类型 | 前缀 | 含义 |
|------|------|------|
| 反模式 | AP | 常见错误（如内存泄漏） |
| 经验 | EXP | 评审洞察（如库的性能坑） |
| 业务名词 | BN | 领域术语 |
| 约定 | CONV | 项目规则 |

### 流程

```
评审完成 → AI 提取 learnings → TEMP 条目写入 DB
    ↓
用户确认 → status 改为 CONFIRMED
    ↓
下次评审 → 从 DB 读取知识注入 system prompt
```

### 物料策略

| 物料 | 筛选规则 |
|------|---------|
| AP (shared) | 全量，severity >= HIGH |
| AP (project) | 当前项目 |
| CONV | 全量 |
| EXP | 同项目；超 20 条取最近 + 模块匹配 |
| 总行数上限 | 子代理侧约 2000 行 |

---

## 文件影响范围

### 新建

| 文件 | 职责 |
|------|------|
| `src/server/services/classifier.ts` | 文件分级 + 风险检测 + 批次分配 |
| `src/server/services/lanhu.ts` | 蓝湖 API 对接 |
| `src/server/services/knowledge.ts` | 知识库 CRUD |
| `src/server/services/requirement.ts` | 需求理解（蓝湖数据解析 / MR 推断） |
| `src/server/db.ts` | SQLite 初始化 + 连接 |
| `src/server/routes/review.ts` | 重构：集成分级 + 需求 + 知识库 |
| `knowledge.db` | SQLite 数据库文件 |
| `tests/classifier.test.ts` | 分级逻辑测试 |
| `tests/knowledge.test.ts` | 知识库测试 |
| `tests/requirement.test.ts` | 需求理解测试 |

### 修改

| 文件 | 改动 |
|------|------|
| `src/server/services/reviewer.ts` | 重构：接受分级结果 + 需求背景 + 知识库 |
| `src/client/components/ReviewResult.tsx` | 展示分级信息 + 需求理解 |
| `src/shared/types.ts` | 新增分级、需求、知识库相关类型 |

---

## 范围边界

本设计覆盖三个核心功能的迭代。以下不在范围内：
- MCP Server 的搭建（中期目标）
- 前端组件测试补充
- OpenCodeServer 本地源码扫描（第二期）
