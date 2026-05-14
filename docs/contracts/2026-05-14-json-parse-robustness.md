# Contract: JSON 流式拼接容错增强

> 日期: 2026-05-14
> 状态: draft
> 类型: Business Task
> 版本: v1.4.9

## 背景

LLM 返回 2,738 字节 JSON，在第 61 行第 47 列有格式错误。SSE 增量拼接后 `parseReviewResponse` 的容错链（sanitize → fixQuotes → closeOpenStructures）未能修复，最终 fallback 到全部 3 分 + "无法解析评分"。

## 已知薄弱点

1. **closeOpenStructures 不区分 `{` 和 `[`**：截断时用 `}` 关闭 `[`，产生非法 JSON
2. **SSE chunk 切分脏字符**：chunk 恰好在 JSON 字符串中间切分，可能引入转义残留

## 范围

### 改动文件
- `src/server/llm/prompts/` — 优化 prompt 减少格式错误输出
- `src/server/services/reviewer.ts` 或相关 parse 函数 — 增强 parseReviewResponse 容错链

### 行为
- closeOpenStructures 区分 `{`/`}` 和 `[`/`]`
- 处理 SSE chunk 切分边界，清理拼接残留
- 提高畸形 JSON 的修复成功率

### 不做
- 不改变 LLM 返回格式的基本约定
- 不引入外部 JSON 修复库

## 验收标准

- [ ] closeOpenStructures 正确匹配 `[` → `]`，`{` → `}`
- [ ] SSE chunk 边界切分后拼接的 JSON 能被正确修复
- [ ] 现有测试不受影响
