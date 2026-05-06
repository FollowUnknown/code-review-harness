/**
 * Seed script: Import Java backend review knowledge into codeReview DB.
 *
 * Usage:
 *   npx tsx scripts/seed-java-knowledge.ts
 *
 * Creates knowledge entries with project = "java-backend" so they are
 * injected when tech-stack inference detects a Java project.
 *
 * Idempotent: uses fingerprint dedup, safe to re-run.
 */

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.KNOWLEDGE_DB_PATH || path.resolve(__dirname, "../knowledge.db");

// Safety check
if (DB_PATH === path.resolve(__dirname, "../knowledge.db") && process.env.NODE_ENV === "production" && !process.env.ALLOW_SEED_PROD) {
  console.error("✗ Refusing to seed into production DB. Set ALLOW_SEED_PROD=1 to override.");
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ---- Inline Knowledge Data ----

const ANTI_PATTERNS = [
  {
    id: "JB-AP-001",
    title: "空 catch 块吞异常",
    severity: "CRITICAL" as const,
    pattern: "catch (Exception e) { }",
    impact: "异常被静默吞掉，无法排查问题",
    fix_suggestion: "至少记录日志：log.error(\"操作失败\", e); 或重新抛出",
    content: "模式: catch (Exception e) { /* 空 */ }\n影响: 异常被静默吞掉，无法排查问题\n修复: 至少记录日志 log.error(\"操作失败\", e); 或重新抛出业务异常",
    confidence: 0.95,
  },
  {
    id: "JB-AP-002",
    title: "catch 后丢 cause",
    severity: "HIGH" as const,
    pattern: "catch (IOException e) { throw new BusinessException(\"操作失败\"); }",
    impact: "丢失原始异常堆栈，无法定位根因",
    fix_suggestion: "传递 cause：throw new BusinessException(\"操作失败\", e);",
    content: "模式: catch 后 new 异常不传 cause\n影响: 丢失原始异常堆栈，无法定位根因\n修复: throw new BusinessException(\"操作失败\", e);",
    confidence: 0.9,
  },
  {
    id: "JB-AP-003",
    title: "资源未关闭（未使用 try-with-resources）",
    severity: "HIGH" as const,
    pattern: "InputStream is = new FileInputStream(...); // 没有 finally 关闭",
    impact: "文件句柄/连接泄漏，最终导致 OOM 或 Too many open files",
    fix_suggestion: "使用 try-with-resources: try (InputStream is = new FileInputStream(...)) { ... }",
    content: "模式: InputStream/Connection/Statement 未在 finally 或 try-with-resources 中关闭\n影响: 资源泄漏，导致 OOM 或 Too many open files\n修复: 使用 try-with-resources 自动关闭",
    confidence: 0.9,
  },
  {
    id: "JB-AP-004",
    title: "SimpleDateFormat 多线程使用",
    severity: "HIGH" as const,
    pattern: "private static final SimpleDateFormat sdf = new SimpleDateFormat(\"yyyy-MM-dd\");",
    impact: "SimpleDateFormat 非线程安全，多线程环境下产生错误日期或 ArrayIndexOutOfBoundsException",
    fix_suggestion: "使用 DateTimeFormatter（线程安全）或 ThreadLocal<SimpleDateFormat>",
    content: "模式: static SimpleDateFormat 共享实例\n影响: 非线程安全，多线程产生错误日期\n修复: 使用 DateTimeFormatter 或 ThreadLocal<SimpleDateFormat>",
    confidence: 0.9,
  },
  {
    id: "JB-AP-005",
    title: "NPE 风险：未判空直接调用方法",
    severity: "HIGH" as const,
    pattern: "user.getName().length()  // user 或 getName() 可能返回 null",
    impact: "NullPointerException，线上 500 错误",
    fix_suggestion: "使用 Optional.ofNullable() 或提前判空，避免链式调用中的 null",
    content: "模式: 链式调用未判空 user.getName().length()\n影响: NullPointerException 线上错误\n修复: Optional.ofNullable(user).map(User::getName).orElse(\"\") 或提前判空",
    confidence: 0.9,
  },
  {
    id: "JB-AP-006",
    title: "System.out.println 替代日志框架",
    severity: "MEDIUM" as const,
    pattern: "System.out.println(\"result=\" + result);",
    impact: "无法控制日志级别、无法关闭、无格式化、性能差",
    fix_suggestion: "使用 log.info/debug/warn/error 替代",
    content: "模式: System.out.println 调试输出\n影响: 无法控制级别和格式，性能差\n修复: 使用 log.info/debug/warn/error",
    confidence: 0.85,
  },
  {
    id: "JB-AP-007",
    title: "日志中打印敏感信息",
    severity: "CRITICAL" as const,
    pattern: "log.info(\"user login: password={}\", password);",
    impact: "密码、token、身份证号等敏感信息泄露到日志文件",
    fix_suggestion: "脱敏处理：log.info(\"user login: phone={}\", mask(phone)); 或不打印",
    content: "模式: 日志打印密码/token/身份证\n影响: 敏感信息泄露到日志文件\n修复: 脱敏处理或不打印敏感字段",
    confidence: 0.95,
  },
  {
    id: "JB-AP-008",
    title: "@Transactional 在私有方法上无效",
    severity: "HIGH" as const,
    pattern: "@Transactional private void updateOrder() { ... }",
    impact: "Spring AOP 代理无法拦截私有方法，事务不生效，数据不一致",
    fix_suggestion: "@Transactional 只能用于 public 方法",
    content: "模式: @Transactional 标注在 private 方法\n影响: Spring 代理无法拦截，事务不生效\n修复: 改为 public 方法，或提取到单独的 Service",
    confidence: 0.9,
  },
  {
    id: "JB-AP-009",
    title: "魔法数字/字符串未提取常量",
    severity: "MEDIUM" as const,
    pattern: "if (status == 3) { ... }  // 3 代表什么？",
    impact: "代码可读性差，修改时容易遗漏",
    fix_suggestion: "提取为常量或枚举：if (status == OrderStatus.COMPLETED.getCode())",
    content: "模式: 代码中直接使用数字/字符串字面量\n影响: 可读性差，维护困难\n修复: 提取为常量或枚举",
    confidence: 0.8,
  },
  {
    id: "JB-AP-010",
    title: "循环内执行数据库查询（N+1 问题）",
    severity: "HIGH" as const,
    pattern: "for (Order o : orders) { User u = userMapper.selectById(o.getUserId()); }",
    impact: "N+1 查询导致数据库压力大、响应慢",
    fix_suggestion: "批量查询：List<User> users = userMapper.selectByIds(userIds); 然后 Map 缓存",
    content: "模式: 循环内单条查询 for (order : orders) { mapper.selectById(...) }\n影响: N+1 查询，数据库压力大\n修复: 批量查询 + Map 缓存",
    confidence: 0.9,
  },
];

const CONVENTIONS = [
  {
    id: "JB-CONV-001",
    title: "异常分类：业务异常 vs 系统异常",
    content: "• 业务异常（用户输入错误、业务规则不满足）：抛出 BusinessException，前端展示错误消息\n• 系统异常（网络超时、DB 错误）：抛出 SystemException，记录完整堆栈，返回通用错误页\n• 全局异常处理器 @RestControllerAdvice 统一捕获，区分处理\n• 异常消息要包含上下文：\"订单 #12345 状态不允许取消（当前: PAID）\" 而非 \"操作失败\"",
    confidence: 0.85,
  },
  {
    id: "JB-CONV-002",
    title: "Controller/Service/Mapper 分层规范",
    content: "• Controller：参数校验（@Valid）、调用 Service、返回 VO\n• Service：业务逻辑、事务控制、不依赖 HTTP 对象\n• Mapper/DAO：纯数据访问，不包含业务逻辑\n• Entity 与 DTO/VO 分离：Entity 映射数据库，DTO 接收参数，VO 返回结果\n• 禁止在 Controller 中直接注入 Mapper",
    confidence: 0.85,
  },
  {
    id: "JB-CONV-003",
    title: "REST API 设计规范",
    content: "• URL 用名词复数：/api/v1/orders 而非 /api/v1/getOrders\n• HTTP 方法表示操作：GET 查询、POST 创建、PUT 更新、DELETE 删除\n• 响应统一信封：{ code, message, data }\n• 分页参数：page/size 或 offset/limit，响应包含 total\n• 错误响应包含具体字段和原因，避免笼统的 \"参数错误\"",
    confidence: 0.8,
  },
  {
    id: "JB-CONV-004",
    title: "日志规范",
    content: "• 关键业务操作记录 info 日志：创建订单、状态变更、支付回调\n• 异常必须记录 error 日志，含完整堆栈和入参\n• debug 级别用于开发调试，上线前确认不输出敏感信息\n• 使用参数化日志：log.info(\"order {} created, amount={}\", orderId, amount)\n• 禁止字符串拼接：log.info(\"order \" + orderId + \" created\") // 性能差",
    confidence: 0.8,
  },
  {
    id: "JB-CONV-005",
    title: "并发与线程安全规范",
    content: "• SimpleDateFormat → DateTimeFormatter\n• 共享可变状态必须同步或使用并发集合\n• @Async 方法返回 CompletableFuture\n• 线程池配置：核心线程数、最大线程数、队列容量、拒绝策略\n• Spring 单例 Bean 中的成员变量必须是线程安全的（或无状态）",
    confidence: 0.8,
  },
];

const EXPERIENCES = [
  {
    id: "JB-EXP-001",
    title: "根因分析要精确到字段",
    content: "场景: 业务校验失败\n建议: 错误消息应精确说明哪个字段、期望什么值、实际什么值\n反例: \"参数错误\" → 正例: \"订单状态不允许取消（orderId=123, 当前状态=PAID, 期望=CANCELED)\"\n来源: 架构师评审 R-2e98011c",
    confidence: 0.75,
  },
  {
    id: "JB-EXP-002",
    title: "数据结构选择影响可维护性",
    content: "场景: 复杂业务对象传递\n建议: 用 DTO/VO 明确字段含义，不用 Map<String, Object>\n反例: Map<String, Object> params = new HashMap<>(); params.put(\"type\", 1);\n正例: OrderQueryDTO dto = new OrderQueryDTO(); dto.setOrderType(OrderType.NORMAL);\n来源: 架构师评审 R-2e98011c",
    confidence: 0.75,
  },
  {
    id: "JB-EXP-003",
    title: "可观测性：关键操作必须留痕",
    content: "场景: 支付回调、状态变更、权限修改\n建议: 记录操作人、操作时间、变更前后值\n实现: 操作日志表 + AOP 切面自动记录\n来源: 架构师评审 R-2e98011c",
    confidence: 0.75,
  },
  {
    id: "JB-EXP-004",
    title: "接口参数校验使用 Bean Validation",
    content: "场景: Controller 接口参数校验\n建议: 使用 @NotNull @Size @Pattern 等 JSR-303 注解，配合 @Valid\n反例: if (name == null || name.isEmpty()) throw new Exception(\"名字不能为空\");\n正例: @NotBlank(message = \"名字不能为空\") private String name;\n来源: Java 后端评审经验",
    confidence: 0.7,
  },
  {
    id: "JB-EXP-005",
    title: "MyBatis 查询避免 select *",
    content: "场景: 数据库查询\n建议: 明确指定需要的字段，避免 select * 带来的性能和内存浪费\n反例: SELECT * FROM order WHERE id = #{id}\n正例: SELECT id, order_no, status, amount FROM order WHERE id = #{id}\n来源: Java 后端评审经验",
    confidence: 0.7,
  },
];

// ---- Seed Logic ----

function seed() {
  const now = new Date().toISOString();
  let count = 0;

  const insertEntry = db.prepare(`
    INSERT INTO knowledge_entries (id, type, project, module, severity, title, pattern, impact, fix_suggestion, content, status, source_review, source_mr, source_file, fingerprint, confidence, hit_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);

  const findByFingerprint = db.prepare("SELECT id FROM knowledge_entries WHERE fingerprint = ? LIMIT 1");
  const updateEntry = db.prepare(`
    UPDATE knowledge_entries SET content = ?, severity = COALESCE(?, severity), impact = COALESCE(?, impact),
      fix_suggestion = COALESCE(?, fix_suggestion), confidence = ?, updated_at = ? WHERE fingerprint = ?
  `);

  const project = "java-backend";

  function upsert(entry: { id: string; type: string; severity?: string | null; title: string; pattern?: string | null; impact?: string | null; fix_suggestion?: string | null; content: string; confidence: number }) {
    const fingerprint = `${entry.type}|${project}|${entry.title}`;
    const existing = findByFingerprint.get(fingerprint) as { id: string } | undefined;

    if (existing) {
      updateEntry.run(entry.content, entry.severity || null, entry.impact || null, entry.fix_suggestion || null, entry.confidence, now, fingerprint);
    } else {
      insertEntry.run(
        entry.id, entry.type, project, null, entry.severity || null,
        entry.title, entry.pattern || null, entry.impact || null, entry.fix_suggestion || null,
        entry.content, "CONFIRMED", null, null, null, fingerprint, entry.confidence, now, now,
      );
    }
    count++;
  }

  for (const ap of ANTI_PATTERNS) {
    upsert({ ...ap, type: "AP" });
  }
  console.log(`✓ AP: ${ANTI_PATTERNS.length} entries`);

  for (const conv of CONVENTIONS) {
    upsert({ ...conv, type: "CONV", severity: null, pattern: null, impact: null, fix_suggestion: null });
  }
  console.log(`✓ CONV: ${CONVENTIONS.length} entries`);

  for (const exp of EXPERIENCES) {
    upsert({ ...exp, type: "EXP", severity: null, pattern: null, impact: null, fix_suggestion: null });
  }
  console.log(`✓ EXP: ${EXPERIENCES.length} entries`);

  console.log(`\n✓ Total: ${count} entries (project: ${project})`);
}

console.log("Seeding Java backend knowledge base...");
console.log(`DB: ${DB_PATH}`);
seed();
console.log("\nDone!");
