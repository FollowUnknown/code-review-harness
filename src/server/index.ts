import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRequired } from "./middleware/auth";
import authRouter from "./routes/auth";
import reviewRouter from "./routes/review";
import settingsRouter from "./routes/settings";
import usersRouter from "./routes/users";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.use(cors());
app.use(express.json());

// Auth routes — no authentication required
app.use("/api/auth", authRouter);

// Everything below requires authentication
app.use(authRequired);
app.use("/api", reviewRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/users", usersRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
