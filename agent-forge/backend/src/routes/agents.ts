import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db/connection";
import { agents, conversations, messages } from "../db/schema";
import { eq, and } from "drizzle-orm";
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
  isTemplate: z.boolean().optional(),
  category: z.string().optional(),
});

// GET /api/agents — user agents only (not templates)
agentsRoute.get("/", async (c) => {
  const result = await db.select().from(agents)
    .where(eq(agents.isTemplate, false))
    .orderBy(agents.updatedAt);
  return c.json(result);
});

// GET /api/agents/templates — template marketplace
agentsRoute.get("/templates", async (c) => {
  const category = c.req.query("category");
  const result = category
    ? await db.select().from(agents).where(
        and(eq(agents.isTemplate, true), eq(agents.category, category))
      ).orderBy(agents.name)
    : await db.select().from(agents).where(eq(agents.isTemplate, true)).orderBy(agents.name);
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
    isTemplate: body.isTemplate ?? false,
    category: body.category || null,
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
  const { message, conversationId } = await c.req.json() as { message: string; conversationId?: string };

  const stream = new ReadableStream({
    start(controller) {
      runAgent(agentId, message, controller, conversationId);
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

// Conversation routes
agentsRoute.get("/:id/conversations", async (c) => {
  const agentId = c.req.param("id");
  const result = await db.select().from(conversations)
    .where(eq(conversations.agentId, agentId))
    .orderBy(conversations.updatedAt);
  return c.json(result);
});

agentsRoute.get("/:id/conversations/:convId/messages", async (c) => {
  const result = await db.select().from(messages)
    .where(eq(messages.conversationId, c.req.param("convId")))
    .orderBy(messages.createdAt);
  return c.json(result);
});
