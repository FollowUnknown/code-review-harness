# v1.4.9 任务拆解

## 任务总览

| G | Contract | 目标 | 状态 |
|---|----------|------|------|
| G1 | `2026-05-16-test-env-build-startup.md` | 修复构建阻塞，明确测试环境启动链路 | completed |
| G2 | `2026-05-16-test-env-runtime-config.md` | 收口环境变量、密钥、外部依赖清单 | completed |
| G3 | `2026-05-16-test-env-data-persistence.md` | 收口 SQLite 路径、备份、Migration 策略 | completed |
| G4 | `2026-05-16-test-env-topology-sse.md` | 明确反向代理、SSE、进程管理部署方案 | completed |
| G5 | `2026-05-16-test-env-smoke-checklist.md` | 输出部署步骤、冒烟检查和回归清单 | completed |

## 推荐执行顺序

1. G1 构建与启动链路
2. G2 运行时配置与密钥治理
3. G3 数据持久化与 Migration
4. G4 测试环境拓扑与 SSE
5. G5 冒烟验证与发布清单

## 说明

- G1-G4 都属于 Platform Task
- G2/G3/G4 涉及配置、密钥、SQL、高可用与长连接，必须分开审查
- G5 依赖前四项至少完成设计确认后才能进入实施
- G4 产物：`deployment.md`
- G5 产物：`smoke-checklist.md`
