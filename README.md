# CodeReview 项目

## 最终结构和三层机制

```
codeReview/
├── CLAUDE.md                        ← 第1层：每次对话自动加载（软约束）
├── .claude/
│   └── settings.local.json          ← 第2层：物理拦截高风险操作（硬护栏）
├── HARNESS_RULES.md                 ← 详细规则参考文档
└── docs/                            ← 第3层：知识沉淀目录
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

## 参考资料

- [Harness design for long-running application development - Anthropic](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [从玩具到生产力：用真实项目讲透 AI Agent 的 Harness Engineering](https://mp.weixin.qq.com/s/xLdQ9Z3n3SNwaQtmrM28FA)

## 待参考
- [工程技术：在智能体优先的世界中利用 Codex (OpenAI Engineering)](https://openai.com/zh-Hans-CN/index/harness-engineering/) 
- [Harness design for long-running application development (Anthropic Labs)](https://www.anthropic.com/engineering/harnesss)
- [bybytedance/deer-flow: An open-source long-horizon SuperAgent harness (GitHub)：](https://github.com/bytedance/deer-flow)
