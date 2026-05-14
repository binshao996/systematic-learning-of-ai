import { chatCompletion, ChatMessage, ToolDefinition } from "../llm/client";
import { executeTool } from "../tools/execute";
import { SSEEvent, emitSSE } from "./stream";
import { db } from "../../db/connection";
import { agents, tools, conversations, messages } from "../../db/schema";
import { eq, asc } from "drizzle-orm";

export async function runAgent(
  agentId: string,
  userInput: string,
  controller: ReadableStreamDefaultController,
  conversationId?: string,
) {
  const startTime = Date.now();
  let step = 0;

  // Load agent config
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!agent) {
    emitSSE(controller, { type: "error", step: 0, content: "Agent not found" });
    emitSSE(controller, { type: "done", step: 0 });
    controller.close();
    return;
  }

  emitSSE(controller, {
    type: "agent_start",
    step,
    agentId: agent.id,
    agentName: agent.name,
  });

  // Load tool definitions for this agent
  const toolIds = agent.toolIds as string[];
  let toolDefs: ToolDefinition[] = [];
  if (toolIds.length > 0) {
    const allTools = await db.select().from(tools);
    const enabledTools = allTools.filter((t) => toolIds.includes(t.id) && t.enabled);
    toolDefs = enabledTools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as Record<string, unknown>,
      },
    }));
  }

  // Create or load conversation
  let convId = conversationId;
  if (!convId) {
    const [conv] = await db.insert(conversations).values({
      agentId,
      title: userInput.slice(0, 80),
    }).returning();
    convId = conv.id;
  }

  // Load previous messages for context
  const historyMessages: ChatMessage[] = [];
  if (conversationId) {
    const prevMessages = await db.select().from(messages)
      .where(eq(messages.conversationId, convId!))
      .orderBy(asc(messages.createdAt));

    for (const msg of prevMessages) {
      if (msg.role === "user") {
        historyMessages.push({ role: "user", content: msg.content || "" });
      } else if (msg.role === "assistant") {
        historyMessages.push({
          role: "assistant",
          content: msg.content || "",
          tool_calls: msg.toolCalls as ChatMessage["tool_calls"],
        });
      } else if (msg.role === "tool") {
        historyMessages.push({
          role: "tool",
          content: msg.content || "",
          tool_call_id: msg.toolCallId || "",
        });
      }
    }
  }

  // Save user message
  await db.insert(messages).values({
    conversationId: convId!,
    role: "user",
    content: userInput,
  });

  const messages_arr: ChatMessage[] = [
    { role: "system", content: agent.systemPrompt },
    ...historyMessages,
    { role: "user", content: userInput },
  ];

  let totalPrompt = 0;
  let totalCompletion = 0;

  try {
    for (let iteration = 0; iteration < 10; iteration++) {
      step++;

      const response = await chatCompletion(messages_arr, toolDefs, {
        temperature: agent.temperature ?? undefined,
        maxTokens: agent.maxTokens ?? undefined,
      });

      // Track approximate token usage
      totalPrompt += JSON.stringify(messages_arr).length / 4;
      totalCompletion += (response.content || "").length / 4;

      // Emit thinking event
      if (response.content) {
        emitSSE(controller, {
          type: "thinking",
          step,
          content: response.content,
          agentId: agent.id,
          agentName: agent.name,
        });
      }

      // Handle tool calls
      if (response.tool_calls?.length) {
        messages_arr.push({
          role: "assistant",
          content: response.content || "",
          tool_calls: response.tool_calls,
        });

        // Save assistant message
        await db.insert(messages).values({
          conversationId: convId!,
          role: "assistant",
          content: response.content || "",
          toolCalls: response.tool_calls,
        });

        for (const tc of response.tool_calls) {
          const toolStart = Date.now();
          emitSSE(controller, {
            type: "tool_call",
            step,
            toolName: tc.function.name,
            toolInput: tc.function.arguments,
            agentId: agent.id,
            agentName: agent.name,
          });

          const result = await executeTool(tc.function.name, tc.function.arguments);
          const latency = Date.now() - toolStart;

          emitSSE(controller, {
            type: "tool_result",
            step,
            toolName: tc.function.name,
            toolOutput: result,
            latencyMs: latency,
            agentId: agent.id,
            agentName: agent.name,
          });

          messages_arr.push({
            role: "tool",
            content: result,
            tool_call_id: tc.id,
          });

          // Save tool message
          await db.insert(messages).values({
            conversationId: convId!,
            role: "tool",
            content: result,
            toolCallId: tc.id,
          });
        }
      } else {
        // No tool calls — final answer
        emitSSE(controller, {
          type: "agent_output",
          step,
          content: response.content || "",
          agentId: agent.id,
          agentName: agent.name,
          tokenUsage: {
            prompt: Math.round(totalPrompt),
            completion: Math.round(totalCompletion),
          },
        });

        // Save final assistant message
        await db.insert(messages).values({
          conversationId: convId!,
          role: "assistant",
          content: response.content || "",
        });

        // Update conversation title from first exchange
        if (!conversationId) {
          await db.update(conversations)
            .set({ updatedAt: new Date() })
            .where(eq(conversations.id, convId!));
        }
        break;
      }
    }

    emitSSE(controller, { type: "done", step, latencyMs: Date.now() - startTime });
  } catch (err) {
    emitSSE(controller, {
      type: "error",
      step,
      content: err instanceof Error ? err.message : "Agent execution failed",
    });
    emitSSE(controller, { type: "done", step });
  } finally {
    try { controller.close(); } catch { /* already closed by timeout */ }
  }
}
