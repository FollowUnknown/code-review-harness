import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRequired } from "./middleware/auth";
import authRouter from "./routes/auth";
import reviewRouter from "./routes/review";
import usersRouter from "./routes/users";
import llmRouter from "./llm/router";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.use(cors());
app.use(express.json());

// Auth routes — no authentication required
app.use("/api/auth", authRouter);

// Everything below requires authentication
app.use(authRequired);
app.use("/api", reviewRouter);
app.use("/api/users", usersRouter);
app.use("/api/llm", llmRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
