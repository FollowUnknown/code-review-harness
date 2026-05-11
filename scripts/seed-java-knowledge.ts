/**
 * Seed script: Import Java backend review knowledge into codeReview DB.
 *
 * Usage:
 *   npx tsx scripts/seed-java-knowledge.ts
 *
 * v1.4.3: Added 50 rules from qiqiao-saas code review experience doc,
 *         with bad_code/good_code examples. Total ~65+ entries idempotent.
 *
 * Idempotent: uses fingerprint dedup, safe to re-run.
 */

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.KNOWLEDGE_DB_PATH || path.resolve(__dirname, "../knowledge.db");

if (DB_PATH === path.resolve(__dirname, "../knowledge.db") && process.env.NODE_ENV === "production" && !process.env.ALLOW_SEED_PROD) {
  console.error("✗ Refusing to seed into production DB. Set ALLOW_SEED_PROD=1 to override.");
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Ensure bad_code/good_code columns exist (idempotent)
for (const col of ["bad_code", "good_code"]) {
  const cols = db.prepare("PRAGMA table_info(knowledge_entries)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE knowledge_entries ADD COLUMN ${col} TEXT`);
    console.log(`✓ Added column: ${col}`);
  }
}

// ---- Base entries (v1.3.7 originals, kept) ----

type SeedEntry = {
  id: string; title: string; severity?: string | null; pattern?: string | null;
  impact?: string | null; fix_suggestion?: string | null; content: string;
  bad_code?: string | null; good_code?: string | null; confidence: number;
};

const ANTI_PATTERNS: SeedEntry[] = [
  { id: "JB-AP-001", title: "空 catch 块吞异常", severity: "CRITICAL", pattern: "catch\\s*\\(\\s*Exception", impact: "异常被静默吞掉，无法排查问题", fix_suggestion: "至少记录日志：log.error(\"操作失败\", e); 或重新抛出", content: "模式: catch (Exception e) { /* 空 */ }\n影响: 异常被静默吞掉，无法排查问题\n修复: 至少记录日志 log.error(\"操作失败\", e); 或重新抛出业务异常", bad_code: "try {\n    doSomething();\n} catch (Exception e) {\n    // 空块，异常被吞掉\n}", good_code: "try {\n    doSomething();\n} catch (Exception e) {\n    log.error(\"操作失败\", e);\n    throw new BusinessException(\"操作失败\", e);\n}", confidence: 0.95 },
  { id: "JB-AP-002", title: "catch 后丢 cause", severity: "HIGH", pattern: "throw new \\w+Exception\\(\"(?!.*\",\\s*[a-z])", impact: "丢失原始异常堆栈，无法定位根因", fix_suggestion: "传递 cause：throw new BusinessException(\"操作失败\", e);", content: "模式: catch 后 new 异常不传 cause\n影响: 丢失原始异常堆栈，无法定位根因\n修复: throw new BusinessException(\"操作失败\", e);", bad_code: "catch (IOException e) {\n    throw new BusinessException(\"操作失败\");\n}", good_code: "catch (IOException e) {\n    throw new BusinessException(\"操作失败\", e);\n}", confidence: 0.9 },
  { id: "JB-AP-003", title: "资源未关闭（未使用 try-with-resources）", severity: "HIGH", pattern: "(FileInputStream|FileOutputStream|Connection|Statement|ResultSet)\\s+\\w+\\s*=\\s*new", impact: "文件句柄/连接泄漏，最终导致 OOM 或 Too many open files", fix_suggestion: "使用 try-with-resources: try (InputStream is = new FileInputStream(...)) { ... }", content: "模式: InputStream/Connection/Statement 未在 finally 或 try-with-resources 中关闭\n影响: 资源泄漏，导致 OOM 或 Too many open files\n修复: 使用 try-with-resources 自动关闭", bad_code: "InputStream is = new FileInputStream(file);\n// 使用 is...\nis.close(); // 如果中间抛异常，close 不会执行", good_code: "try (InputStream is = new FileInputStream(file)) {\n    // 使用 is...\n} // 自动关闭", confidence: 0.9 },
  { id: "JB-AP-004", title: "SimpleDateFormat 多线程使用", severity: "HIGH", pattern: "static.*SimpleDateFormat", impact: "SimpleDateFormat 非线程安全，多线程环境下产生错误日期或 ArrayIndexOutOfBoundsException", fix_suggestion: "使用 DateTimeFormatter（线程安全）或 ThreadLocal<SimpleDateFormat>", content: "模式: static SimpleDateFormat 共享实例\n影响: 非线程安全，多线程产生错误日期\n修复: 使用 DateTimeFormatter 或 ThreadLocal<SimpleDateFormat>", bad_code: "private static final SimpleDateFormat sdf = new SimpleDateFormat(\"yyyy-MM-dd\");", good_code: "private static final DateTimeFormatter dtf = DateTimeFormatter.ofPattern(\"yyyy-MM-dd\");", confidence: 0.9 },
  { id: "JB-AP-005", title: "NPE 风险：未判空直接调用方法", severity: "HIGH", pattern: "\\.\\w+\\(\\)\\.\\w+", impact: "NullPointerException，线上 500 错误", fix_suggestion: "使用 Optional.ofNullable() 或提前判空", content: "模式: 链式调用未判空 user.getName().length()\n影响: NullPointerException 线上错误\n修复: Optional.ofNullable(user).map(User::getName).orElse(\"\") 或提前判空", bad_code: "String name = user.getDepartment().getName(); // NPE risk", good_code: "String name = Optional.ofNullable(user)\n    .map(User::getDepartment)\n    .map(Department::getName)\n    .orElse(\"未知\");", confidence: 0.9 },
  { id: "JB-AP-006", title: "System.out.println 替代日志框架", severity: "MEDIUM", pattern: "System\\.out\\.print", impact: "无法控制日志级别、无法关闭、无格式化、性能差", fix_suggestion: "使用 log.info/debug/warn/error 替代", content: "模式: System.out.println 调试输出\n影响: 无法控制级别和格式，性能差\n修复: 使用 log.info/debug/warn/error", bad_code: "System.out.println(\"result=\" + result);", good_code: "log.info(\"result={}\", result);", confidence: 0.85 },
  { id: "JB-AP-007", title: "日志中打印敏感信息", severity: "CRITICAL", pattern: "log\\.\\w+\\([^)]*password", impact: "密码、token、身份证号等敏感信息泄露到日志文件", fix_suggestion: "脱敏处理：log.info(\"user login: phone={}\", mask(phone)); 或不打印", content: "模式: 日志打印密码/token/身份证\n影响: 敏感信息泄露到日志文件\n修复: 脱敏处理或不打印敏感字段", bad_code: "log.info(\"user login: password={}\", password);", good_code: "log.info(\"user login: userId={}\", user.getId());", confidence: 0.95 },
  { id: "JB-AP-008", title: "@Transactional 在私有方法上无效", severity: "HIGH", pattern: "@Transactional\\s+private", impact: "Spring AOP 代理无法拦截私有方法，事务不生效", fix_suggestion: "@Transactional 只能用于 public 方法", content: "模式: @Transactional 标注在 private 方法\n影响: Spring 代理无法拦截，事务不生效\n修复: 改为 public 方法，或提取到单独的 Service", bad_code: "@Transactional\nprivate void updateOrder() { ... }", good_code: "@Transactional\npublic void updateOrder() { ... }", confidence: 0.9 },
  { id: "JB-AP-009", title: "魔法数字/字符串未提取常量", severity: "MEDIUM", pattern: "==\\s*\\d+\\s*[){]", impact: "代码可读性差，修改时容易遗漏", fix_suggestion: "提取为常量或枚举：if (status == OrderStatus.COMPLETED.getCode())", content: "模式: 代码中直接使用数字/字符串字面量\n影响: 可读性差，维护困难\n修复: 提取为常量或枚举", bad_code: "if (status == 3) { ... }", good_code: "if (status == OrderStatus.COMPLETED.getCode()) { ... }", confidence: 0.8 },
  { id: "JB-AP-010", title: "循环内执行数据库查询（N+1 问题）", severity: "HIGH", pattern: "for\\s*\\([^)]+\\)\\s*\\{[^}]*Mapper\\.\\w+", impact: "N+1 查询导致数据库压力大、响应慢", fix_suggestion: "批量查询 + Map 缓存", content: "模式: 循环内单条查询 for (order : orders) { mapper.selectById(...) }\n影响: N+1 查询，数据库压力大\n修复: 批量查询 + Map 缓存", bad_code: "for (Order o : orders) {\n    User u = userMapper.selectById(o.getUserId());\n    o.setUserName(u.getName());\n}", good_code: "List<Long> userIds = orders.stream().map(Order::getUserId).collect(toList());\nMap<Long, User> userMap = userMapper.selectByIds(userIds).stream()\n    .collect(toMap(User::getId, Function.identity()));\norders.forEach(o -> o.setUserName(userMap.get(o.getUserId()).getName()));", confidence: 0.9 },
];

// ---- v1.4.3 New rules from qiqiao-code-review-rules.md ----

const NEW_ANTI_PATTERNS: SeedEntry[] = [
  // P0 rules
  { id: "JB-AP-011", title: "ThreadLocal 未在 finally 中 remove（线程池复用数据泄漏）", severity: "CRITICAL", pattern: "ThreadLocal", impact: "线程池复用线程时 ThreadLocal 残留上次数值，导致数据错乱或泄漏", fix_suggestion: "必须在 finally 中调用 remove()，或使用项目规范的 QiQiaoContext", content: "模式: 使用 ThreadLocal 但未在 finally 中 remove\n影响: 线程池复用导致数据串号/泄漏\n来源: qiqiao-saas — RepositoryVersionHelper 定义了 5 个 ThreadLocal 静态变量但无任何 remove 调用", bad_code: "private static final ThreadLocal<String> TL_TENANT = new ThreadLocal<>();\n\npublic void doBusiness() {\n    TL_TENANT.set(tenantId);\n    // business logic — 如果这里抛异常，TL_TENANT 永不清理\n}", good_code: "public void doBusiness() {\n    try {\n        QiQiaoContext.setTenantId(tenantId);\n        // business logic\n    } finally {\n        QiQiaoContext.remove();\n    }\n}", confidence: 0.95 },
  { id: "JB-AP-012", title: "MQ 消费者未继承 AbstractAsyncListener", severity: "CRITICAL", pattern: "implements\\s+MessageListener", impact: "无错误处理、无重试机制、无手动 ACK，消息可靠性无法保证", fix_suggestion: "继承 AbstractAsyncListener，自带错误处理 + 重试 + 手动ACK", content: "模式: 直接 implements MessageListener\n影响: 无错误处理/重试/ACK，消息可能丢失\n来源: qiqiao-saas — YbgTodoHandlerListener", bad_code: "public class YbgTodoHandlerListener implements MessageListener {\n    @Override\n    public void onMessage(Message message) {\n        // 无错误处理、无重试、无手动ACK\n    }\n}", good_code: "public class YbgTodoHandlerListener extends AbstractAsyncListener {\n    @Override\n    protected void handleMessage(Message message) {\n        // 业务逻辑 — 框架自动处理错误/重试/ACK\n    }\n}", confidence: 0.95 },
  { id: "JB-AP-013", title: "线程池禁止方法内 new（不复用）", severity: "CRITICAL", pattern: "new ThreadPoolExecutor\\(|Executors\\.new", impact: "每次调用创建新线程池，线程资源耗尽，且无法统一监控和管理", fix_suggestion: "注入 Spring 管理的 ThreadPoolTaskExecutor Bean", content: "模式: 方法内 new ThreadPoolExecutor\n影响: 线程池不复用，资源耗尽\n来源: qiqiao-saas — 3+ 处方法内 new ThreadPoolExecutor", bad_code: "ExecutorService executorService = new ThreadPoolExecutor(\n    10, 20, 10000L, TimeUnit.MILLISECONDS,\n    new LinkedBlockingDeque<>(120), threadFactory);", good_code: "@Autowired\n@Qualifier(\"formFieldExecutor\")\nprivate ThreadPoolTaskExecutor formFieldExecutor;", confidence: 0.95 },
  { id: "JB-AP-014", title: "@Async 未指定线程池（默认 SimpleAsyncTaskExecutor）", severity: "CRITICAL", pattern: "@Async\\s*\\n\\s*public", impact: "Spring 默认使用 SimpleAsyncTaskExecutor，每次新建线程不复用，高并发下线程爆炸", fix_suggestion: "@Async 必须指定线程池名称", content: "模式: @Async 无线程池指定\n影响: 默认无界创建线程，高并发风险\n来源: qiqiao-saas — 5+ 处 @Async 无指定", bad_code: "@Async\npublic void saveLog(...) { ... }", good_code: "@Async(\"workflowLogExecutor\")\npublic void saveLog(...) { ... }", confidence: 0.95 },
  { id: "JB-AP-015", title: "GET 接口做写操作（高并发重复数据）", severity: "CRITICAL", pattern: "@GetMapping.*\\n[\\s\\S]*?(insert|save|update|create)", impact: "高并发下导致重复数据和幂等问题", fix_suggestion: "写操作用 POST/PUT，并做幂等校验", content: "模式: GET 接口执行写操作\n影响: 高并发重复数据\n来源: qiqiao-saas — YbgTodoAssembleController", bad_code: "@GetMapping(\"/todo/assemble\")\npublic Result assemble(@RequestParam String todoId) {\n    // 内部既有查询又有写入\n}", good_code: "@PostMapping(\"/todo/assemble\")\npublic Result assemble(@RequestBody AssembleRequest req) {\n    // 幂等校验 + 写操作\n}", confidence: 0.95 },
  // P1 rules
  { id: "JB-AP-016", title: "Map<String,Object> 传参应转为 DTO", severity: "HIGH", pattern: "Map<String,\\s*Object>", impact: "弱类型无法在编译期校验，维护成本极高", fix_suggestion: "定义强类型 DTO/VO", content: "模式: 使用 Map<String, Object> 传参\n影响: 编译期无校验，字段意图不清\n来源: qiqiao-saas — 4+ 处散装 Map 传参", bad_code: "public PageUtils queryPage(Map<String, Object> params) { ... }", good_code: "public class SystemMenuQueryDTO {\n    private String menuName;\n    private Integer page;\n    private Integer pageSize;\n}\npublic PageUtils queryPage(SystemMenuQueryDTO dto) { ... }", confidence: 0.9 },
  { id: "JB-AP-017", title: "MQ 生产者一次性发送大量消息（未分批）", severity: "HIGH", pattern: "for\\s*\\([^)]+\\).*sendMessage", impact: "一次性发送大量消息导致 MQ 积压、内存溢出", fix_suggestion: "使用 Lists.partition 分批发送", content: "模式: 循环逐条发送未分批\n影响: MQ 积压、内存溢出\n来源: qiqiao-saas — 2 处未使用 Lists.partition", bad_code: "for (UserDTO user : allUsers) {\n    sendWxTemplateMsg(user, template);\n}", good_code: "List<List<UserDTO>> batches = Lists.partition(allUsers, 100);\nfor (List<UserDTO> batch : batches) {\n    batchSendWxTemplateMsg(batch, template);\n}", confidence: 0.9 },
  { id: "JB-AP-018", title: "throw new RuntimeException 应替换为项目自定义异常", severity: "HIGH", pattern: "throw new RuntimeException\\((\"|e)", impact: "异常类型过于笼统，全局异常处理器无法区分业务/系统异常，排查困难", fix_suggestion: "使用项目自定义异常体系（BusinessException / SystemException）", content: "模式: throw new RuntimeException\n影响: 异常无分类，全局异常处理器无法区分处理\n来源: qiqiao-saas — 14 处 throw new RuntimeException", bad_code: "throw new RuntimeException(\"找不到当前任务\");\nthrow new RuntimeException(e);", good_code: "throw new BpmnBusinessException(ErrorCode.TASK_NOT_FOUND, taskId);\nthrow new BpmnSystemException(\"未支持周期: \" + curFreq, e);", confidence: 0.9 },
  { id: "JB-AP-019", title: "消息通知在 client 层发送（违反业务完成统一发送原则）", severity: "HIGH", pattern: "@PushMessage", impact: "违背业务处理完成后统一发送消息的原则，导致消息时序错乱", fix_suggestion: "业务层处理完成后通过事件机制统一发送", content: "模式: client 层 @PushMessage 发消息\n影响: 消息时序错乱、重复发送\n来源: qiqiao-saas — MessageCenterClient", bad_code: "@PushMessage\npublic void sendNotification(...) { ... }", good_code: "@Transactional\npublic void approveTask(...) {\n    doApprove(...);\n    eventPublisher.publishEvent(new TaskApprovedEvent(...));\n}", confidence: 0.9 },
  { id: "JB-AP-020", title: "频繁查询数据库/通讯录未缓存（N+1/性能瓶颈）", severity: "HIGH", pattern: "for\\s*\\([^)]+\\).*(selectById|findById|getById)", impact: "N+1 查询或频繁调用外部服务导致性能瓶颈", fix_suggestion: "批量查询 + 本地缓存/Redis 缓存", content: "模式: 频繁单条查询未使用缓存\n影响: 性能瓶颈、数据库压力\n来源: qiqiao-saas — 5+ 处 FIXME 标记严重性能问题", bad_code: "// FIXME: 此处频繁查询数据库、中台通讯录\nfor (String userId : userIds) {\n    User user = userService.getById(userId);\n}", good_code: "// 批量查询 + Map 缓存\nList<User> users = userService.listByIds(userIds);\nMap<String, User> userMap = users.stream().collect(toMap(User::getId, u -> u));", confidence: 0.9 },
  { id: "JB-AP-021", title: "CMD 责任链返回值被静默丢弃", severity: "HIGH", pattern: "Cmd.*return.*null", impact: "责任链中后续节点无法判断业务是否已执行", fix_suggestion: "CMD 返回值必须被使用，责任链需基于返回值决定是否继续", content: "模式: CMD 返回值在责任链中未起作用\n影响: 责任链无法判断业务执行状态\n来源: qiqiao-saas — RevokeTaskCmd", bad_code: "// FIXME: CMD的返回值在责任链中没有起到作用\npublic Boolean execute(Context ctx) {\n    // ...\n    return null; // 返回值被丢弃\n}", good_code: "public Boolean execute(Context ctx) {\n    // ...\n    return true; // 责任链根据返回值决定是否继续\n}", confidence: 0.85 },
  { id: "JB-AP-022", title: "重复代码未抽取公共方法", severity: "MEDIUM", pattern: "FIXME.*冗余|FIXME.*重复|FIXME.*共用一套", impact: "维护成本翻倍，修改一处需同步修改多份拷贝", fix_suggestion: "抽取公共方法/基类，消除重复代码", content: "模式: 多个类/方法包含几乎相同的逻辑\n影响: 维护成本高，Bug 需在多处修复\n来源: qiqiao-saas — 6 处 FIXME 标记代码重复", bad_code: "// PrintButtonBehavior.java\n// 连接器打印和pc端打印按钮，代码逻辑除了写入excel不一样外，其他共用一套\n// 但写了两份几乎相同的代码", good_code: "// 抽取 AbstractPrintBehavior，子类只覆写 writeExcel 方法\npublic abstract class AbstractPrintBehavior {\n    public void print() { /* 公共逻辑 */ }\n    protected abstract void writeExcel();\n}", confidence: 0.85 },
  { id: "JB-AP-023", title: "权限资源（RoleModel）数据填充不统一", severity: "MEDIUM", pattern: "RoleModel|roleModel", impact: "权限数据填充逻辑散落各处，修改权限模型时需要改多个文件", fix_suggestion: "统一权限数据填充机制，收口到权限服务", content: "模式: 权限资源（RoleModel）数据填充散落各处\n影响: 权限模型变更需改多文件，易遗漏\n来源: qiqiao-saas — 8 处 FIXME 标记权限填充不统一", bad_code: "// 8 个不同文件中各自填充 RoleModel\n// DataSetFilterGroupsUtils, AbstractChartBindConfig, \n// BusinessDefinitionServiceImpl, DataFilterGroupUtils...", good_code: "// 统一收口到 RoleModelService.fillRoleModel(resource)", confidence: 0.8 },
  { id: "JB-AP-024", title: "流程查看权限逻辑不统一", severity: "MEDIUM", pattern: "VisiblePermission|visiblePermission", impact: "不同入口的流程查看权限判断逻辑不一致，安全漏洞", fix_suggestion: "统一流程查看权限判断，收口到权限服务", content: "模式: 流程查看权限判断散落在 10+ 处\n影响: 权限不一致，安全风险\n来源: qiqiao-saas — 10 处 FIXME 标记权限不统一", bad_code: "// 10+ 处各自判断流程查看权限\n// FIXME: 由于流程查看权限没有上流程标记要屏蔽掉", good_code: "// 统一收口:\n// permissionService.canViewProcess(userId, processId)", confidence: 0.8 },
  { id: "JB-AP-025", title: "查询只取 id 时查了整个实体", severity: "MEDIUM", pattern: "selectById|selectOne.*\\n(?!.*SELECT.*id.*FROM)", impact: "查询整个实体但只用了 id 字段，浪费内存和数据库带宽", fix_suggestion: "只查询需要的字段：SELECT id FROM ... WHERE ...", content: "模式: 只需 id 却查询了完整实体\n影响: 内存浪费、数据库带宽浪费\n来源: qiqiao-saas — ApplicationServiceImpl", bad_code: "// FIXME: 本次查询只需要查询id，不需要查询整个应用实体类\nApplication app = applicationMapper.selectById(appId);\nString id = app.getId(); // 只用了 id", good_code: "String id = applicationMapper.selectIdOnly(appId);\n// SQL: SELECT id FROM application WHERE id = #{appId}", confidence: 0.85 },
  { id: "JB-AP-026", title: "feignclient Jackson 默认编码器对 Map 的类型问题", severity: "MEDIUM", pattern: "@FeignClient|feignclient", impact: "Jackson 对 Map 默认使用 LinkedHashMap，可能类型不匹配", fix_suggestion: "明确指定反序列化类型，或将 Map 改为 DTO", content: "模式: feignclient 使用 Map 接收响应\n影响: Jackson 默认 LinkedHashMap 导致类型错误\n来源: qiqiao-saas — WebHookFormServiceImpl", bad_code: "// FIXME: feignclient默认的编码器是Jackson\n// Jackson对于Map默认是使用linkedHashMap\nMap<String, Object> result = feignClient.call();", good_code: "WebHookResponseDTO result = feignClient.call();\n// 使用明确的 DTO 类型接收", confidence: 0.8 },
  { id: "JB-AP-027", title: "表单引擎前后端数据不一致（触发事件后重新查库）", severity: "HIGH", pattern: "DocumentUtils|表单引擎", impact: "前端传入数据经触发事件处理后从数据库重新查询，导致数据不一致", fix_suggestion: "梳理事件处理链路，确保数据一致性", content: "模式: 表单引擎触发事件后重新查库导致数据不一致\n影响: 前端传入数据被数据库旧数据覆盖\n来源: qiqiao-saas — DocumentUtils", bad_code: "// FIXME: 前端传入子表数据，子表数据经过触发事件处理后\n// 会基于筛选条件重新从数据库查询\n// 导致前端传入和数据库查询的数据不一致", good_code: "// 事件处理中尊重前端传入数据，以传入数据为准\n// 仅在必要时重新查询并做合并", confidence: 0.85 },
  { id: "JB-AP-028", title: "applicationId 获取方式不统一", severity: "MEDIUM", pattern: "getApplicationId|applicationId", impact: "不同地方使用不同的 applicationId 来源，切换困难", fix_suggestion: "统一使用 document.getApplicationId()，梳理影响范围", content: "模式: applicationId 获取方式散落，有的从参数取有的从 document 取\n影响: 切换/迁移困难，公共表单场景有 bug\n来源: qiqiao-saas — 5 处 FIXME 标记不统一", bad_code: "// 有的地方从参数取 applicationId\n// 有的地方从 document 取\n// FIXME: 后续需要将获取applicationId的方式变成直接: document.getApplicationId()", good_code: "// 统一方式\nString appId = document.getApplicationId();", confidence: 0.8 },
];

// ---- Original conventions & experiences (v1.3.7) ----

const CONVENTIONS: SeedEntry[] = [
  { id: "JB-CONV-001", title: "异常分类：业务异常 vs 系统异常", content: "• 业务异常（用户输入错误、业务规则不满足）：抛出 BusinessException，前端展示错误消息\n• 系统异常（网络超时、DB 错误）：抛出 SystemException，记录完整堆栈，返回通用错误页\n• 全局异常处理器 @RestControllerAdvice 统一捕获，区分处理\n• 异常消息要包含上下文：\"订单 #12345 状态不允许取消（当前: PAID）\" 而非 \"操作失败\"", confidence: 0.85 },
  { id: "JB-CONV-002", title: "Controller/Service/Mapper 分层规范", content: "• Controller：参数校验（@Valid）、调用 Service、返回 VO\n• Service：业务逻辑、事务控制、不依赖 HTTP 对象\n• Mapper/DAO：纯数据访问，不包含业务逻辑\n• Entity 与 DTO/VO 分离：Entity 映射数据库，DTO 接收参数，VO 返回结果\n• 禁止在 Controller 中直接注入 Mapper", confidence: 0.85 },
  { id: "JB-CONV-003", title: "REST API 设计规范", content: "• URL 用名词复数：/api/v1/orders 而非 /api/v1/getOrders\n• HTTP 方法表示操作：GET 查询、POST 创建、PUT 更新、DELETE 删除\n• 响应统一信封：{ code, message, data }\n• 分页参数：page/size 或 offset/limit，响应包含 total\n• 错误响应包含具体字段和原因，避免笼统的 \"参数错误\"", confidence: 0.8 },
  { id: "JB-CONV-004", title: "日志规范", content: "• 关键业务操作记录 info 日志：创建订单、状态变更、支付回调\n• 异常必须记录 error 日志，含完整堆栈和入参\n• debug 级别用于开发调试，上线前确认不输出敏感信息\n• 使用参数化日志：log.info(\"order {} created, amount={}\", orderId, amount)\n• 禁止字符串拼接：log.info(\"order \" + orderId + \" created\") // 性能差", confidence: 0.8 },
  { id: "JB-CONV-005", title: "并发与线程安全规范", content: "• SimpleDateFormat → DateTimeFormatter\n• 共享可变状态必须同步或使用并发集合\n• @Async 方法返回 CompletableFuture\n• 线程池配置：核心线程数、最大线程数、队列容量、拒绝策略\n• Spring 单例 Bean 中的成员变量必须是线程安全的（或无状态）", confidence: 0.8 },
];

const EXPERIENCES: SeedEntry[] = [
  { id: "JB-EXP-001", title: "根因分析要精确到字段", content: "场景: 业务校验失败\n建议: 错误消息应精确说明哪个字段、期望什么值、实际什么值\n反例: \"参数错误\" → 正例: \"订单状态不允许取消（orderId=123, 当前状态=PAID, 期望=CANCELED)\"\n来源: 架构师评审 R-2e98011c", confidence: 0.75 },
  { id: "JB-EXP-002", title: "数据结构选择影响可维护性", content: "场景: 复杂业务对象传递\n建议: 用 DTO/VO 明确字段含义，不用 Map<String, Object>\n反例: Map<String, Object> params = new HashMap<>(); params.put(\"type\", 1);\n正例: OrderQueryDTO dto = new OrderQueryDTO(); dto.setOrderType(OrderType.NORMAL);\n来源: 架构师评审 R-2e98011c", confidence: 0.75 },
  { id: "JB-EXP-003", title: "可观测性：关键操作必须留痕", content: "场景: 支付回调、状态变更、权限修改\n建议: 记录操作人、操作时间、变更前后值\n实现: 操作日志表 + AOP 切面自动记录\n来源: 架构师评审 R-2e98011c", confidence: 0.75 },
  { id: "JB-EXP-004", title: "接口参数校验使用 Bean Validation", content: "场景: Controller 接口参数校验\n建议: 使用 @NotNull @Size @Pattern 等 JSR-303 注解，配合 @Valid\n反例: if (name == null || name.isEmpty()) throw new Exception(\"名字不能为空\");\n正例: @NotBlank(message = \"名字不能为空\") private String name;\n来源: Java 后端评审经验", confidence: 0.7 },
  { id: "JB-EXP-005", title: "MyBatis 查询避免 select *", content: "场景: 数据库查询\n建议: 明确指定需要的字段，避免 select * 带来的性能和内存浪费\n反例: SELECT * FROM order WHERE id = #{id}\n正例: SELECT id, order_no, status, amount FROM order WHERE id = #{id}\n来源: Java 后端评审经验", confidence: 0.7 },
];

const NEW_CONVENTIONS: SeedEntry[] = [
  { id: "JB-CONV-006", title: "ThreadLocal 使用规范：QiQiaoContext 管理本地线程缓存", content: "• 禁止直接 new ThreadLocal()，统一使用 QiQiaoContext\n• ThreadLocal 变量必须在 finally 中 remove()\n• 涉及：tenantId, appId, formId, userId, processId 等上下文字段\n来源: qiqiao-saas FIXME 规范", confidence: 0.9 },
  { id: "JB-CONV-007", title: "RESTful 接口规范：HTTP Method 区分操作 + 路径名词复数", content: "• URL 用名词复数：/third-auth-configs 而非 /third-auth-config\n• HTTP 方法表示操作：GET 查询、POST 创建、PUT 更新、DELETE 删除\n• 禁止路径动词：不需要 /save、/get、/list\n• 分页查询使用 POST 传复杂条件\n来源: qiqiao-saas — seven 评审 zhangsha，同一需求 20+ 处 FIXME", confidence: 0.85 },
  { id: "JB-CONV-008", title: "命名规范：名副其实 + Query/List/Count 区分", content: "• Query → 分页查询，List → 集合查询，Count → 统计查询\n• 方法名需体现业务含义，不能太通用（如 updateOther 不清晰）\n• DTO 命名全大写缩写（PageGroupDTO 而非 PageGroupDto）\n• 枚举 value 和 name 保持一致，方便反序列化\n• 属性命名遵循 Java 规范（conversationId 而非 conversation_id）\n来源: qiqiao-saas — 10+ 处命名 FIXME", confidence: 0.85 },
  { id: "JB-CONV-009", title: "魔法值/字符串常量必须使用枚举或静态变量", content: "• 验证器 value 值使用枚举（InvoiceValidateHandler 等 5 处）\n• 连接器参数 type/dataType 使用枚举\n• 文件上传类型使用枚举\n• boolean 使用 tinyInt 而非 MySQL boolean（架构组要求）\n来源: qiqiao-saas — 11+ 处魔法值 FIXME", confidence: 0.85 },
  { id: "JB-CONV-010", title: "注释与 Swagger 规范：类/属性/方法必须有注释", content: "• 所有 DTO 类补充分类注释和使用说明\n• 所有属性补充 Swagger 注解（@ApiModelProperty）\n• 接口方法补充接口说明\n• 注释不要口语化\n来源: qiqiao-saas — 105 条 FIXME 标注缺少注释/文档", confidence: 0.8 },
  { id: "JB-CONV-011", title: "兼容/临时代码必须标注删除条件和到期时间", content: "• 升级数据后移除的代码 → 标注删除条件和到期时间\n• 等新方法稳定后移除旧方法 → 标注稳定观察期\n• 临时方案 → 标注为什么临时、何时可移除\n• 格式：FIXME(技术债务-0919-张沙):等新方法稳定后移除 删除条件：上线稳定 2 周 到期时间：YYYY-MM-DD\n来源: qiqiao-saas — 79 条 FIXME 关于兼容/临时/待移除", confidence: 0.85 },
  { id: "JB-CONV-012", title: "集合操作规范：判空、Stream、包装类型", content: "• 集合判空使用 CollectionUtils.isEmpty/isNotEmpty，禁止手动判空\n• 使用 Stream API 替代 for 循环 + 手动聚合\n• 属性使用包装类型（Integer 而非 int）替代基本类型\n• 返回值为 RestPage 时，方法名应为 queryXxx\n来源: qiqiao-saas — 多处评审 FIXME", confidence: 0.8 },
  { id: "JB-CONV-013", title: "代码评审流程规范：FIXME 注释由评审人删除", content: "• 开发者修改完代码后不要自行移除 FIXME 注释\n• 由代码评审人验证后删除\n• FIXME 格式：FIXME(评审人-需求/缺陷编号):评审意见\n• 修复后追加：FIXME(yiren-360-complete-已补充-已评审)\n来源: qiqiao-saas — 30+ 处评审流程约定", confidence: 0.85 },
  { id: "JB-CONV-014", title: "配置管理规范：全局配置类 + Nacos 动态配置 + Redis key static", content: "• 属性定义放全局配置类，支持 Nacos 动态配置\n• Redis key 定义为 static，便于 Spring 机制删除\n• 配置项变更时需清理相关 Redis 缓存\n• 硬编码配置需下沉至 qiqiao-config 模块\n来源: qiqiao-saas — 多处 FIXME", confidence: 0.8 },
  { id: "JB-CONV-015", title: "异常与错误码规范：分业务异常/系统异常 + 精确到字段", content: "• 业务异常抛 BusinessException，前端展示消息\n• 系统异常抛 SystemException，记录完整堆栈\n• 全局异常处理器 @RestControllerAdvice 统一捕获\n• 错误消息精确到字段：\"订单 #12345 状态不允许取消（当前: PAID）\" 而非 \"操作失败\"\n来源: qiqiao-saas + 架构师评审", confidence: 0.85 },
];

const NEW_EXPERIENCES: SeedEntry[] = [
  { id: "JB-EXP-006", title: "表单引擎触发事件处理后数据不一致——以传入数据为准", content: "场景: 表单提交时触发事件处理，事件中重新查库覆盖前端数据\n建议: 事件处理中尊重前端传入数据，仅在必要时重新查询并做合并\n来源: qiqiao-saas — DocumentUtils FIXME", confidence: 0.75 },
  { id: "JB-EXP-007", title: "流程查看权限因未上流程标记导致屏蔽不生效", content: "场景: 流程查看权限没有上完流程标记，权限判断被跳过\n建议: 流程标记上线后统一清理屏蔽逻辑\n来源: qiqiao-saas — 10 处 FIXME", confidence: 0.75 },
  { id: "JB-EXP-008", title: "PDF 打印 Content-Disposition 导致无法预览", content: "场景: PDF 打印功能需要预览而非下载\n建议: 指定 Content-Disposition 会导致无法正常预览，预览场景需使用 inline\n来源: qiqiao-saas — TcloudCosUtil FIXME", confidence: 0.7 },
  { id: "JB-EXP-009", title: "事件机制应统一改造为消息事件 + 事件监听器下沉流程引擎", content: "场景: 多个模块各自实现事件监听，重复且分散\n建议: 统一改造为消息事件机制，通用监听器下沉至流程引擎\n来源: qiqiao-saas — FormEventCommandUtil + DocumentDeleteEventListener FIXME", confidence: 0.7 },
  { id: "JB-EXP-010", title: "顺序签/逐级审批多场景二期补全", content: "场景: 撤回/加签/驳回不支持顺序签、虚拟节点、逐级审批、矩阵等复杂场景\n建议: 二期统一处理虚拟节点/矩阵/主子分支的撤回和驳回逻辑\n来源: qiqiao-saas — 7 处 FIXME(000014-seven) 标记二期", confidence: 0.7 },
  { id: "JB-EXP-011", title: "大数量写文件需考虑临时文件方案", content: "场景: 批量导出 PDF 时一次性读取全量数据到内存\n建议: 考虑写临时文件方案来应对大数量情况，避免 OOM\n来源: qiqiao-saas — GeneratePdfUtils FIXME", confidence: 0.7 },
  { id: "JB-EXP-012", title: "假删除需明确标注策略和清理计划", content: "场景: 业务数据使用假删除但未标注何时真删\n建议: 假删除必须标注策略（软删/回收站/定期归档）和清理计划\n来源: qiqiao-saas — FileStorageServiceImpl FIXME", confidence: 0.7 },
];

// ---- Seed Logic ----

function seed() {
  const now = new Date().toISOString();
  let count = 0;

  const insertEntry = db.prepare(`
    INSERT INTO knowledge_entries (id, type, project, module, severity, title, pattern, impact, fix_suggestion, content, status, bad_code, good_code, source_review, source_mr, source_file, fingerprint, confidence, scope_level, hit_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);

  const findByFingerprint = db.prepare("SELECT id FROM knowledge_entries WHERE fingerprint = ? LIMIT 1");
  const updateEntry = db.prepare(`
    UPDATE knowledge_entries SET content = ?, severity = COALESCE(?, severity), impact = COALESCE(?, impact),
      fix_suggestion = COALESCE(?, fix_suggestion), bad_code = COALESCE(?, bad_code), good_code = COALESCE(?, good_code),
      confidence = ?, updated_at = ? WHERE fingerprint = ?
  `);

  const project = "java-backend";

  function upsert(entry: SeedEntry, type: string) {
    const fingerprint = `${type}|${project}|${entry.title}`;
    const existing = findByFingerprint.get(fingerprint) as { id: string } | undefined;

    if (existing) {
      updateEntry.run(entry.content, entry.severity || null, entry.impact || null, entry.fix_suggestion || null,
        entry.bad_code || null, entry.good_code || null, entry.confidence, now, fingerprint);
    } else {
      insertEntry.run(
        entry.id, type, project, null, entry.severity || null,
        entry.title, entry.pattern || null, entry.impact || null, entry.fix_suggestion || null,
        entry.content, "CONFIRMED", entry.bad_code || null, entry.good_code || null,
        null, null, null, fingerprint, entry.confidence, "foundation", now, now,
      );
    }
    count++;
  }

  const allEntries = [
    ...ANTI_PATTERNS.map((e) => ({ e, t: "AP" })),
    ...NEW_ANTI_PATTERNS.map((e) => ({ e, t: "AP" })),
    ...CONVENTIONS.map((e) => ({ e, t: "CONV" })),
    ...NEW_CONVENTIONS.map((e) => ({ e, t: "CONV" })),
    ...EXPERIENCES.map((e) => ({ e, t: "EXP" })),
    ...NEW_EXPERIENCES.map((e) => ({ e, t: "EXP" })),
  ];

  for (const { e, t } of allEntries) {
    upsert(e, t);
  }

  console.log(`✓ Total: ${count} entries (project: ${project}, scope_level: foundation)`);
  console.log(`  AP: ${ANTI_PATTERNS.length + NEW_ANTI_PATTERNS.length}`);
  console.log(`  CONV: ${CONVENTIONS.length + NEW_CONVENTIONS.length}`);
  console.log(`  EXP: ${EXPERIENCES.length + NEW_EXPERIENCES.length}`);
}

console.log("Seeding Java backend knowledge base (v1.4.3)...");
console.log(`DB: ${DB_PATH}`);
seed();
console.log("\nDone!");
