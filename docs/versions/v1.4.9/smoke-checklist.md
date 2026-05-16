# v1.4.9 测试环境完整测试场景（G5）

> 状态: completed
> 目标: 覆盖首次部署、升级部署、回滚、外部依赖异常、SSE 长连接异常等关键场景
> 前提: 已按 [deployment.md](./deployment.md) 完成部署

---

## 1. 测试前准备

- 确认 Node 服务已启动：`PORT=3001 npm run start` 或 systemd 已拉起
- 确认数据库路径：`KNOWLEDGE_DB_PATH` 指向测试环境目标库
- 确认测试环境数据库与本地基线一致（你的要求）：
  - 执行 `npm run db:sync-test-env`
  - 记录 `sourceDb`、`targetDb`、`backupPaths`、`schemaVersions`
- 准备一个有效 GitLab token 与可访问的 MR URL
- 准备一个可用 LLM key（例如 DeepSeek）

---

## 2. 核心冒烟清单（上线后必测）

每项都要记录结果：`通过 / 失败 / 备注`。

| 序号 | 场景 | 操作 | 预期结果 |
|---|---|---|---|
| S01 | 服务存活 | `curl http://127.0.0.1:3001/api/auth/status` | `200` 且返回 `needsSetup` 字段 |
| S02 | 首页可访问 | 浏览器访问 `/` | 页面可加载，无白屏 |
| S03 | 静态资源 | 浏览器网络面板检查 JS/CSS | 无 404/500 |
| S04 | LLM 配置读取 | `GET /api/llm/settings/llm` | 返回 provider/model/baseUrl |
| S05 | LLM 连通 | `POST /api/llm/settings/llm/check` | `ok: true` |
| S06 | 登录状态 | `GET /api/auth/me`（带 token） | 正常返回用户信息 |
| S07 | GitLab token 状态 | `GET /api/review-requirement/gitlab-token-status` | 返回 token 可用状态 |
| S08 | Repo Mapping | `GET /api/repo-mapping` | 可返回映射列表 |
| S09 | SSE（通用评审） | 发起 `POST /api/review/review` | 持续收到 SSE 数据，直到 COMPLETE |
| S10 | SSE（需求评审） | 发起 `POST /api/review-requirement/requirement` | 持续收到 SSE 数据，包含进度推进 |
| S11 | 暂停 | `POST /api/review/pause` | 返回成功，任务进入 paused |
| S12 | 恢复 | `POST /api/review/resume` | 从 checkpoint 恢复，继续推送 SSE |
| S13 | 历史报告 | `GET /api/reviews` + `GET /api/reviews/:id` | 列表和详情可读 |
| S14 | 子报告 | `GET /api/reviews/:id/sub-reports` | 子报告可返回 |
| S15 | 数据一致性 | 复查 sync 指纹文件 | `sourceDb` 为本地基线，`schemaVersions` 完整 |

---

## 3. 完整测试场景（首次部署）

1. 代码与依赖
   - 执行 `npm ci`
   - 执行 `npm run build`
   - 预期：`dist/client` 与 `dist/server` 产物存在
2. 数据同步
   - 执行 `npm run db:sync-test-env`
   - 预期：覆盖前自动备份目标库并生成指纹
3. 启动服务
   - 执行 `PORT=3001 npm run start`
   - 预期：日志出现 `Server running on http://localhost:3001`
4. 网关访问
   - 浏览器通过 Nginx 域名访问
   - 预期：首页与 API 都可访问
5. 冒烟项执行
   - 逐条执行 `S01~S15`
   - 预期：全部通过

---

## 4. 完整测试场景（升级部署）

1. 升级前快照
   - 备份当前 `dist/`、`.env`、目标 DB
2. 重新构建与替换
   - 拉取新代码，执行 `npm ci && npm run build`
3. 数据同步策略
   - 若需要用最新本地基线覆盖测试库，执行 `npm run db:sync-test-env`
4. 重启服务
   - `systemctl restart code-review`（或手工重启）
5. 回归验证
   - 至少执行 `S01、S05、S09、S10、S11、S12、S15`

---

## 5. 完整测试场景（回滚）

触发条件（任一满足即回滚）：

- 首页可开但 SSE 评审连续失败
- LLM 连通检查失败且无法快速修复
- 数据异常且无法通过重新同步恢复

回滚步骤：

1. 停服务
2. 恢复上一个可用 `dist/`
3. 恢复最近一次目标库备份（来自 `backupPaths`）
4. 启动服务
5. 执行最小回归：`S01、S02、S05、S09`

---

## 6. 异常场景测试（必须覆盖）

### A1. LLM key 错误

- 操作：将 key 改成无效值，执行 `POST /api/llm/settings/llm/check`
- 预期：返回失败，错误信息可读，不崩溃

### A2. GitLab token 缺失

- 操作：清空 `GITLAB_TOKEN`，触发需求评审
- 预期：接口返回明确错误，前端有可读提示

### A3. SSE 反代配置错误

- 操作：临时去掉 `proxy_buffering off` 并重载 Nginx
- 预期：评审流出现卡顿或延迟，恢复配置后恢复正常

### A4. 数据库路径错误

- 操作：将 `KNOWLEDGE_DB_PATH` 指向不存在路径
- 预期：启动失败且日志可定位

### A5. 超时场景

- 操作：设置较小 `REVIEW_TIMEOUT_MINUTES` 并发起长评审
- 预期：SSE 返回超时提示，服务不挂死

---

## 7. 验收记录模板

```markdown
# 测试环境验收记录（YYYY-MM-DD）

## 构建与启动
- [ ] npm run build
- [ ] npm run start / systemd restart

## 数据一致性
- [ ] 已执行 db:sync-test-env
- [ ] 指纹核对通过（source/target/schemaVersions）

## 核心冒烟
- [ ] S01
- [ ] S02
- [ ] S03
- [ ] S04
- [ ] S05
- [ ] S06
- [ ] S07
- [ ] S08
- [ ] S09
- [ ] S10
- [ ] S11
- [ ] S12
- [ ] S13
- [ ] S14
- [ ] S15

## 结论
- [ ] 通过，可继续测试
- [ ] 不通过，需回滚/修复
```
