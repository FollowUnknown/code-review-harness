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
