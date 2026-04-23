# 项目架构总览

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS v4 + Framer Motion | SPA，Vite 构建 |
| 后端 | Node.js + Express 5 + TypeScript | REST API + SSE |
| 数据库 | MySQL 8+（V2 起） | V1 用 SQLite |
| AI 评审 | Anthropic Claude / DeepSeek | 可配置多 provider |
| Diff 展示 | react-diff-viewer-continued | 语法高亮 |
| 构建 | Vite 6 | 前后端共享 tsconfig |

## 项目结构

```
src/
├── client/                  # 前端 React SPA
│   ├── components/          # UI 组件
│   ├── App.tsx              # 主应用入口
│   ├── main.tsx             # React 挂载点
│   └── index.css            # Tailwind 入口 + 主题变量
├── server/                  # 后端 Express
│   ├── routes/              # API 路由
│   │   ├── review.ts        # 评审 API（SSE 流式）
│   │   ├── settings.ts      # LLM 配置 API
│   │   ├── auth.ts          # 登录/注册 API（V2）
│   │   └── users.ts         # 用户管理 API（V2）
│   ├── services/            # 业务逻辑
│   │   ├── gitlab.ts        # GitLab API 对接
│   │   ├── reviewer.ts      # 评审核心逻辑
│   │   ├── classifier.ts    # 文件风险分级
│   │   ├── requirement.ts   # 需求理解
│   │   ├── knowledge.ts     # 知识库 CRUD
│   │   ├── lanhu.ts         # 蓝湖 API 对接
│   │   ├── settings.ts      # LLM 配置服务
│   │   └── llm.ts           # LLM 调用抽象层
│   ├── middleware/           # 中间件（V2）
│   │   └── auth.ts          # JWT 认证
│   ├── migrations/          # 数据库 migration（V2）
│   ├── db.ts                # 数据库连接
│   └── index.ts             # 服务启动入口
├── shared/                  # 前后端共享
│   ├── types.ts             # 类型定义
│   └── constants.ts         # 评审维度等常量
└── tests/                   # 测试
```

## V2 架构升级

详见 `docs/contracts/2026-04-23-v2-platform-upgrade.md`

主要变更：
1. SQLite → MySQL（统一开发/线上）
2. 新增用户系统（本地账号密码 + JWT）
3. 评审数据持久化 + 列表 + 继续评审
4. 评审存档（Review Plan）批量评审 + Markdown 导出
5. LLM 模块独立抽离（providers + prompts）

## 核心模块

### 评审流程

```
用户输入 MR URL
  → 解析 URL，连接 GitLab
  → 拉取 MR diff + 元数据
  → 文件风险分级（S/A/B/C）
  → 理解需求（蓝湖设计稿 or MR 推断）
  → 加载知识库
  → 按风险级别分批 LLM 评审
  → 合并评审报告
  → 提取学习点存入知识库
  → SSE 流式返回结果
```

### LLM 调用链

```
callLLM() → 根据配置分发
  ├── Anthropic SDK → Claude API
  └── HTTP POST → DeepSeek API (OpenAI-compatible)
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/review | 发起评审（SSE 流式响应） |
| GET | /api/settings/llm | 获取 LLM 配置 |
| PUT | /api/settings/llm | 更新 LLM 配置 |
