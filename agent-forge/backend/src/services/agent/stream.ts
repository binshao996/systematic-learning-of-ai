export type SSEEventType =
  | "agent_start"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "agent_output"
  | "node_start"
  | "node_output"
  | "error"
  | "done";

export interface SSEEvent {
  type: SSEEventType;
  step: number;
  content?: string;
  agentId?: string;
  agentName?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  latencyMs?: number;
  tokenUsage?: { prompt: number; completion: number };
}

export function emitSSE(controller: ReadableStreamDefaultController, event: SSEEvent) {
  try {
    const data = JSON.stringify(event);
    controller.enqueue(new TextEncoder().encode(`event: ${event.type}\ndata: ${data}\n\n`));
  } catch {
    // Controller already closed (client disconnect / timeout) — ignore
  }
}
