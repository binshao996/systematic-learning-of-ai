import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db/connection";
import { workflows } from "../db/schema";
import { eq } from "drizzle-orm";
import { runWorkflow, WorkflowRow } from "../services/workflow/runner";

export const workflowsRoute = new Hono();

const nodeSchema = z.object({
  id: z.string(),
  type: z.enum(["start", "end", "agent", "code"]),
  agentId: z.string().optional(),
  label: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.string(), z.unknown()).optional(),
  content: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
});

const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
});

const workflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

workflowsRoute.get("/", async (c) => {
  const result = await db.select().from(workflows).orderBy(workflows.updatedAt);
  return c.json(result);
});

workflowsRoute.get("/:id", async (c) => {
  const result = await db.select().from(workflows).where(eq(workflows.id, c.req.param("id")));
  if (result.length === 0) return c.json({ error: "Workflow not found" }, 404);
  return c.json(result[0]);
});

workflowsRoute.post("/", zValidator("json", workflowSchema), async (c) => {
  const body = c.req.valid("json");
  const [wf] = await db.insert(workflows).values({
    name: body.name,
    description: body.description || null,
    nodes: body.nodes,
    edges: body.edges,
  }).returning();
  return c.json(wf, 201);
});

workflowsRoute.patch("/:id", zValidator("json", workflowSchema.partial()), async (c) => {
  const id = c.req.param("id");
  const existing = await db.select().from(workflows).where(eq(workflows.id, id));
  if (existing.length === 0) return c.json({ error: "Workflow not found" }, 404);

  const body = c.req.valid("json");
  const [updated] = await db.update(workflows)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(workflows.id, id))
    .returning();
  return c.json(updated);
});

workflowsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await db.select().from(workflows).where(eq(workflows.id, id));
  if (existing.length === 0) return c.json({ error: "Workflow not found" }, 404);

  await db.delete(workflows).where(eq(workflows.id, id));
  return c.json({ success: true });
});

workflowsRoute.post("/:id/run", async (c) => {
  const wfId = c.req.param("id");
  const { input } = await c.req.json() as { input: string };

  const [wf] = await db.select().from(workflows).where(eq(workflows.id, wfId));
  if (!wf) return c.json({ error: "Workflow not found" }, 404);

  const stream = new ReadableStream({
    start(controller) {
      runWorkflow(wf as WorkflowRow, input, controller);
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
