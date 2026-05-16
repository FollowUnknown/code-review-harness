# 隐性业务约定

> 记录那些"大家都知道但没人写下来"的规则。
> 每次发现新的隐性约定，立即补充到这里。

---

## 约定记录

<!-- 格式：
### [约定名称]
- **场景**：什么时候会触发
- **规则**：具体约定内容
- **违反后果**：如果 AI 不知道会出什么问题
-->

### better-sqlite3 单连接阻塞
- **场景**：SSE 长连接评审进行中时，其他页面/请求被阻塞
- **规则**：写操作（saveLLMLog、updateCheckpoint、updateJob）占用唯一 `getDb()` 连接，同步 API 阻塞事件循环。所有只读方法必须用 `getReadDb()`（独立 readonly 连接），JWT secret 必须内存缓存
- **违反后果**：评审期间其他用户无法加载任何页面，auth 中间件被 DB SELECT 阻塞导致全站卡死
- **发现日期**：2026-05-13
- **涉及文件**：`src/server/db.ts`(getReadDb), `src/server/services/auth.ts`(cachedJwtSecret), `src/server/services/settings.ts`(getSetting→getReadDb)

### Contract 流程无 hotfix 豁免
- **场景**：用户报告线上 Bug 或紧急问题
- **规则**：即使问题紧急，`src/` 变更仍需先建 Contract 再实施。可走简化 Contract（最小范围），但不能跳过
- **违反后果**：改动范围不可控，DB 变更绕过红线审查，代码审查缺失
- **发现日期**：2026-05-13
- **事件**：Toast 通知、DB 优化、resume 修复三项改动全部跳过 Contract 直接实施

### 评审后端默认 GitLab 协议
- **场景**：部署后进行 MR/需求评审时，用户期望直接对接 GitHub PR
- **规则**：当前业务评审后端默认以 GitLab API 与 GitLab diff 类型为主协议；GitHub 目前仅可作为代码托管 remote，不等同于已支持 GitHub PR 评审
- **违反后果**：部署验收阶段出现“代码已推送但评审不可用”的误判，导致连通性排查方向错误
- **发现日期**：2026-05-16
- **涉及文件**：`src/server/services/gitlab.ts`、`src/server/routes/reviews.ts`、`src/shared/types.ts`
