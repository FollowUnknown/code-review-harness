# Contract: v1.4.0 Phase 1 -- 数据模型 + 产品线基础

> 日期: 2026-05-10
> 状态: completed
> 类型: Business Task
> 版本: v1.4.0

## 背景

v1.4.0 引入产品线概念，支持需求评审（多项目合并评审）。Phase 1 负责底层数据模型和基础 CRUD。

## 目标

1. 新增 product_lines 表和 project_dependencies 表
2. 迁移 repo_mappings 表，添加 product_line_id 和 tech_stack 列
3. 迁移 review_jobs 表，添加 review_type 和 product_line_id 列
4. 扩展 TypeScript 类型定义
5. 新增产品线 CRUD 服务和 API 路由

## 不做什么

- 不做知识库分层改造（Phase 2）
- 不做需求评审路由（Phase 3）
- 不做前端页面
- 不做 Maven 依赖扫描器
- 不改变现有 API 的行为

## 方案

按改动清单顺序实施 7 个文件的变更。

## 验收标准

- [x] 所有新列有 DEFAULT 值，不影响现有数据
- [x] 现有 API 不变
- [x] TypeScript 编译通过（npx tsc --noEmit）
- [x] 产品线 CRUD API 可正常工作
