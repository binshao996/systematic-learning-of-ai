import { Hono } from "hono";
import { ragQuery } from "../services/rag/engine";
import { db } from "../db/connection";
import { chatSessions, chatMessages } from "../db/schema";
import { eq } from "drizzle-orm";

export const chatRoute = new Hono()
  .post("/", async (c) => {
    const { message, docId, sessionId } = await c.req.json() as {
      message: string;
      docId?: string;
      sessionId?: string;
    };

    let sid = sessionId;
    if (!sid) {
      const [session] = await db.insert(chatSessions).values({
        docId: docId ?? null,
        title: message.slice(0, 100),
      }).returning();
      sid = session.id;
    }

    await db.insert(chatMessages).values({
      sessionId: sid,
      role: "user",
      content: message,
    });

    const stream = await ragQuery(message, { docId });

    return new Response(stream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  })
  .get("/sessions/:docId", async (c) => {
    const docId = c.req.param("docId");
    const sessions = await db.select()
      .from(chatSessions)
      .where(eq(chatSessions.docId, docId));
    return c.json(sessions);
  })
  .get("/messages/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const messages = await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId));
    return c.json(messages);
  });
