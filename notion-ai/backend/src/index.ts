import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env";
import { documentsRoute } from "./routes/documents";

const app = new Hono();
app.use("*", cors());

app.get("/api/health", (c) => c.json({ status: "ok" }));
app.route("/api/documents", documentsRoute);

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`Server running on http://localhost:${env.PORT}`);
