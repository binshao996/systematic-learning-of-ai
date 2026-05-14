import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db/connection";
import { agents } from "../db/schema";
import { eq } from "drizzle-orm";
import { runAgent } from "../services/agent/runtime";

export const agentsRoute = new Hono();

const agentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  systemPrompt: z.string().min(1),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
  toolIds: z.array(z.string()).optional(),
});

agentsRoute.get("/", async (c) => {
  const result = await db.select().from(agents).orderBy(agents.updatedAt);
  return c.json(result);
});

agentsRoute.get("/:id", async (c) => {
  const result = await db.select().from(agents).where(eq(agents.id, c.req.param("id")));
  if (result.length === 0) return c.json({ error: "Agent not found" }, 404);
  return c.json(result[0]);
});

agentsRoute.post("/", zValidator("json", agentSchema), async (c) => {
  const body = c.req.valid("json");
  const [agent] = await db.insert(agents).values({
    name: body.name,
    description: body.description || null,
    systemPrompt: body.systemPrompt,
    model: body.model || "deepseek-chat",
    temperature: body.temperature ?? 0.3,
    maxTokens: body.maxTokens ?? 2048,
    toolIds: body.toolIds || [],
  }).returning();
  return c.json(agent, 201);
});

agentsRoute.patch("/:id", zValidator("json", agentSchema.partial()), async (c) => {
  const id = c.req.param("id");
  const existing = await db.select().from(agents).where(eq(agents.id, id));
  if (existing.length === 0) return c.json({ error: "Agent not found" }, 404);

  const body = c.req.valid("json");
  const [updated] = await db.update(agents)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(agents.id, id))
    .returning();
  return c.json(updated);
});

agentsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await db.select().from(agents).where(eq(agents.id, id));
  if (existing.length === 0) return c.json({ error: "Agent not found" }, 404);

  await db.delete(agents).where(eq(agents.id, id));
  return c.json({ success: true });
});

agentsRoute.post("/:id/run", async (c) => {
  const agentId = c.req.param("id");
  const { message } = await c.req.json() as { message: string };

  const stream = new ReadableStream({
    start(controller) {
      runAgent(agentId, message, controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
