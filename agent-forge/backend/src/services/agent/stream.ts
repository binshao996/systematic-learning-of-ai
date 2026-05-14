export type SSEEventType =
  | "agent_start"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "agent_output"
  | "node_start"
  | "node_output"
  | "error"
  | "done"
  | "parallel_start"
  | "parallel_end"
  | "human_input_required";

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
  branchId?: string;
  branchCount?: number;
  prompt?: string;
  inputType?: string;
  runId?: string;
}

export function emitSSE(controller: ReadableStreamDefaultController, event: SSEEvent) {
  try {
    const data = JSON.stringify(event);
    controller.enqueue(new TextEncoder().encode(`event: ${event.type}\ndata: ${data}\n\n`));
  } catch {
    // Controller already closed (client disconnect / timeout) — ignore
  }
}
