# CodeReview 项目

## 最终结构和三层机制

```
codeReview/
├── CLAUDE.md                        ← 第1层：每次对话自动加载（软约束）
├── .claude/
│   └── settings.local.json          ← 第2层：物理拦截高风险操作（硬护栏）
└── docs/                            ← 第3层：知识沉淀目录
    ├── superpowers/
    │   ├── specs/                   ← harness 设计与路线图
    │   └── plans/                   ← harness 分阶段实施计划
    ├── architecture/
    │   ├── index.md
    │   └── implicit-contracts.md    ← 隐性约定，边做边补
    ├── product/
    │   └── index.md
    └── standards/
        ├── testing.md
        └── database.md
```

## 三层如何生效

| 层 | 文件 | 生效方式 | 保护什么 |
|---|---|---|---|
| 软约束 | `CLAUDE.md` | Claude Code 每次开对话**自动读取** | 行为规范、红线提醒、自检清单 |
| 硬护栏 | `settings.local.json` | **系统级拦截**，AI 无法绕过 | 禁止改密钥/生产配置，禁止 push/rm -rf |
| 知识沉淀 | `docs/` | AI 按 `CLAUDE.md` 指引去读 | 隐性约定、架构、规范 |

---

## Harness 当前阶段

当前 `harness` 已推进到 **Phase 2: Orchestration Superpower**。

这一阶段的目标，不再只是让 AI "按四阶段做事"，而是把项目协作方式升级为一套可分流、可追踪、可沉淀的编排协议。

当前已生效的关键能力：

- `CLAUDE.md` 已从单轨 `Planning -> Development -> Review -> Commit` 升级为 `Business Task / Platform Task` 双轨编排
- 已增加 Contract 状态机：`draft -> confirmed -> in_progress -> review_pending -> completed`
- 已为 Platform Task 增加 `Architecture` 与 `Knowledge Sync` 两个关键阶段
- `harness-framework-design` 已同步双轨流程、扩展状态机和 Platform Task 适用范围
- `roadmap spec/plan` 已标记当前 Phase 状态，并明确 `Phase 2` 已完成

这些改动的作用：

- **任务分流**：功能需求和平台需求不再走同一条流程，避免平台任务跳过架构设计，也避免小需求被过度流程化
- **状态追踪**：Contract 不再只是说明文档，而是阶段流转协议，能清楚表达任务现在卡在哪一步
- **平台前置设计**：`Architecture` 阶段确保知识平台、运行时升级、会话机制等任务先明确对象、边界和状态流，再进入实现
- **知识回写**：`Knowledge Sync` 阶段确保平台任务的通用结论回写到 `docs/`，而不是停留在聊天记录或代码细节里
- **路线对齐**：README、`CLAUDE.md`、spec、plan 现在对当前 harness 状态有统一口径，后续可以直接从 `Phase 3` 往下推进

相关文档：

- [CLAUDE.md](./CLAUDE.md)
- [v1.1.0 设计](./docs/archive/superpowers/specs/2026-04-22-harness-framework-design.md)
- [Superpower 路线图](./docs/archive/superpowers/specs/2026-04-23-harness-superpower-roadmap.md)

---

## Harness 历史阶段

### Phase 0: Baseline Rules

这个阶段的重点是先让项目具备最小可控性：

- 建立 `CLAUDE.md` 红线和自检
- 建立 `.claude/settings.local.json` 硬护栏
- 建立 `docs/` 作为知识沉淀目录
- 建立基础会话机制和 `active-tasks.md`

这个阶段解决的是"先别把项目做坏"。

### Phase 1: Session Superpower

这个阶段开始把 AI 对话从一次性问答升级成可跨天延续的工作流：

- 通过 `sessions/YYYY-MM-DD.md` 记录当天过程
- 通过 `sessions/active-tasks.md` 管理跨天任务
- 通过 stop hook 和会话总结减少上下文丢失

这个阶段解决的是"任务不要丢，过程要能续上"。

### Phase 2: Orchestration Superpower

这是当前阶段，重点是把会话式协作升级成任务编排协议：

- 任务先分流，再进入不同阶段
- Contract 成为阶段间唯一协议
- 平台任务必须先架构确认，再开发，再知识回写

这个阶段解决的是"不同类型的任务，要用不同的流程治理"。

---

## 下一阶段

下一步计划推进 **Phase 3: Execution Superpower**，重点补齐：

- 阶段执行证据
- `review fail -> repair loop` 修复回环
- `Artifact / VerificationResult` 等执行对象模型

目标是让 harness 不只会"规定流程"，还能留下完整执行证据链。

---

## 参考资料

- [Harness design for long-running application development - Anthropic](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [从玩具到生产力：用真实项目讲透 AI Agent 的 Harness Engineering](https://mp.weixin.qq.com/s/xLdQ9Z3n3SNwaQtmrM28FA)

## 待参考
- [工程技术：在智能体优先的世界中利用 Codex (OpenAI Engineering)](https://openai.com/zh-Hans-CN/index/harness-engineering/) 
- [Harness design for long-running application development (Anthropic Labs)](https://www.anthropic.com/engineering/harnesss)
- [bybytedance/deer-flow: An open-source long-horizon SuperAgent harness (GitHub)：](https://github.com/bytedance/deer-flow)
