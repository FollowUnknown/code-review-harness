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
import llmRouter from "./llm/router";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

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
app.use("/api/llm", llmRouter);

// SPA fallback for client-side routing (must be last)
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "dist/client/index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
