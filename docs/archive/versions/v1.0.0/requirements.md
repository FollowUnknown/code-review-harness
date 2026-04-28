# v1.0.0 详细需求文档

> 版本: v1.0.0
> 迭代周期: 2026-04-28 ~ 2026-05-09
> 文档状态: 规划中（待用户确认）

---

## Sprint Contract

### 范围定义

**包含**:
- Issues 筛选功能（ALL/CRITICAL/HIGH/MEDIUM/LOW）
- Issues 分组功能（不分组/按文件/按 Severity）
- 视觉层次优化（图标、颜色、边框）
- 代码片段预览（上下文 + 高亮）
- 空状态和加载态
- 默认按文件分组

**不包含**:
- 移动端完全适配（仅保证基本可用）
- 快捷键支持（j/k/回车/f）
- Issue 批量操作
- AI 驱动的智能评审（v1.1.0）

### Grading Criteria（验收标准）

#### 功能完成度

- [ ] REQ-001: Issues 筛选功能
  - 5分: 所有筛选条件正常工作，URL 同步，徽章计数准确
  - 3分: 基本筛选可用，偶现延迟
  - 1分: 筛选崩溃或数据不准确

- [ ] REQ-002: Issues 分组功能
  - 5分: 三种分组方式流畅切换，默认文件分组，折叠展开动画顺滑
  - 3分: 分组可用，偶现卡顿
  - 1分: 分组错乱或崩溃

- [ ] REQ-003: 视觉层次优化
  - 5分: 图标/颜色/边框统一，Severity 区分明显，悬停效果精致
  - 3分: 基本样式正确，细节粗糙
  - 1分: 样式错乱或不可见

- [ ] REQ-004: 代码片段预览
  - 5分: 上下文行数准确，高亮精准，suggestion 对比清晰
  - 3分: 基本显示，偶现错位
  - 1分: 代码不显示或严重错位

#### 质量标准

- [ ] 测试覆盖率 ≥ 85%
- [ ] 无 CRITICAL/HIGH 审查问题
- [ ] TypeScript 严格模式无错误
- [ ] 性能：100 Issues 渲染 < 150ms

### 风险评估

| 风险 | 影响 | 缓解 |
|------|------|------|
| 代码片段预览定位不准 | 高 | 使用 git diff hunk 行号映射，预留 fallback |
| 大量 Issues 渲染卡顿 | 中 | 虚拟滚动保底，100 条内流畅即可 |
| 分组后折叠状态管理复杂 | 低 | 使用 URL query 持久化，刷新不丢失 |

---

## 详细需求

### REQ-001: Issues 筛选功能

#### 用户故事
作为代码评审用户，我希望按 Severity 筛选 Issues，以便快速关注关键问题。

#### 验收细则

**AC1: 筛选选项显示**
- 显示 5 个选项：All / CRITICAL / HIGH / MEDIUM / LOW
- 每个选项右侧显示对应数量徽章（如 CRITICAL (3)）
- 当前选中项高亮显示

**AC2: 筛选交互**
- 点击选项立即筛选（无刷新）
- 筛选后 Issues 列表动画过渡
- 空结果时显示 "No issues match the selected filter"

**AC3: URL 同步**
- 筛选状态同步到 URL query（如 `?severity=CRITICAL`）
- 直接访问带 query 的 URL 自动应用筛选
- 切换筛选时 URL 不刷新更新（history.pushState）

**AC4: 响应式设计**
- 桌面端：水平排列的按钮组
- 移动端（<768px）：下拉选择器

#### 技术提示
- 使用 `useSearchParams` 管理 URL state
- 筛选逻辑在前端完成（数据已在本地）
- 徽章数量实时计算，考虑使用 `useMemo`

---

### REQ-002: Issues 分组功能

#### 用户故事
作为代码评审用户，我希望 Issues 按文件分组，以便了解每个文件的问题分布。

#### 验收细则

**AC1: 分组选项**
- 提供三种分组方式：不分组 / 按文件分组 / 按 Severity 分组
- 使用下拉选择器或标签页切换
- 默认选中"按文件分组"

**AC2: 文件分组展示**
- 每个文件作为一个分组
- 分组头部显示：文件名（可点击复制）、文件图标、该文件 Issue 数量
- 分组可折叠/展开（默认展开）
- 折叠时显示该文件最严重 Issue 的 Severity

**AC3: Severity 分组展示**
- 按 CRITICAL / HIGH / MEDIUM / LOW 分组
- 每个分组显示 Severity 图标和颜色
- 分组内 Issues 按文件排序

**AC4: 不分组展示**
- 所有 Issues 扁平列表
- 显示文件路径作为次要信息

**AC5: 状态持久化**
- 分组选择和折叠状态保存到 localStorage
- 刷新页面后恢复上次状态

#### 技术提示
- 使用递归组件渲染分组树
- 折叠动画使用 `framer-motion` AnimatePresence
- 文件图标根据扩展名映射

---

### REQ-003: 视觉层次优化

#### 用户故事
作为代码评审用户，我希望 Issues 的视觉层次清晰，以便快速识别严重程度和类型。

#### 验收细则

**AC1: Severity 图标系统**

| Severity | 图标 | 颜色 |
|----------|------|------|
| CRITICAL | AlertCircle（实心警告圆） | red-500 |
| HIGH | AlertCircle（空心警告圆） | orange-500 |
| MEDIUM | AlertTriangle（警告三角） | yellow-500 |
| LOW | Info（信息圆） | emerald-500 |

- 图标大小：16x16px
- 图标位于 Issue 卡片左上角

**AC2: 颜色体系**

Issue 卡片左侧边框颜色：
- CRITICAL: border-l-red-500
- HIGH: border-l-orange-500
- MEDIUM: border-l-yellow-500
- LOW: border-l-slate-400

背景色渐变：
- CRITICAL: bg-red-500/5 悬停 bg-red-500/10
- HIGH: bg-orange-500/5 悬停 bg-orange-500/10
- MEDIUM: bg-yellow-500/5 悬停 bg-yellow-500/10
- LOW: bg-slate-500/5 悬停 bg-slate-500/10

**AC3: Severity 徽章**

- 位置：Issue 标题右侧
- 样式：
  - CRITICAL: bg-red-500/20 text-red-400
  - HIGH: bg-orange-500/20 text-orange-400
  - MEDIUM: bg-yellow-500/20 text-yellow-400
  - LOW: bg-emerald-500/20 text-emerald-400
- 圆角：rounded
- 内边距：px-2 py-0.5
- 字号：text-xs

**AC4: 悬停效果**

- Issue 卡片悬停：
  - 背景色加深（如 bg-red-500/5 → bg-red-500/10）
  - 轻微上移（transform: translateY(-1px)）
  - 阴影增强（shadow-lg）
- 过渡动画：duration-200 ease-out

**AC5: 信息层级**

Issue 卡片内容层级：

```
┌─────────────────────────────────────────┐
│ [图标] 问题标题（Severity 徽章）           │  ← 第一层：核心信息
│ 文件路径:行号（monospace）                │  ← 第二层：定位信息
│                                         │
│ 问题描述文字...                          │  ← 第三层：详细描述
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Suggestion: 建议修复代码              │ │  ← 第四层：建议（可折叠）
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**AC6: 文件路径展示**

- 字体：font-mono text-xs
- 颜色：text-slate-500
- 格式：`filename.ext:line`（如 `ReviewResult.tsx:260`）
- 点击行为：复制完整路径到剪贴板（带 toast 提示）

#### 技术提示
- 使用 Tailwind 的 color scale 保持一致性
- 图标使用内联 SVG，不依赖外部图标库
- 悬停效果使用 CSS transition，不使用 JS

---

### REQ-004: 代码片段预览

#### 用户故事
作为代码评审用户，我希望看到问题所在的代码片段，以便快速理解上下文。

#### 验收细则

**AC1: 代码片段展示**

每个 Issue 显示：
- 上下文代码：问题行前 3 行 + 问题行 + 问题行后 2 行（共 6 行）
- 行号显示：绝对行号（与文件实际行号一致）
- 语法高亮：根据文件扩展名使用对应的高亮主题

**AC2: 问题行高亮**

- 问题行背景色：
  - CRITICAL: bg-red-500/30
  - HIGH: bg-orange-500/30
  - MEDIUM: bg-yellow-500/30
  - LOW: bg-slate-500/20
- 左侧标记：对应 Severity 颜色的竖线

**AC3: Suggestion 对比（如果有）**

- 折叠面板：点击展开 suggestion
- 对比视图：左右并排显示
  - 左侧：原始问题代码
  - 右侧：建议修复代码
- 差异高亮：删除红色背景，新增绿色背景

**AC4: 展开更多**

- 上下文不足时显示 "Show more context" 按钮
- 每次展开增加 5 行上下文
- 最大显示 20 行上下文

**AC5: 代码复制**

- 代码块右上角复制按钮
- 点击复制完整代码片段（含行号可选）
- toast 提示 "Copied to clipboard"

#### 技术提示
- 使用 `react-syntax-highlighter` 或 `prismjs` 做语法高亮
- 从 git diff 的 hunk header 解析行号（如 `@@ -260,6 +260,9 @@`）
- 代码块使用 `overflow-x: auto` 支持横向滚动

---

## 非功能需求

### 性能要求

- Issues 列表首屏渲染 < 500ms（100 个 Issues）
- 筛选/分组操作响应 < 100ms
- 代码片段预览加载 < 200ms
- 内存占用：无内存泄漏，长时间使用内存增长 < 30%

### 兼容性要求

- 浏览器：Chrome 90+ / Firefox 88+ / Safari 14+ / Edge 90+
- 移动端：iOS Safari 14+ / Android Chrome 90+
- 响应式断点：桌面端（≥1024px）、平板（768-1023px）、手机（<768px）

### 可访问性要求

- 支持键盘导航（Tab、Enter、方向键）
- ARIA 标签完整
- 颜色对比度符合 WCAG 2.1 AA 标准

---

## 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 代码片段行号定位不准 | 高 | 中 | 预留 1 天 buffer 调优 diff hunk 解析 |
| 大量 Issues 渲染卡顿 | 高 | 中 | 虚拟滚动保底，100 条内流畅即可 |
| 移动端适配复杂度高 | 中 | 中 | 使用响应式组件库，优先保证桌面端 |
| 语法高亮性能差 | 中 | 低 | 懒加载高亮，大文件使用纯文本 fallback |

---

## 变更记录

| 日期 | 版本 | 变更内容 | 作者 |
|------|------|----------|------|
| 2026-04-26 | v0.1 | 初稿创建，包含 4 个 P0 需求 | AI |

---

*本文档待用户确认后锁定，锁定后需求变更需走变更流程*