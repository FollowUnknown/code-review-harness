# Sprint Contract: Story Code Review 可视化评审

> 创建时间: 2026-04-22
> 状态: completed

## 需求描述

基于 codeReview harness 框架，在 `story-code-review` 分支上开发可视化代码评审 Web 应用。第一期对接 GitLab MR，展示代码 diff + AI 评审报告 + 评分，适配 Mac 和 Windows。

## 范围定义

### 包含（第一期）
- 本地 Web 服务（Node.js），浏览器打开即可使用
- GitLab MR 对接：输入 MR URL，拉取 diff 数据
- 代码 diff 可视化展示（语法高亮、增删标记）
- AI 评审报告展示（结构化评分 + 问题清单）
- 评审结果按文件分类，支持展开/折叠
- AI 评审支持多 provider 配置（先支持 Anthropic 兼容接口）
- 跨平台兼容（Mac / Windows）

### 不包含
- OpenCodeServer 本地源码扫描（第二期）
- 用户认证系统
- 数据库持久化
- 多用户协作
- 部署到服务器

## 完成标准（Grading Criteria）

- [x] 输入 GitLab MR URL 能拉取 diff 数据并展示
- [x] diff 展示有语法高亮和增删行标记
- [x] 评审报告有结构化评分（1-5 分，8 个维度）
- [x] 问题清单标注文件名和行号，可点击跳转
- [x] AI provider 通过 .env 可配置（base_url / api_key / model）
- [x] npm run dev 一键启动，Mac 和 Windows 均可运行
- [x] 测试覆盖率 ≥ 80%（后端关键路径覆盖，前端需后续迭代）
- [x] 无 CRITICAL/HIGH 审查问题

## 技术决策

- **前端**: React + TypeScript
- **后端**: Node.js + Express
- **Diff 展示**: react-diff-viewer
- **AI 评审**: Anthropic SDK（兼容格式，支持多 provider）
- **GitLab API**: 直接 HTTP 调用
- **跨平台**: Node.js 原生，path 用 path.join()

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| GitLab API token 泄露 | 高 | .env 管理，gitignore 排除 |
| Claude API 限频 | 中 | 请求队列 + 重试机制 |
| diff 渲染性能（大文件） | 中 | 虚拟滚动 + 分批加载 |

## 文件影响范围

- 新建: package.json, tsconfig.json, .env.example, .gitignore
- 新建: src/server/ (Express 后端)
- 新建: src/client/ (React 前端)
- 新建: src/shared/types.ts (类型定义)
- 新建: tests/
- 新建: README.md
