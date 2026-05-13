/**
 * v1.4.6 需求评审 E2E 自动化验证脚本
 *
 * 业务流程: 用户操作 → API → SSE 事件流 → 数据库状态一致性
 *
 * 场景 1 - 完整评审流程:
 *   POST /api/review/requirement → SSE 流 (init, Loading, Grouping, Preloading,
 *   review_created, review_start, batch_result, ..., COMPLETE)
 *   → 验证 review/job/checkpoint/sub_report 状态
 *
 * 场景 2 - 边界: 重复暂停幂等、无效 checkpointId
 *
 * Mock 策略:
 *  - getRepoMappingsByProductLine: 返回测试仓库映射
 *  - buildMultiProjectScanContext: 返回受控扫描结果 (1 项目, 1 diff)
 *  - classify / dimensions / prompts 等: 真实实现
 *
 * 真实组件:
 *  - Express 服务 (手动组装, 随机端口)
 *  - 用户认证: 创建用户 + JWT token (Authorization: Bearer)
 *  - HTTP fetch + SSE 流解析
 *  - SQLite :memory: 数据库
 *  - LLM 调用 (真实, 从 .env 读取 ANTHROPIC_AUTH_TOKEN / glm-5.1)
 *  - review-store / checkpoint-store / sub-report-store / job-store
 *  - parseReviewResponse / groupByTechStack / mergeReports
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// ─── Mock 声明 (vitest hoisted to top) ───────────────────────────────

vi.mock("../../src/server/config/repo-mapping", () => ({
  getRepoMappingsByProductLine: vi.fn(),
}));

// Mock local-scan: 返回受控扫描结果 (真实 MR: qiqiao-console-web review-master-2.0-fixbug-lht → master-2.0-fixbug)
// 2 Vue 文件变更: ESC 快捷键 + 删除/排序逻辑修复
// 50ms 延迟: 给事件循环留出处理 pause HTTP 请求的时间窗口

const DATA_ORDER_DIFF = [
  "@@ -164,6 +164,11 @@ export default {",
  "           })",
  "         }",
  "       })",
  "+      document.addEventListener('keydown', this._handleKeydown = (e) => {",
  "+        if (e.key === 'Escape') {",
  "+          this.cancel()",
  "+        }",
  "+      })",
  "     }",
  "   },",
  "   watch: {",
  "@@ -198,7 +203,7 @@ export default {",
  "     // 添加数据",
  "     addData() {",
  "       const orderIndex = this.orderbyData.length + 1",
  "-      if (this.limit && this.orderbyData.length >= this.limit) {",
  "+      if (this.limit && this.orderbyData.length > this.limit) {",
  "         this.$message.warning('已达配置限制！')",
  "         return",
  "       }",
  "@@ -211,12 +216,6 @@ export default {",
  "     // 删除数据",
  "     deleteData(index) {",
  "       this.orderbyData.splice(index, 1)",
  "-      if (this.orderbyData.length > 0) {",
  "-        this.orderbyData.forEach((item, index) => {",
  "-          const orderIndex = index + 1",
  "-          item.orderIndex = Number(orderIndex)",
  "-        })",
  "-      }",
  "     },",
  "     // 切换选择排序字段",
  "     handleChangeOrder(item) {",
  "@@ -237,7 +236,7 @@ export default {",
  "       if (isEmpty) {",
  "         this.$alertMsg(this.$t('businessPc.dataOrder.selectData'), 'error')",
  "       } else {",
  "-        this.$emit('confirm', cloneDeep(this.orderbyData))",
  "+        this.$emit('confirm', this.orderbyData)",
  "       }",
  "     },",
  "     // 取消按钮",
].join("\n");

const TREE_NODE_DIFF = [
  "@@ -201,6 +201,20 @@ export default {",
  "         }",
  "       })",
  "     }",
  "+    this._handleKeydown = (e) => {",
  "+      if (e.key === 'Escape') {",
  "+        this.cancel()",
  "+      }",
  "+    }",
  "+    document.addEventListener('keydown', this._handleKeydown)",
  "+",
  "+    this._syncTimer = setInterval(() => {",
  "+      this.orderbyData.forEach((item, index) => {",
  "+        if (!item.orderIndex) {",
  "+          item.orderIndex = index + 1",
  "+        }",
  "+      })",
  "+    }, 5000)",
  "   },",
  "   beforeDestroy() {",
  "     if (this.orderDialog) {",
  "@@ -253,7 +267,10 @@ export default {",
  "       // 设置选中字段的id",
  "       this.orderField.forEach(field => {",
  "         if (item === field.fieldName) {",
  "-            this.orderbyData[index].id = field.id",
  "+            this.orderbyData[index] = {",
  "+              ...this.orderbyData[index],",
  "+              id: field.id",
  "+            }",
  "         }",
  "       })",
  "       if (!this.orderbyData[index].sortType) {",
].join("\n");

const SCAN_RESULT = {
  projects: [
    {
      project: "do1cloud-qiqiao-console-web",
      repoPath: "/tmp/qiqiao-console",
      context: {
        diffs: [
          {
            old_path: "src/modules/businessPc/views/dialogs/dataOrder/index.vue",
            new_path: "src/modules/businessPc/views/dialogs/dataOrder/index.vue",
            new_file: false,
            deleted_file: false,
            renamed_file: false,
            diff: DATA_ORDER_DIFF,
          },
          {
            old_path: "src/modules/businessPc/views/dialogs/treeNodeDesign/index.vue",
            new_path: "src/modules/businessPc/views/dialogs/treeNodeDesign/index.vue",
            new_file: false,
            deleted_file: false,
            renamed_file: false,
            diff: TREE_NODE_DIFF,
          },
        ],
        changedSymbols: ["addData", "deleteData", "handleChangeConfirm", "cancel", "loadTreeData"],
        relatedFiles: [],
        totalTokens: 800,
      },
      techStack: "vue-frontend",
      diffCount: 2,
      diffChars: 950,
      diffPreview: [
        { path: "src/modules/businessPc/views/dialogs/dataOrder/index.vue", newFile: false, diffChars: 550 },
        { path: "src/modules/businessPc/views/dialogs/treeNodeDesign/index.vue", newFile: false, diffChars: 400 },
      ],
    },
  ],
  totalFiles: 2,
  totalTokens: 800,
  projectCount: 1,
};

vi.mock("../../src/server/services/local-scan", () => ({
  buildMultiProjectScanContext: vi.fn().mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 50));
    return SCAN_RESULT;
  }),
  buildRelatedFilesPrompt: vi.fn().mockReturnValue(""),
  buildASTContextPrompt: vi.fn().mockReturnValue(""),
}));

// ─── 常量 ────────────────────────────────────────────────────────────

const PRODUCT_LINE = "qiqiao-console";
const SOURCE_BRANCH = "review-master-2.0-fixbug-lht";
const TARGET_BRANCH = "master-2.0-fixbug";

// ─── Mock 配置 ──────────────────────────────────────────────────────

async function setupMocks() {
  const repoModule = await import("../../src/server/config/repo-mapping");
  vi.mocked(repoModule.getRepoMappingsByProductLine).mockReturnValue([
    {
      id: 1,
      project: "do1cloud-qiqiao-console-web",
      localPath: "/tmp/qiqiao-console",
      productLineId: PRODUCT_LINE,
      techStack: "vue-frontend",
      gitlabHost: "https://git.qiweioa.com.cn",
      gitlabProjectPath: "qiqiao/fore-end/do1cloud-qiqiao-console-web",
      createdAt: new Date().toISOString(),
    },
  ]);
}

// ─── SSE 读取 ──────────────────────────────────────────────────────

/**
 * 读取 SSE 流的下一个事件, 返回 null 当流结束时.
 */
async function readNextSSEEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: { buffer: string }
): Promise<any | null> {
  const decoder = new TextDecoder();
  while (true) {
    // 从 buffer 中尝试提取一个完整事件
    const parts = state.buffer.split("\n\n");
    if (parts.length > 1) {
      state.buffer = parts.slice(1).join("\n\n");
      for (const line of parts[0].split("\n")) {
        if (line.trim().startsWith("data: ")) {
          try {
            return JSON.parse(line.trim().slice(6));
          } catch {
            continue;
          }
        }
      }
    }
    const { done, value } = await reader.read();
    if (done) return null;
    state.buffer += decoder.decode(value, { stream: true });
  }
}

/**
 * 收集 SSE 事件直到 until 条件满足. 每次事件到达时调用 onEvent.
 */
async function collectSSEUntil(
  response: Response,
  until: (event: any) => boolean,
  onEvent?: (event: any) => void,
  timeoutMs = 30_000
): Promise<any[]> {
  const events: any[] = [];
  const reader = response.body!.getReader();
  const state = { buffer: "" };
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      reader.cancel();
      throw new Error(`SSE timeout after ${timeoutMs}ms`);
    }

    const event = await readNextSSEEvent(reader, state);
    if (event === null) break;

    events.push(event);
    if (onEvent) onEvent(event);
    if (until(event)) {
      reader.cancel();
      return events;
    }
  }
  return events;
}

/**
 * 从共享 reader 收集 SSE 事件直到条件满足. 不取消 reader, 调用方负责 cancel.
 * 用于暂停/恢复场景: 先读 init 事件拿 jobId, 发 pause, 再继续读 paused 事件.
 */
async function readEventsUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  state: { buffer: string },
  until: (event: any) => boolean,
  timeoutMs = 15_000
): Promise<any[]> {
  const events: any[] = [];
  const startTime = Date.now();
  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`SSE timeout after ${timeoutMs}ms`);
    }
    const event = await readNextSSEEvent(reader, state);
    if (event === null) break;
    events.push(event);
    if (until(event)) return events;
  }
  return events;
}

// ─── 测试 ────────────────────────────────────────────────────────────

import type { Server } from "http";
import express from "express";
import cors from "cors";
import http from "http";

let server: Server;
let port: number;
let authToken: string;

beforeAll(async () => {
  process.env.KNOWLEDGE_DB_PATH = ":memory:";

  await setupMocks();

  // 初始化内存数据库
  const dbModule = await import("../../src/server/db");
  dbModule.closeDb();
  dbModule.getDb();

  // 创建用户并生成 JWT token
  const { createUser, generateToken } = await import("../../src/server/services/auth");
  const user = createUser({ username: "e2e-test", password: "test-password", displayName: "E2E Test" });
  authToken = generateToken(user);

  // 动态导入路由 (mock 生效后)
  const { authRequired } = await import("../../src/server/middleware/auth");
  const { default: reviewRequirementRouter } = await import(
    "../../src/server/routes/review-requirement"
  );
  const { default: reviewCheckpointRouter } = await import(
    "../../src/server/routes/review-checkpoint-routes"
  );

  // v1.4.6 子报告路由 (GET /list reviews 需要)
  const { default: reviewsRouter } = await import(
    "../../src/server/routes/reviews"
  );

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(authRequired);
  app.use("/api/review", reviewRequirementRouter);
  app.use("/api/review", reviewCheckpointRouter);
  app.use("/api/reviews", reviewsRouter);

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  port = (server.address() as any).port;
});

afterAll(async () => {
  const dbModule = await import("../../src/server/db");
  dbModule.closeDb();
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("v1.4.6 需求评审 E2E", () => {
  it("场景 1: 完整需求评审流程 — 发起 → SSE 事件流 → 完成 → 数据库验证", async () => {
    // ===== 第一步: 发起评审 =====
    const response = await fetch(
      `http://localhost:${port}/api/review/requirement`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify({
          productLine: PRODUCT_LINE,
          sourceBranch: SOURCE_BRANCH,
          targetBranch: TARGET_BRANCH,
        }),
      }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    // ===== 第二步: 读取 SSE 事件流直到 COMPLETE =====
    const events = await collectSSEUntil(
      response,
      (e) => e.status === "done" && e.label === "COMPLETE",
      undefined,
      120_000
    );

    // ===== 第三步: 验证 SSE 事件完整性 =====
    // 必须包含 init 事件
    const initEvent = events.find(
      (e) => e.step === 0 && e.status === "done" && e.label === "init"
    );
    expect(initEvent).toBeDefined();
    expect(initEvent!.jobId).toBeTruthy();

    // 必须包含 COMPLETE 事件
    const completeEvent = events.find(
      (e) => e.status === "done" && e.label === "COMPLETE"
    );
    expect(completeEvent).toBeDefined();
    expect(completeEvent!.detail).toBeTruthy();
    const reportDetail = JSON.parse(completeEvent!.detail);
    expect(reportDetail.reviewId).toBeTruthy();

    // 必须包含 review_created 和 review_start
    expect(events.some((e) => e.type === "review_created")).toBe(true);
    expect(events.some((e) => e.type === "review_start")).toBe(true);

    // 必须包含 batch_result
    expect(events.some((e) => e.type === "batch_result")).toBe(true);

    // 事件序列: init → ... → batch_result → ... → COMPLETE
    const initIdx = events.findIndex((e) => e.label === "init");
    const batchIdx = events.findIndex((e) => e.type === "batch_result");
    const completeIdx = events.findIndex((e) => e.label === "COMPLETE");
    expect(batchIdx).toBeGreaterThan(initIdx);
    expect(completeIdx).toBeGreaterThan(batchIdx);

    // ===== 第四步: 验证数据库状态 =====
    const { findReviewById } = await import(
      "../../src/server/services/review-store"
    );
    const { listSubReports } = await import(
      "../../src/server/services/review-sub-report-store"
    );
    const { findCheckpointById, listCheckpoints } = await import(
      "../../src/server/services/review-checkpoint-store"
    );
    const { findJobById } = await import(
      "../../src/server/services/review-job-store"
    );

    const reviewId = reportDetail.reviewId;

    // review 状态 = completed
    const review = findReviewById(reviewId);
    expect(review).toBeDefined();
    expect(review!.status).toBe("completed");
    expect(review!.passed).not.toBeNull();
    expect(review!.avg_score).not.toBeNull();

    // sub_reports 全部 completed
    const subs = listSubReports(reviewId);
    expect(subs.length).toBeGreaterThanOrEqual(1);
    for (const sub of subs) {
      expect(sub.status).toBe("completed");
      expect(sub.report_json).toBeTruthy();
    }

    // checkpoint 已完成
    const checkpoints = listCheckpoints({ status: "completed" });
    expect(checkpoints.length).toBeGreaterThanOrEqual(1);
    const cp = checkpoints.find((c) => c.id === reviewId || c.accumulatedStats?.includes(reviewId));
    const matchedCp = cp || checkpoints[0];
    expect(matchedCp.status).toBe("completed");
    expect(matchedCp.currentBatch).toBeGreaterThan(0);

    // job 已完成
    if (matchedCp.jobId) {
      const job = findJobById(matchedCp.jobId);
      expect(job).toBeDefined();
      expect(job!.status).toBe("completed");
    }
  });

  it("场景 2: 边界 — 重复暂停幂等 + 无效 checkpointId", async () => {
    // 2a: 重复暂停 — 不存在 jobId → 200 (幂等)
    const res1 = await fetch(`http://localhost:${port}/api/review/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
      body: JSON.stringify({ jobId: "nonexistent-job" }),
    });
    expect(res1.status).toBe(200);
    const body1: any = await res1.json();
    expect(body1.success).toBe(true);

    // 2b: 空 jobId → 400
    const res2 = await fetch(`http://localhost:${port}/api/review/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
      body: JSON.stringify({}),
    });
    expect(res2.status).toBe(400);

    // 2c: 无效 checkpointId → 404
    const res3 = await fetch(
      `http://localhost:${port}/api/review/requirement`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify({
          productLine: PRODUCT_LINE,
          sourceBranch: SOURCE_BRANCH,
          targetBranch: TARGET_BRANCH,
          checkpointId: "CP-nonexistent",
        }),
      }
    );
    expect(res3.status).toBe(404);
    const body3: any = await res3.json();
    expect(body3.error).toContain("Checkpoint not found");
  });

  it("场景 3: 暂停与恢复 — 发起 → 暂停 → 验证暂停状态 → 恢复 → 完成", async () => {
    // ===== 第一步: 发起评审, 获取 init 事件和 jobId =====
    const response = await fetch(
      `http://localhost:${port}/api/review/requirement`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify({
          productLine: PRODUCT_LINE,
          sourceBranch: SOURCE_BRANCH,
          targetBranch: TARGET_BRANCH,
        }),
      }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    // 手动创建 reader 以便分阶段读取 (先读 init, 暂停, 再继续读)
    const reader = response.body!.getReader();
    const rState = { buffer: "" };

    // 读取 init 事件获取 jobId
    const initEvents = await readEventsUntil(
      reader, rState,
      (e) => e.step === 0 && e.status === "done" && e.label === "init",
      30_000
    );
    expect(initEvents.length).toBeGreaterThanOrEqual(1);
    const initEvent = initEvents.find(
      (e) => e.step === 0 && e.status === "done" && e.label === "init"
    )!;
    expect(initEvent.jobId).toBeTruthy();
    const jobId = initEvent.jobId;

    // ===== 第二步: 发送暂停请求 (在 batch 循环期间) =====
    const pauseRes = await fetch(`http://localhost:${port}/api/review/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
      body: JSON.stringify({ jobId }),
    });
    expect(pauseRes.status).toBe(200);
    const pauseBody: any = await pauseRes.json();
    expect(pauseBody.success).toBe(true);

    // ===== 第三步: 继续读取 SSE 直到 paused 事件 =====
    const pausedEvents = await readEventsUntil(
      reader, rState,
      (e) => e.type === "paused",
      120_000
    );
    const pausedEvent = pausedEvents.find((e) => e.type === "paused");
    expect(pausedEvent).toBeDefined();
    expect(pausedEvent!.checkpointId).toBeTruthy();
    expect(pausedEvent!.progress).toBeDefined();

    const checkpointId = pausedEvent!.checkpointId;
    reader.cancel(); // 第一阶段 SSE 连接关闭

    // ===== 第四步: 验证暂停后的数据库状态 =====
    const { findReviewById } = await import(
      "../../src/server/services/review-store"
    );
    const { listSubReports } = await import(
      "../../src/server/services/review-sub-report-store"
    );
    const { findCheckpointById, listCheckpoints } = await import(
      "../../src/server/services/review-checkpoint-store"
    );
    const { findJobById } = await import(
      "../../src/server/services/review-job-store"
    );

    const cp = findCheckpointById(checkpointId);
    expect(cp).toBeDefined();
    expect(cp!.status).toBe("paused");
    expect(cp!.currentBatch).toBeGreaterThan(0);

    // 从 checkpoint 的 accumulatedStats 解析 reviewId
    let pausedReviewId = "";
    if (cp!.accumulatedStats) {
      const stats = JSON.parse(cp!.accumulatedStats);
      pausedReviewId = stats.reviewId || "";
    }

    // review 状态 = paused
    if (pausedReviewId) {
      const pr = findReviewById(pausedReviewId);
      expect(pr).toBeDefined();
      expect(pr!.status).toBe("paused");
    }

    // job 状态 = paused
    if (cp!.jobId) {
      const j = findJobById(cp!.jobId);
      expect(j).toBeDefined();
      expect(j!.status).toBe("paused");
    }

    // ===== 第五步: 恢复评审 (带 checkpointId) =====
    const resumeResponse = await fetch(
      `http://localhost:${port}/api/review/requirement`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify({
          productLine: PRODUCT_LINE,
          sourceBranch: SOURCE_BRANCH,
          targetBranch: TARGET_BRANCH,
          checkpointId,
        }),
      }
    );
    expect(resumeResponse.status).toBe(200);
    expect(resumeResponse.headers.get("content-type")).toContain("text/event-stream");

    // 收集 SSE 事件直到 COMPLETE
    const resumeEvents = await collectSSEUntil(
      resumeResponse,
      (e) => e.status === "done" && e.label === "COMPLETE",
      undefined,
      120_000
    );

    // ===== 第六步: 验证恢复后的 SSE 事件 =====
    // resumed 事件表示恢复成功
    expect(resumeEvents.some((e) => e.type === "resumed")).toBe(true);
    // 最终 COMPLETE
    const resumeComplete = resumeEvents.find(
      (e) => e.status === "done" && e.label === "COMPLETE"
    );
    expect(resumeComplete).toBeDefined();
    expect(resumeComplete!.detail).toBeTruthy();

    // ===== 第七步: 验证最终数据库状态 =====
    const finalCp = findCheckpointById(checkpointId);
    expect(finalCp).toBeDefined();
    // 恢复后存在 completed 的 checkpoint
    const completedCps = listCheckpoints({ status: "completed" });
    expect(completedCps.length).toBeGreaterThanOrEqual(1);

    // sub_reports 全部 completed
    const detail = JSON.parse(resumeComplete!.detail);
    if (detail.reviewId) {
      const subs = listSubReports(detail.reviewId);
      for (const sub of subs) {
        expect(sub.status).toBe("completed");
        expect(sub.report_json).toBeTruthy();
      }
    }
  });
});
