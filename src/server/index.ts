import "dotenv/config";
import express from "express";
import cors from "cors";
import reviewRouter from "./routes/review";
import settingsRouter from "./routes/settings";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.use(cors());
app.use(express.json());

app.use("/api", reviewRouter);
app.use("/api/settings", settingsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
