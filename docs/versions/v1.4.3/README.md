# v1.4.3 — Java 后端评审经验知识导入

> 状态: ✅ 完成
> 日期: 2026-05-11
> 类型: 临时迭代（知识库数据补充）
> 前置: v1.4.2
> 后置: v1.5.0

---

## 目标

导入后端 Java 团队积累的评审经验规则（来源：qiqiao-saas 280 FIXME + 2363 git 提交），增强 `java-backend` 技术栈的 knowledge 覆盖。

## 变更

### DB Schema
- `knowledge_entries` 表新增 `bad_code` TEXT、`good_code` TEXT 两列
- 用于存储反例/正例代码，不做 prompt 注入仅 API 提供

### 知识库导入
- 新增 18 AP（P0 5 + P1 8 + P2 5）、5 CONV、7 EXP
- 与现有 20 条合并，总计 ~55 条 java-backend foundation 知识条目

### 导入的规则主题
| 级别 | 数量 | 核心内容 |
|------|------|----------|
| P0 | 5 | ThreadLocal 泄漏、MQ 消费者、线程池复用、@Async、GET 写操作 |
| P1 | 8 | Map→DTO、MQ 分批、异常体系、消息通知、N+1 缓存、CMD 返回值、applicationId |
| P2 | 5 | 代码重复、权限统一、feignclient 类型、表单引擎一致性 |
| CONV | 5 | RESTful、命名规范、魔法值、注释/Swagger、兼容代码标注、集合操作、评审流程、配置管理、异常规范 |
| EXP | 7 | 表单数据一致性、权限屏蔽、PDF 预览、事件机制、顺序签二期、大文件导出、假删除 |

## 关联 Contract
- [2026-05-11-v143-java-knowledge-import](../../contracts/2026-05-11-v143-java-knowledge-import.md)
