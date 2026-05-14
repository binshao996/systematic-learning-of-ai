import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env";
import { agentsRoute } from "./routes/agents";
import { toolsRoute } from "./routes/tools";
import { workflowsRoute } from "./routes/workflows";
import { runsRoute } from "./routes/runs";
import { seedBuiltinTools, seedTemplateAgents } from "./services/tools/registry";

const app = new Hono();
app.use("*", cors());

app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json({ error: err.message }, 500);
});

app.get("/api/health", (c) => c.json({ status: "ok" }));
app.route("/api/agents", agentsRoute);
app.route("/api/tools", toolsRoute);
app.route("/api/workflows", workflowsRoute);
app.route("/api/runs", runsRoute);

seedBuiltinTools().catch((err) => console.error("Seed tools failed:", err));
seedTemplateAgents().catch((err) => console.error("Seed templates failed:", err));

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
  idleTimeout: 120,
});

console.log(`AgentForge server running on http://localhost:${env.PORT}`);
