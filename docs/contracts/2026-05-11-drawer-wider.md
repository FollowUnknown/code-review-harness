# Contract: 知识库抽屉弹窗加宽

> 日期: 2026-05-11
> 状态: completed
> 类型: Business Task
> 版本: v1.4.3

## 需求
用户反馈知识库页面（/knowledge）抽屉弹窗太窄，要求改大。

## 范围
- `src/client/pages/KnowledgePage.tsx`: DetailDrawer 宽度 520px → 720px
- `src/client/components/KnowledgeDetailDrawer.tsx`: 宽度 520px → 720px

## 不改
- 不改其他组件
- 不改抽屉内部布局

## 验收
- [ ] 知识库抽屉宽度变大为 720px
- [ ] ReviewDetailPage 中的 KnowledgeDetailDrawer 同步变大
