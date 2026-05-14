import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { db } from "../../db/connection";
import { agents, tools, runs } from "../../db/schema";
import { eq } from "drizzle-orm";
import { chatCompletion, ChatMessage, ToolDefinition } from "../llm/client";
import { executeTool } from "../tools/execute";
import { emitSSE, SSEEvent } from "../agent/stream";

export interface WorkflowRow {
  id: string;
  name: string;
  nodes: WorkflowNodeData[];
  edges: WorkflowEdgeData[];
}

export interface WorkflowNodeData {
  id: string;
  type: "start" | "end" | "agent" | "code";
  agentId?: string;
  label: string;
  position: { x: number; y: number };
  config?: Record<string, unknown>;
  content?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface WorkflowEdgeData {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: Record<string, unknown>;
}

interface AgentRunState {
  input: string;
  agentOutputs: Record<string, string>;
  executionLog: Array<{ nodeId: string; agentName: string; output: string }>;
}

const WorkflowState = Annotation.Root({
  input: Annotation<string>,
  agentOutputs: Annotation<Record<string, string>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  executionLog: Annotation<Array<{ nodeId: string; agentName: string; output: string }>>({
    reducer: (current, update) => [...current, ...update],
    default: () => ([]),
  }),
});

async function createAgentNodeFn(nodeId: string, agentId: string, agentName: string) {
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  // Load tools
  const toolIds = agent.toolIds as string[];
  const allTools = await db.select().from(tools);
  const agentTools = allTools.filter((t) => toolIds.includes(t.id) && t.enabled);
  const toolDefs: ToolDefinition[] = agentTools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));

  return async (state: typeof WorkflowState.State) => {
    // Build input from previous agent outputs or original input
    const prevOutputs = state.agentOutputs;
    const contextParts: string[] = [];

    if (Object.keys(prevOutputs).length > 0) {
      contextParts.push("Previous agent outputs:");
      for (const [nid, output] of Object.entries(prevOutputs)) {
        contextParts.push(`[${nid}]: ${output}`);
      }
    }

    const userMessage = contextParts.length > 0
      ? `${contextParts.join("\n")}\n\nUser task: ${state.input}`
      : state.input;

    const messages: ChatMessage[] = [
      { role: "system", content: agent.systemPrompt },
      { role: "user", content: userMessage },
    ];

    let finalOutput = "";

    for (let iter = 0; iter < 10; iter++) {
      const response = await chatCompletion(messages, toolDefs.length > 0 ? toolDefs : undefined, {
        temperature: agent.temperature ?? undefined,
        maxTokens: agent.maxTokens ?? undefined,
      });

      if (response.tool_calls?.length) {
        messages.push({
          role: "assistant",
          content: response.content || "",
          tool_calls: response.tool_calls,
        });

        for (const tc of response.tool_calls) {
          const result = await executeTool(tc.function.name, tc.function.arguments);
          messages.push({ role: "tool", content: result, tool_call_id: tc.id });
        }
      } else {
        finalOutput = response.content || "";
        break;
      }
    }

    return {
      agentOutputs: { [nodeId]: finalOutput },
      executionLog: [{ nodeId, agentName, output: finalOutput }],
    };
  };
}

function evaluateCondition(output: string, condition: Record<string, unknown>): boolean {
  const keyword = condition.keyword as string;
  if (!keyword) return true;
  return output.toLowerCase().includes(keyword.toLowerCase());
}

export async function runWorkflow(
  wf: WorkflowRow,
  input: string,
  controller: ReadableStreamDefaultController,
) {
  // Create run record
  const [run] = await db.insert(runs).values({
    workflowId: wf.id,
    status: "running",
    input,
    startedAt: new Date(),
    traceEvents: [],
  }).returning();
  const runId = run.id;

  const allEvents: Array<Record<string, unknown>> = [];

  const logEvent = (event: Record<string, unknown> | SSEEvent) => {
    allEvents.push(event as Record<string, unknown>);
    db.update(runs).set({ traceEvents: allEvents }).where(eq(runs.id, runId)).execute().catch(() => {});
  };

  try {
    const nodes = wf.nodes as WorkflowNodeData[];
    const edges = wf.edges as WorkflowEdgeData[];

    if (nodes.length === 0) {
      emitSSE(controller, { type: "error", step: 0, content: "Workflow has no nodes" });
      emitSSE(controller, { type: "done", step: 0 });
      controller.close();
      return;
    }

    // Build graph (cast to any for dynamic node names)
    const graph = new StateGraph(WorkflowState) as any;

    // Create node functions for each workflow node
    for (const node of nodes) {
      if (node.type === "start") {
        graph.addNode(node.id, (state: typeof WorkflowState.State) => {
          const output = state.input;
          const step = state.executionLog.length + 1;
          const evt: SSEEvent = { type: "node_start", step, agentId: node.id, agentName: node.label };
          emitSSE(controller, evt);
          logEvent(evt);
          const outEvt: SSEEvent = { type: "node_output", step, agentId: node.id, agentName: node.label, content: output };
          emitSSE(controller, outEvt);
          logEvent(outEvt);
          return {
            agentOutputs: { [node.id]: output },
            executionLog: [{ nodeId: node.id, agentName: node.label, output }],
          };
        });
      } else if (node.type === "end") {
        graph.addNode(node.id, (state: typeof WorkflowState.State) => {
          const output = Object.values(state.agentOutputs).join("\n\n") || state.input;
          const step = state.executionLog.length + 1;
          const evt: SSEEvent = { type: "node_output", step, agentId: node.id, agentName: node.label, content: output };
          emitSSE(controller, evt);
          logEvent(evt);
          return {
            agentOutputs: { [node.id]: output },
            executionLog: [{ nodeId: node.id, agentName: node.label, output }],
          };
        });
      } else if (node.type === "code") {
        graph.addNode(node.id, async (state: typeof WorkflowState.State) => {
          const step = state.executionLog.length + 1;
          emitSSE(controller, { type: "node_start", step, agentId: node.id, agentName: node.label } as SSEEvent);
          let output = "";
          try {
            const fn = new Function("state", node.content || "return state.input");
            const raw = fn({ ...state });
            output = typeof raw === "string" ? raw : JSON.stringify(raw);
          } catch (err) {
            output = `Code error: ${err instanceof Error ? err.message : String(err)}`;
            emitSSE(controller, { type: "error", step, content: output });
          }
          emitSSE(controller, { type: "node_output", step, agentId: node.id, agentName: node.label, content: output } as SSEEvent);
          return {
            agentOutputs: { [node.id]: output },
            executionLog: [{ nodeId: node.id, agentName: node.label, output }],
          };
        });
      } else {
        // agent node
        const agentId = node.agentId || "";
        const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
        if (!agent) {
          emitSSE(controller, { type: "error", step: 0, content: `Agent ${agentId} not found` });
          emitSSE(controller, { type: "done", step: 0 });
          controller.close();
          return;
        }

        const nodeFn = await createAgentNodeFn(node.id, agentId, agent.name);

        graph.addNode(node.id, async (state: typeof WorkflowState.State) => {
          const startEvent: SSEEvent = {
            type: "agent_start",
            step: state.executionLog.length + 1,
            agentId: agentId,
            agentName: agent.name,
          };
          emitSSE(controller, startEvent);
          logEvent(startEvent);

          const result = await nodeFn(state);

          const outputEvent: SSEEvent = {
            type: "agent_output",
            step: state.executionLog.length + 1,
            agentId: agentId,
            agentName: agent.name,
            content: result.agentOutputs[node.id],
          };
          emitSSE(controller, outputEvent);
          logEvent(outputEvent);

          return result;
        });
      }
    }

    // Add edges
    const incomingCount = new Map<string, number>();
    const outgoingEdges = new Map<string, WorkflowEdgeData[]>();

    for (const edge of edges) {
      incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
      const out = outgoingEdges.get(edge.source) || [];
      out.push(edge);
      outgoingEdges.set(edge.source, out);
    }

    // Find entry nodes (no incoming edges from other nodes)
    const entryNodes = nodes.filter((n) => !incomingCount.has(n.id));
    const hasOutgoing = new Set<string>();

    for (const edge of edges) {
      hasOutgoing.add(edge.source);
    }

    // Connect entry nodes from START
    if (entryNodes.length === 1) {
      graph.addEdge(START, entryNodes[0].id);
    } else if (entryNodes.length > 1) {
      for (const n of entryNodes) {
        graph.addEdge(START, n.id);
      }
    }

    // Process edges — conditional routing first, then regular
    const nodeHasConditional = new Set<string>();
    for (const node of nodes) {
      const outEdges = outgoingEdges.get(node.id) || [];
      const conditionalEdges = outEdges.filter((e) => e.condition && Object.keys(e.condition).length > 0);

      if (conditionalEdges.length > 0) {
        nodeHasConditional.add(node.id);
        const destinations = conditionalEdges.map((e) => e.target);
        graph.addConditionalEdges(node.id, (state: typeof WorkflowState.State) => {
          const nodeOutput = state.agentOutputs[node.id] || "";
          for (const edge of conditionalEdges) {
            if (edge.condition && evaluateCondition(nodeOutput, edge.condition)) {
              return edge.target;
            }
          }
          return END as unknown as string;
        }, [...destinations, END as unknown as string]);
      }

      const regularEdges = outEdges.filter((e) => !e.condition || Object.keys(e.condition).length === 0);
      for (const edge of regularEdges) {
        graph.addEdge(edge.source, edge.target);
      }
    }

    // Connect nodes without outgoing edges to END
    for (const node of nodes) {
      if (!hasOutgoing.has(node.id) && !nodeHasConditional.has(node.id)) {
        graph.addEdge(node.id, END);
      }
    }

    // Compile and run
    const compiled = graph.compile();
    const result = await compiled.invoke({ input, agentOutputs: {}, executionLog: [] });

    // Persist successful run
    const finalOutput = result.agentOutputs
      ? Object.values(result.agentOutputs as Record<string, string>).join("\n\n")
      : "";
    await db.update(runs).set({
      status: "completed",
      output: finalOutput,
      traceEvents: allEvents,
      completedAt: new Date(),
    }).where(eq(runs.id, runId));

    emitSSE(controller, { type: "done", step: nodes.length });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Workflow execution failed";
    logEvent({ type: "error", content: errorMsg });

    await db.update(runs).set({
      status: "failed",
      output: errorMsg,
      traceEvents: allEvents,
      completedAt: new Date(),
    }).where(eq(runs.id, runId)).catch(() => {});

    emitSSE(controller, {
      type: "error",
      step: 0,
      content: errorMsg,
    });
    emitSSE(controller, { type: "done", step: 0 });
  } finally {
    try { controller.close(); } catch { /* already closed */ }
  }
}
