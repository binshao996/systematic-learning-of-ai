import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db/connection";
import { chatMessages } from "../db/schema";
import { eq } from "drizzle-orm";

export const feedbackRoute = new Hono()
  .post("/", zValidator("json", z.object({
    messageId: z.string(),
    rating: z.enum(["up", "down"]),
    comment: z.string().optional(),
  })), async (c) => {
    const { messageId, rating, comment } = c.req.valid("json");

    // Log the feedback (in production, store in DB or analytics)
    const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId));

    if (rating === "down") {
      console.log(`[FEEDBACK] Downvote on message ${messageId}: ${comment ?? "no comment"}`);
      console.log(`[FEEDBACK] Message content: ${msg?.content.slice(0, 200)}`);
    }

    return c.json({ success: true });
  });
