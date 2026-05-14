# Contract: 默认路由重定向到需求评审 + 删除旧 HomePage

> 日期: 2026-05-14
> 状态: completed
> 类型: Business Task
> 版本: v1.4.9

## 背景

需求评审是当前主要业务入口，旧的代码评审 HomePage（GitLab MR 提交表单）不再需要。

## 范围

### 改动文件
- `src/client/App.tsx` — `/` 路由改为 `<Navigate to="/requirement-review" replace />`，删除 HomePage 组件定义，清理相关 import 和未使用的状态/函数

### 行为
- 访问 `/` 自动重定向到 `/requirement-review`
- 删除 `HomePage` 函数组件（GitLab MR 提交表单 + Lanhu 输入 + SSE 流式展示逻辑）
- 其他路由不受影响

### 不做
- 不删除 `/reviews`、`/reviews/:id` 等已有评审查看路由
- 不修改侧边栏导航
- 不修改后端接口

## 验收标准

- [ ] 访问 `/` 自动跳转到 `/requirement-review`
- [ ] HomePage 组件及相关代码已删除
- [ ] TypeScript 编译通过
- [ ] 无未使用的 import 残留
