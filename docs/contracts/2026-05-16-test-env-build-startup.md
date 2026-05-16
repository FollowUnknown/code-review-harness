# Contract: 测试环境构建与启动链路闭环

> 日期: 2026-05-16
> 状态: completed
> 类型: Platform Task
> 版本: v1.4.9

## 背景

当前项目前端可构建，但服务端正式构建链路未闭环：`package.json` 中 `build:server` 依赖 `tsconfig.server.json`，而仓库中不存在该文件，导致 `npm run build` 失败。与此同时，项目缺少明确的测试环境启动入口与部署目录约定。

如果不先收口构建与启动链路，后续配置、反向代理、冒烟验证都没有稳定基线。

## 范围

### 改动对象

- `package.json` — 梳理 `build` / `start` / `dev` 脚本职责
- `tsconfig.server.json` 或等价服务端编译方案
- `src/server/index.ts` — 如有必要，收口部署启动路径约定
- 部署辅助脚本或文档（如 `scripts/`、`docs/`）

### 目标行为

1. 前后端构建命令职责清晰，`npm run build` 可成功产出测试环境所需文件
2. 有明确的服务端启动命令，避免仅能依赖本地开发态 `tsx watch`
3. 静态资源与服务端启动目录关系明确，不依赖偶然的 `cwd`
4. 构建失败时能快速定位到前端产物、服务端产物、配置文件哪一层出错

## 不做

- 不在本 Contract 内处理环境变量、密钥、GitLab/LLM 配置
- 不在本 Contract 内做 Nginx / PM2 / systemd 细节
- 不在本 Contract 内改业务路由、评审逻辑或前端功能

## 验收标准

- [ ] `npm run build` 成功
- [ ] 测试环境有明确的启动命令
- [ ] 静态资源路径与服务端启动路径有文档说明
- [ ] 不引入新的 `src/` 范围外隐式依赖

## 架构确认（2026-05-16）

### 对象

- **构建入口**：`npm run build`
- **前端产物**：`dist/client`
- **服务端产物**：`dist/server`
- **启动入口**：测试环境使用编译后的 Node 入口，不直接使用 `tsx watch`

### 状态流

```
源码
  ├─ vite build           → dist/client
  └─ tsc server compile   → dist/server
        ↓
   npm run start
        ↓
  Express 提供 API + 静态资源
```

### 设计决策

1. `build` 继续保留“前后端一次性产出”的单入口，不拆成多套部署命令给使用者选择
2. 新增明确的服务端编译配置，优先采用 `tsconfig.server.json` 收口，而不是把服务端继续留在开发态运行
3. 补充 `start` 脚本，面向测试环境运行编译产物
4. 静态资源路径继续兼容现有 `dist/client`，但需要在实现阶段明确 `cwd` 假设是否保留，若保留则必须文档化

### 边界

- 这里不处理 `.env` 内容与密钥字段
- 这里不处理 PM2 / systemd / Nginx
- 这里不处理 SQLite 路径和备份

## 开发结果（2026-05-16）

- 新增 `tsconfig.server.json`，为服务端与 `src/shared` 提供独立编译配置
- `package.json` 新增 `start` 脚本，测试环境可直接运行编译产物
- `src/server/index.ts` 改为基于 `__dirname` 解析 `dist/client`，不再依赖 `process.cwd()`

## 验证结果

- [x] `npm run build` 成功
- [x] `npm run build:server` 成功
- [x] `npm run typecheck` 成功
- [x] `npm run start` 在当前工作区完成真实监听验证
  - 说明：使用 `PORT=3006 npm run start` 成功启动；`curl http://127.0.0.1:3006/api/auth/status` 返回 `200` 与 `{"needsSetup":false}`，证明服务已连接现有本地数据库

## 结论

- 用户已验收通过，G1 完成
