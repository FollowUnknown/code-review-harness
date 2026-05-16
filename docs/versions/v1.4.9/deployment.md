# v1.4.9 测试环境部署手册（G4）

> 状态: completed
> 适用范围: 测试环境（单机）
> 目标: 在不改动业务代码的前提下，稳定承载前端页面、API 与 SSE 评审流

---

## 1. 部署目标与边界

本手册仅覆盖测试环境可部署、可观测、可排障：

- 前端与 API 同域访问（避免额外 CORS 与 cookie 问题）
- 反向代理正确透传 SSE 长连接
- 进程守护与日志可追踪
- 外部依赖（GitLab / LLM / 蓝湖）连通可验证

不覆盖：

- 多机高可用
- 多实例共享状态
- 生产级容灾

---

## 2. 拓扑与端口

推荐拓扑：

```text
浏览器
  ↓
Nginx :80/:443
  ├─ /      -> dist/client (SPA + 静态资源)
  └─ /api/* -> Node 应用 :3001 (npm run start)
                  ├─ /api/review* (SSE)
                  ├─ /api/llm/*
                  ├─ /api/review-requirement/*
                  └─ 其他 API
```

端口约定：

- 外部访问端口：`80` / `443`
- Node 监听端口：`PORT=3001`（可改，但需与 Nginx upstream 一致）

---

## 3. 应用目录与运行命令

部署目录约定（示例）：

```text
/opt/code-review/
  ├─ dist/
  │   ├─ client/
  │   └─ server/
  │       ├─ index.js
  │       └─ migrations/
  ├─ knowledge.db
  ├─ .env
  ├─ package.json
  └─ node_modules/
```

构建与启动：

```bash
npm ci
npm run build
PORT=3001 npm run start
```

关键说明：

- 前端页面由 Node 在 `dist/client` 提供，前端不需要单独起 dev server
- `npm run start` 读取 `dist/server/index.js`
- migration SQL 必须随 `dist/server/migrations` 一起发布（G3 已收口）

---

## 4. 环境变量最小集

必填：

- `PORT`
- `KNOWLEDGE_DB_PATH`
- `LLM_PROVIDER`
- `GITLAB_TOKEN`
- 对应 Provider 的密钥（如 `DEEPSEEK_API_KEY` / `ANTHROPIC_AUTH_TOKEN`）

推荐：

- `REVIEW_TIMEOUT_MINUTES`
- `GITLAB_HOST`
- `LANHU_TOKEN`
- `LANHU_BASE_URL`

说明：

- LLM provider/model/base URL 可在运行时写入 `settings` 表覆盖
- 密钥只允许通过环境变量注入，不写入仓库文件

---

## 5. Nginx 配置模板（含 SSE）

```nginx
server {
  listen 80;
  server_name _;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE 关键配置
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 3600;
    proxy_send_timeout 3600;
    add_header X-Accel-Buffering no;
  }
}
```

SSE 失败高发点：

- 未关闭 `proxy_buffering`
- `proxy_read_timeout` 太短
- upstream 端口与 `PORT` 不一致

---

## 6. 进程管理（推荐 systemd）

`/etc/systemd/system/code-review.service`：

```ini
[Unit]
Description=CodeReview Test Env Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/code-review
EnvironmentFile=/opt/code-review/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3
User=www-data
Group=www-data
StandardOutput=append:/var/log/code-review/app.log
StandardError=append:/var/log/code-review/app-error.log

[Install]
WantedBy=multi-user.target
```

管理命令：

```bash
sudo systemctl daemon-reload
sudo systemctl enable code-review
sudo systemctl restart code-review
sudo systemctl status code-review
```

---

## 7. 排障入口

页面打不开：

- `nginx -t`
- `sudo journalctl -u nginx -n 200 --no-pager`

API 正常但评审中断：

- `sudo tail -n 200 /var/log/code-review/app-error.log`
- 核对 Nginx SSE 配置是否完整

LLM 对接失败：

```bash
curl -X POST http://127.0.0.1:3001/api/llm/settings/llm/check
```

数据库疑似不一致：

- 执行 `npm run db:sync-test-env`
- 核对输出中的 `sourceDb` / `targetDb` / `schemaVersions` / `backupPaths`

---

## 8. 与 G5 的衔接

本手册只定义“怎么部署”和“怎么维持连接”；完整验收步骤与业务场景回归以 [smoke-checklist.md](./smoke-checklist.md) 为准。
