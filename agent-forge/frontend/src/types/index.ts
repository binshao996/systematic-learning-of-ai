export interface Agent {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  toolIds: string[];
  isTemplate: boolean;
  category: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Tool {
  id: string;
  name: string;
  displayName: string;
  description: string;
  type: "builtin" | "custom";
  inputSchema: Record<string, unknown>;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

export interface WorkflowNode {
  id: string;
  type: "start" | "end" | "agent" | "code" | "human_input";
  agentId?: string;
  label: string;
  position: { x: number; y: number };
  config?: Record<string, unknown>;
  content?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

export type RunStatus = "pending" | "running" | "completed" | "failed";

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

export interface TraceEvent {
  step: number;
  type: SSEEventType;
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
}

export interface Run {
  id: string;
  workflowId: string;
  status: RunStatus;
  input: string;
  output: string | null;
  traceEvents: TraceEvent[];
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}
