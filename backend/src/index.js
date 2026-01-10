// backend/src/index.js
import express from "express";
import cors from "cors";
import { env } from "./config/env.js";

import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { formsRouter } from "./routes/forms.js";
import { submissionsRouter } from "./routes/submissions.js"; // ✅ add this

import { notFound, errorHandler } from "./middleware/errors.js";

const app = express();

app.use(
  cors({
    origin:
      env.corsOrigin === "*"
        ? true
        : env.corsOrigin.split(",").map((s) => s.trim()),
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

// Register routers
app.use("/api", healthRouter);
app.use("/api", authRouter);
app.use("/api", meRouter);
app.use("/api", formsRouter);
app.use("/api", submissionsRouter); // ✅ add this

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`GHGI API (M0-M1) listening on http://localhost:${env.port}`);
});
