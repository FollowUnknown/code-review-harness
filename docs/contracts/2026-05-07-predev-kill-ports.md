# Contract: npm run dev 启动前自动杀端口

- **ID**: 2026-05-07-predev-kill-ports
- **Status**: confirmed
- **Type**: bugfix
- **Created**: 2026-05-07

## 背景

用户执行 `npm run dev` 时，如果旧进程还在占用 3001/5173 端口，会报端口冲突错误，需要手动杀进程再重启。希望启动时自动清理。

## 范围

- 在 `package.json` 的 `scripts` 中添加 `predev` 脚本
- `predev` 在 `npm run dev` 之前自动执行，kill 3001 和 5173 端口的旧进程
- 无端口占用时静默通过，不影响正常启动

## 不做

- 不修改其他脚本
- 不修改服务端代码

## 验收标准

1. `npm run dev` 启动前自动 kill 3001/5173 端口旧进程
2. 无进程占用时不报错
3. 现有 dev/dev:server/dev:client 脚本行为不变
