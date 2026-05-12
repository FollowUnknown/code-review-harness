# v1.4.5: GitLab API Preview + 评审性能优化

> 状态: 规划中
> 前置: v1.4.4
> 后置: v1.5.0

## 目标

需求评审 Preview 阶段从 3 分钟降到 10 秒内，通过 GitLab API 替代本地 git diff 全量扫描。

## 核心改动

1. **repo_mappings 加 GitLab 配置**：`gitlab_host` + `gitlab_project_path`
2. **Preview 改用 GitLab Compare API**：并行请求，无需本地仓库
3. **Review 的 diff 也可选 GitLab API**：省掉本地 `git diff` 步骤

## 关联 Contract

- `2026-05-12-v1.4.5-gitlab-preview.md`（待创建）

## 风险

- GitLab API 可能有 rate limit
- 项目未配置 GitLab 信息时需要 fallback 到本地扫描
- GitLab Compare API 对大 diff 可能有截断
