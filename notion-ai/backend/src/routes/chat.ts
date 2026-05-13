import { Hono } from "hono";
import { ragQuery } from "../services/rag/engine";
import { deepseekChat } from "../services/deepseek/client";
import { db } from "../db/connection";
import { chatSessions, chatMessages } from "../db/schema";
import { eq } from "drizzle-orm";

const WRITING_ACTIONS = [
  "continue", "rewrite", "translate-zh", "translate-en",
  "summarize", "improve", "longer", "shorter", "tone",
];

function isWritingAction(message: string): boolean {
  const match = message.match(/^\[([^\]]+)\]/);
  return match ? WRITING_ACTIONS.includes(match[1]) : false;
}

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

    // Writing actions skip RAG — no citation markers needed
    const stream = isWritingAction(message)
      ? await deepseekChat(
          [
            { role: "system", content: "You are a helpful writing assistant. Provide only the writing result without any citation markers or metadata." },
            { role: "user", content: message },
          ],
          { stream: true, temperature: 0.3 },
        )
      : await ragQuery(message, { docId });

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
