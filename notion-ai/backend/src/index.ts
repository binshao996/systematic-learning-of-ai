import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env";
import { documentsRoute } from "./routes/documents";
import { uploadRoute } from "./routes/upload";
import { chatRoute } from "./routes/chat";
import { searchRoute } from "./routes/search";
import { feedbackRoute } from "./routes/feedback";

const app = new Hono();
app.use("*", cors());

app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: err.message, stack: err.stack }, 500);
});

app.get("/api/health", (c) => c.json({ status: "ok" }));
app.route("/api/documents", documentsRoute);
app.route("/api/upload", uploadRoute);
app.route("/api/chat", chatRoute);
app.route("/api/search", searchRoute);
app.route("/api/feedback", feedbackRoute);

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`Server running on http://localhost:${env.PORT}`);
