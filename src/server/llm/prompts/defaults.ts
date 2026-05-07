import { REVIEW_DIMENSIONS } from "../../../shared/constants";
import { RiskLevel } from "../../../shared/types";

// Risk level descriptions for prompt context
export const LEVEL_DESCRIPTIONS: Record<RiskLevel, string> = {
  S: "高风险（S级）",
  A: "中高风险（A级）",
  B: "中低风险（B级）",
  C: "低风险（C级）",
};

// ---- Scoring Criteria per Dimension ----

const DIMENSION_CRITERIA: Record<string, string> = {
  "Contract 完成度": `5分：需求契约完整实现，边界情况和异常路径全覆盖
4分：核心功能实现，少数边界情况遗漏
3分：主要功能实现，但缺少错误恢复或边界处理
2分：核心功能部分缺失，有明显未实现的场景
1分：需求理解偏差或核心功能未实现
判定：对照 diff 检查是否有遗漏的功能点或未处理的异常路径`,

  "测试覆盖率": `5分：变更代码有完整的单元测试和集成测试覆盖
4分：主要逻辑有测试，部分边缘场景未覆盖
3分：有少量测试但覆盖率不足
2分：几乎没有测试代码
1分：完全没有任何测试
判定：检查 diff 中是否包含 .test. / .spec. / describe / it / test 等测试相关内容`,

  "TDD 合规": `5分：体现 RED→GREEN→IMPROVE 的迭代过程，测试先于实现
4分：测试和实现同步提交，测试设计合理
3分：实现先于测试，但测试质量尚可
2分：仅有实现代码，测试为空或敷衍
1分：无测试代码，完全不体现 TDD
判定：检查提交中是否有测试用例，以及测试是否覆盖了核心逻辑`,

  "函数长度": `5分：所有函数 ≤30 行，职责单一
4分：函数基本在 30-50 行，个别稍长
3分：存在 50-80 行的函数，需要拆分
2分：存在 80-120 行的函数
1分：存在 >120 行的超长函数
判定：超过 50 行的函数标记为 MEDIUM 问题，超过 80 行标记为 HIGH 问题`,

  "文件长度": `5分：文件 ≤200 行，结构清晰
4分：文件 200-400 行，组织合理
3分：文件 400-600 行，建议拆分
2分：文件 600-800 行，明显过长
1分：文件 >800 行，严重超长
判定：超过 400 行建议拆分，超过 800 行标记为 HIGH 问题`,

  "嵌套深度": `5分：最大嵌套 ≤2 层，使用 early return
4分：最大嵌套 3 层，结构清晰
3分：存在 4 层嵌套，建议重构
2分：存在 5 层嵌套
1分：嵌套 >5 层，严重影响可读性
判定：超过 4 层嵌套标记为 MEDIUM 问题，超过 5 层标记为 HIGH 问题，建议使用 early return 或提取函数`,

  "输入验证": `5分：所有外部输入（API 响应、用户输入、URL 参数、文件内容）都有校验，含边界和类型检查
4分：主要入口有验证，个别路径缺失
3分：部分验证但不够全面（如只验证了空值，未验证类型）
2分：大部分外部输入未校验
1分：用户输入直接使用无任何校验
判定重点：API 响应数据（res.data.data 是否可能 null）、表单输入、URL 参数、文件内容。未验证 null/undefined 直接调用方法标记为 HIGH 问题`,

  "密钥管理": `5分：无硬编码密钥，全部走环境变量或密钥管理器
4分：大部分走环境变量，有合理的安全配置
3分：存在少量不规范的配置方式
2分：存在明文存储的敏感信息
1分：存在硬编码 API key / token / password
判定：发现硬编码密钥直接标记为 CRITICAL 问题，评审不通过。检查 API key、token、password、secret 等关键词`,

  // ---- Qiqiao (Vue 2) Dimensions ----

  "安全": `5分：无硬编码密钥/Token；用户内容使用 v-xss 而非 v-html；无 XSS/注入风险；敏感数据不在日志暴露
4分：主要安全入口有防护，个别遗漏
3分：部分安全措施但不够全面
2分：多处安全措施缺失
1分：存在硬编码密钥或 XSS 漏洞
判定重点：v-html 必须用 v-xss 替代；检查 API key、token、password；addEventListener/定时器/EventBus 未清理标记为 CRITICAL`,

  "Vue 2 组件质量": `5分：无内存泄漏（EventListener/Timer/库实例在 beforeDestroy 清理）；数组用 $set 或 splice；v-for 有唯一 key；computed 有 return；v-if/v-for 不在同一元素
4分：主要生命周期有清理，个别遗漏
3分：部分清理但不够全面，或存在 Vue 2 响应式陷阱
2分：大量 beforeDestroy 缺失，响应式问题明显
1分：严重内存泄漏或响应式失效
判定重点：EventBus.$off 配对；this.$set 替代直接索引赋值；v-for :key 非 index；async created/mounted 有 loading+error`,

  "Vuex 状态管理": `5分：mutation 是纯函数，无副作用，不操作 localStorage，不调 dispatch/commit，无异步；不直接修改 $store.state
4分：大部分 mutation 规范，个别边界情况
3分：存在少量不规范 mutation
2分：多处违反 mutation 纯函数原则
1分：mutation 中有大量副作用或异步操作
判定重点：mutation 中出现 localStorage/sessionStorage 标记为 HIGH；mutation 中含异步操作标记为 HIGH`,

  "API 层与网络请求": `5分：请求有合理 timeout（建议 30000ms）；长时请求使用 cancel token；错误有处理（非空 catch）；并行请求使用 Promise.all；有 loading 状态管理
4分：主要请求配置合理，个别遗漏
3分：部分请求缺少 timeout 或错误处理
2分：大量请求缺少基本配置
1分：请求永不超时，无错误处理，无 loading
判定重点：timeout: null 标记为 HIGH；空 catch 块标记为 CRITICAL`,

  "MPA 模块独立性": `5分：无跨模块直接引用；不修改共享资源（components/utils/directives）；import 路径使用正确别名
4分：引用规范，个别边界情况可接受
3分：存在少量跨模块引用但有合理理由
2分：多处跨模块引用或修改共享资源
1分：严重违反模块独立性，大量跨模块耦合
判定重点：require('@/views/admin/xxx') 跨模块引用标记为 HIGH；修改 src/components/ 共享组件需特别审查`,

  "UI 框架使用 (Element UI)": `5分：el-form validate 在 $nextTick 调用；el-dialog 大内容用 destroy-on-close；el-select 远程搜索有 debounce（300ms）；样式通过自定义类名+scoped ::v-deep 限定
4分：主要组件用法规范，个别改进点
3分：部分组件用法不够规范
2分：多处组件误用或性能问题
1分：严重组件使用错误或全局样式污染
判定重点：直接覆盖 .el-xxx 全局样式（无 scoped）标记为 HIGH；el-select 远程搜索无 debounce 标记为 HIGH`,

  "i18n 国际化": `5分：新增文案使用 $t() 而非硬编码中文
4分：大部分文案走 i18n，个别遗漏
3分：部分文案国际化，部分硬编码
2分：大量硬编码中文
1分：完全无国际化
注意：当前阶段私有化部署，不强制 i18n。新增中文硬编码降级为 LOW 或不报告`,

  "代码风格": `5分：无 console.log 残留；无未使用 import；文件命名一致；符合 .eslintrc.js（无分号、单引号、2 空格）
4分：代码风格基本规范
3分：存在少量风格问题
2分：多处风格不一致
1分：严重风格问题，大量调试代码
判定重点：新增代码中 console.log 标记为 MEDIUM；未使用 import 标记为 LOW`,

  "业务逻辑一致性": `5分：代码覆盖需求所有功能点；边界条件处理完善；错误提示符合产品规范；权限校验正确
4分：主要功能点实现，少数边界遗漏
3分：核心功能实现但缺少部分边界处理
2分：功能点有缺失或业务规则不符合
1分：需求理解偏差或核心功能未实现
判定重点：敏感操作缺权限校验标记为 HIGH；数据流转不符合业务逻辑标记为 HIGH`,

  // ---- Qixi (Vue 3) Dimensions ----

  "Vue 3 组件质量": `5分：无内存泄漏（addEventListener 在 onUnmounted 清理；setInterval/setTimeout 清理；ECharts/X6 实例 destroy）；watchEffect 返回 stop handle；computed 有 return 无副作用；template ref 匹配
4分：主要生命周期清理到位，个别遗漏
3分：部分清理缺失或 Composition API 使用不规范
2分：多处 onUnmounted 缺失，存在副作用
1分：严重内存泄漏或 Composition API 误用
判定重点：Bus.on() 无 Bus.off() 标记为 CRITICAL；watchEffect 未捕获 stop handle 标记为 HIGH；computed 含副作用标记为 HIGH`,

  "TypeScript 类型安全": `5分：ref 使用泛型 ref<UserType>()；defineProps<T>() 使用 TS 接口；无 as any；无 @ts-ignore；API 响应有 typed interface；导出函数有返回类型
4分：大部分类型安全，个别 any 可接受
3分：部分类型定义缺失，存在隐式 any
2分：大量 any 使用，类型定义不完整
1分：完全无类型安全，全 any
判定重点：ref<any>() 在关键业务数据中标记为 HIGH；defineProps 使用运行时声明标记为 MEDIUM`,

  "Pinia 状态管理": `5分：无 store 外部直接 state mutation（用 action）；action 中无 localStorage；state 中无异步；大型静态数据用 Object.freeze；避免过度 cloneDeep；解构用 storeToRefs
4分：主要 store 规范，个别改进点
3分：部分 store 不规范
2分：多处违反 Pinia 最佳实践
1分：严重 Pinia 误用
判定重点：直接解构 store 丢失响应性标记为 HIGH；Pinia action 中过度 cloneDeep 标记为 MEDIUM`,

  "UI 框架使用 (Arco Design)": `5分：组件自动导入不手动 import；a-form 验证模式正确；a-modal/a-drawer 大内容用 unmount-on-close；a-select 远程搜索有 debounce；图标用 Iconify 格式
4分：主要组件用法规范
3分：部分组件用法可改进
2分：多处组件误用
1分：严重组件使用错误
判定重点：手动 import Arco 组件标记为 LOW（提醒自动导入）；a-select 远程搜索无 debounce 标记为 HIGH`,

  "构建与架构": `5分：SPA 架构，auto-import 遵守 auto-imports.d.ts 契约；路径别名 @→src/ @public→public/；Less 预处理；Vite 用 import.meta.glob
4分：构建配置合理，符合项目规范
3分：部分构建规范未遵守
2分：构建配置有问题
1分：严重构建问题
判定重点：使用 require.context 标记为 MEDIUM（应改用 import.meta.glob）`,

  // ---- Java Backend Dimensions ----

  "数据结构选择": `5分：集合类型精确匹配业务语义（List vs Set vs Map）；泛型参数完整；避免过早优化使用并发集合；DTO/VO/Entity 分层清晰
4分：主要集合选择合理，个别可优化
3分：使用 ArrayList 替代所有场景，缺少 Map/Set 的合理使用
2分：大量原始类型（raw type）或 Object 滥用；DTO 与 Entity 混用
1分：数据结构严重不合理，导致性能或正确性问题
判定重点：用 Map 存储应使用对象/DTO 的数据标记为 HIGH；ArrayList 存储需去重的数据标记为 MEDIUM；raw type 使用标记为 MEDIUM`,

  "算法复杂度": `5分：时间复杂度最优；避免 O(n²) 嵌套循环；数据库查询有索引支撑；分页查询合理
4分：主要逻辑复杂度合理，个别可优化点
3分：存在可优化的 O(n²) 循环或 N+1 查询
2分：大量嵌套循环或不必要的全表扫描
1分：算法复杂度严重影响性能（如大数据量下的 O(n³)）
判定重点：循环内数据库查询标记为 HIGH；未分页的全量查询标记为 HIGH；可优化为 O(n log n) 的 O(n²) 排序标记为 MEDIUM`,

  "异常处理": `5分：异常分类精确（业务异常 vs 系统异常）；catch 块不吞异常；finally 释放资源；自定义异常携带上下文；全局异常处理器覆盖完整
4分：主要异常路径处理正确，个别边界遗漏
3分：部分异常被空 catch 吞掉或仅 printStackTrace
2分：大量异常处理缺失或不规范
1分：异常完全未处理，或 catch(Exception e) 吞掉所有异常
判定重点：空 catch 块标记为 CRITICAL；catch(Exception e) 过宽标记为 HIGH；仅 e.printStackTrace() 无日志框架标记为 MEDIUM；资源未在 finally/try-with-resources 释放标记为 HIGH`,

  "并发安全": `5分：共享状态使用正确的同步机制；线程池配置合理；无死锁风险；无竞态条件；@Transactional 边界正确
4分：主要并发场景处理正确
3分：部分共享变量缺少同步保护
2分：多处线程安全问题
1分：严重的并发 bug（如 double-checked locking 错误、共享可变状态无保护）
判定重点：SimpleDateFormat 在多线程使用标记为 HIGH；@Transactional 在私有方法标记为 HIGH；synchronized 过粗粒度标记为 MEDIUM；线程池未关闭标记为 HIGH`,

  "日志与可观测性": `5分：关键业务操作有 info 日志；异常有完整堆栈和上下文参数；日志级别使用正确（debug/info/warn/error）；敏感信息脱敏；有 traceId/spanId 支持链路追踪
4分：主要操作有日志，个别关键路径缺失
3分：有日志但上下文不足（如仅打印异常消息，无入参）
2分：大量 System.out.println 或无日志
1分：完全无日志或日志暴露敏感数据
判定重点：System.out.println 替代日志框架标记为 MEDIUM；日志中打印密码/token 标记为 CRITICAL；catch 块中无日志记录标记为 HIGH；关键业务操作（支付/状态变更）无日志标记为 HIGH`,

  "代码可维护性": `5分：类职责单一（<500 行）；方法 <30 行；命名语义化（避免 data/info/temp）；魔法值提取为常量；注释解释 why 而非 what
4分：代码结构清晰，个别命名或长度可优化
3分：存在过长方法或类，命名不清晰
2分：大量重复代码、过深嵌套、魔法数字
1分：代码严重不可维护，无注释、命名混乱、超长方法
判定重点：方法超过 50 行标记为 MEDIUM；类超过 800 行标记为 HIGH；魔法数字/字符串未提取常量标记为 MEDIUM；过长参数列表（>5）标记为 MEDIUM`,

  "根因分析": `5分：修复直接解决根因（从源头消除问题）；修复方案优雅且不影响其他逻辑；有充分注释说明根因和修复策略
4分：修复解决根因，但方案可微调优化
3分：修复为症状处理（在消费端/workaround 层面兜底），但有注释说明根因位置和未来优化方向；短期内可接受
2分：修复为症状处理，未说明根因；可能存在更好的源头修复方案
1分：修复方向错误，未触及问题本质；或引入新的隐藏问题
判定重点：修复在消费端加判断/过滤/跳过，但数据源仍可能产生重复/错误数据 → 标记为 MEDIUM issue（"治标不治本"）；修复通过添加 null 检查绕过 NPE，但未修正返回 null 的上游方法 → 标记为 MEDIUM；修复在循环中 break/continue 跳过异常数据，但未说明数据为何异常 → 建议标注根因`,

  "测试覆盖": `5分：核心业务逻辑有单元测试；Service 层有集成测试；边界条件和异常路径有覆盖；测试独立无外部依赖
4分：主要逻辑有测试，部分边界遗漏
3分：有少量测试但覆盖率不足
2分：几乎没有测试
1分：完全无测试
判定重点：核心 Service 无单元测试标记为 HIGH；复杂条件分支未覆盖标记为 MEDIUM；测试依赖外部服务（未 mock）标记为 MEDIUM`,
};

/** Java backend dimensions — used when tech-stack is java-backend */
export const JAVA_BACKEND_DIMENSIONS = [
  "数据结构选择",
  "算法复杂度",
  "异常处理",
  "并发安全",
  "日志与可观测性",
  "代码可维护性",
  "根因分析",
  "测试覆盖",
  "密钥管理",
] as const;

// ---- Risk-Level Specific Checklists ----

export const RISK_CHECKLISTS: Record<RiskLevel, string> = {
  S: `这是高风险（S级）变更，除通用评审外，必须额外检查：
1. 【安全】是否存在权限绕过、数据泄露、注入攻击风险
2. 【业务逻辑】核心流程的正确性，特别是支付/认证/用户数据相关
3. 【边界情况】null/undefined/空数组/并发场景是否全部处理
4. 【向后兼容】变更是否影响现有 API 契约或数据格式
5. 【错误恢复】失败时状态是否正确回滚或重置，loading 状态是否恢复
6. 【配置变更】默认值、枚举、环境变量的变更是否有副作用`,

  A: `这是中高风险（A级）变更，额外关注：
1. 【API 契约】接口参数和返回值是否与调用方一致
2. 【错误处理】请求失败时的 catch/finally 是否正确处理状态
3. 【数据安全】API 响应数据是否做了 null 安全处理（如 res.data.data || []）
4. 【类型安全】接口参数类型定义是否准确
5. 【重复提交】异步操作是否有防重复提交保护`,

  B: "",  // B 级无额外提示，按通用标准评审

  C: "",  // C 级无额外提示
};

// Default review system prompt is now built dynamically in buildDefaultReviewPrompt()
// to support project-specific dimensions.

export interface ReviewPromptContext {
  dimensions: readonly string[];
  batchIndex: number;
  totalBatches: number;
  riskLevel: RiskLevel;
  requirement?: string;
  knowledge?: string;
}

/**
 * Build scoring criteria text for the given dimensions.
 * Used by both the default prompt builder and DB template rendering.
 */
export function getDimensionCriteria(dimensions: readonly string[]): string {
  return dimensions
    .map((d) => {
      const criteria = DIMENSION_CRITERIA[d];
      return criteria ? `### ${d}\n${criteria}` : `### ${d}\n（通用评分标准：5=优秀 4=良好 3=一般 2=较差 1=严重不足）`;
    })
    .join("\n\n");
}

export function buildDefaultReviewPrompt(ctx: ReviewPromptContext): string {
  // Use the actual dimensions from context (may be project-specific)
  const dims = ctx.dimensions.length > 0 ? ctx.dimensions : REVIEW_DIMENSIONS;
  const dimList = dims.map((d, i) => `${i + 1}. ${d}`).join("\n");
  const criteriaText = getDimensionCriteria(dims);

  const basePrompt = `你是一个专业的代码评审专家。你需要对提供的代码变更进行评审，并按照指定维度打分。

**文件类型特殊规则：**
- SVG 文件：仅检查文件大小/变更行数，不做代码逻辑评审。若 SVG diff 行数超过 500 行，标记为 MEDIUM 级别问题，建议压缩或拆分
- 纯文档文件（.md）：跳过代码逻辑评审
- 配置文件（.gitignore, tsconfig 等）：跳过代码逻辑评审

## 评分维度（每项 1-5 分）

${dimList}

## 评分标准

${criteriaText}

## Issue 严重级别判定

| 级别 | 触发条件 |
|------|---------|
| CRITICAL | 硬编码密钥、安全漏洞、数据丢失风险 |
| HIGH | Bug、核心逻辑错误、重要错误处理缺失、状态泄漏 |
| MEDIUM | 可维护性问题、代码重复、缺失的边界处理 |
| LOW | 命名建议、风格优化、小改进 |

请严格按照以下 JSON 格式输出评审结果，不要输出其他内容：
{
  "scores": [
    {"dimension": "维度名", "score": 1-5, "comment": "具体说明"}
  ],
  "issues": [
    {"severity": "CRITICAL/HIGH/MEDIUM/LOW", "message": "问题描述", "file": "文件名", "line": 行号, "suggestion": "修复建议"}
  ],
  "summary": "1-2段总结"
}`;

  const levelDesc = LEVEL_DESCRIPTIONS[ctx.riskLevel];
  let prompt = `${basePrompt}\n\n当前评审批次：第 ${ctx.batchIndex + 1}/${ctx.totalBatches} 批，风险等级：${levelDesc}。`;

  const checklist = RISK_CHECKLISTS[ctx.riskLevel];
  if (checklist) {
    prompt += `\n\n${checklist}`;
  }

  if (ctx.requirement) prompt += ctx.requirement;
  if (ctx.knowledge) prompt += ctx.knowledge;

  return prompt;
}

// Default user message template
export const DEFAULT_REVIEW_USER_PROMPT = `请评审以下代码变更：\n\n`;
