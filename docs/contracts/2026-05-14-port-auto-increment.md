# Contract: 默认端口 +5 避免冲突

> 日期: 2026-05-14
> 状态: review_pending
> 类型: Business Task
> 版本: v1.4.9

## 背景

多个项目并行开发时，默认端口 3001/5173 容易与其他项目冲突。统一 +5 避免冲突。

## 范围

### 改动文件
- `src/server/index.ts` — 默认端口 3001 → 3006
- `vite.config.ts` — 前端端口 5173 → 5178，proxy 目标 3001 → 3006
- `package.json` — predev 脚本中的端口引用同步更新

### 行为
- 后端默认端口改为 3006
- 前端默认端口改为 5178
- vite proxy 指向新的后端端口 3006
- predev kill 脚本同步更新端口号

### 不做
- 不改 .env 中的 PORT 配置方式（用户仍可通过 PORT 环境变量覆盖）
- 不引入自动递增机制

## 验收标准

- [ ] `npm run dev` 后端启动在 3006，前端启动在 5178
- [ ] 前端 proxy 能正确转发到后端
- [ ] predev 脚本 kill 正确的端口
- [ ] .env 中显式设置 PORT 仍能覆盖默认值
