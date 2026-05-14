import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { authRequired } from "./middleware/auth";
import authRouter from "./routes/auth";
import reviewRouter from "./routes/review";
import reviewsRouter from "./routes/reviews";
import plansRouter from "./routes/plans";
import usersRouter from "./routes/users";
import knowledgeRouter from "./routes/knowledge";
import dimensionsRouter from "./routes/dimensions";
import qualityRouter from "./routes/quality";
import memoryRouter from "./routes/memory";
import reviewDiffRouter from "./routes/review-diff";
import reviewPreviewRouter from "./routes/review-preview";
import reviewRequirementRouter from "./routes/review-requirement";
import reviewCheckpointRouter from "./routes/review-checkpoint-routes";
import productLinesRouter from "./routes/product-lines";
import { resetStuckJobs } from "./services/review-job-store";
import repoMappingRouter from "./routes/repo-mapping";
import llmRouter from "./llm/router";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3006;

app.use(cors());
app.use(express.json());

// Static files + SPA fallback (before auth, so assets load without token)
app.use(express.static(path.join(process.cwd(), "dist/client")));

// Auth routes — no authentication required
app.use("/api/auth", authRouter);

// Everything below requires authentication
app.use(authRequired);
app.use("/api", reviewRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/plans", plansRouter);
app.use("/api/users", usersRouter);
app.use("/api/knowledge", knowledgeRouter);
app.use("/api/dimension-sets", dimensionsRouter);
app.use("/api/quality", qualityRouter);
app.use("/api/memory", memoryRouter);
app.use("/api/review", reviewDiffRouter);
app.use("/api/review", reviewPreviewRouter);
app.use("/api/review", reviewRequirementRouter);
app.use("/api/review", reviewCheckpointRouter);
app.use("/api/repo-mappings", repoMappingRouter);
app.use("/api/product-lines", productLinesRouter);
app.use("/api/llm", llmRouter);

// SPA fallback for client-side routing (must be last)
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "dist/client/index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  const resetCount = resetStuckJobs();
  if (resetCount > 0) {
    console.log(`Reset ${resetCount} stuck review jobs`);
  }
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\n端口 ${PORT} 已被占用，请先释放该端口或更换端口：`);
    console.error(`  方式一：修改 .env 中的 PORT 值`);
    console.error(`  方式二：运行 PORT=3002 npm start 指定其他端口`);
    console.error(`  方式三：lsof -i :${PORT} 查找并终止占用进程\n`);
    process.exit(1);
  }
  // 启动阶段致命错误（如 EACCES 权限不足），输出原始错误后退出
  console.error("服务器启动失败:", error.message);
  process.exit(1);
});
