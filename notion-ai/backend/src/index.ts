import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env";

const app = new Hono();
app.use("*", cors());

app.get("/api/health", (c) => c.json({ status: "ok" }));

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`Server running on http://localhost:${env.PORT}`);
