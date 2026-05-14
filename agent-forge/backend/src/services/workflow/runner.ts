import { StateGraph, Annotation, START, END, interrupt, Command, MemorySaver } from "@langchain/langgraph";
import { db } from "../../db/connection";
import { agents, tools, runs, workflows } from "../../db/schema";
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
  type: "start" | "end" | "agent" | "code" | "human_input";
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

// Module-level checkpointer for cross-request human-in-the-loop state
const checkpointer = new MemorySaver();

export async function resumeRun(
  runId: string,
  humanResponse: string,
  controller: ReadableStreamDefaultController,
) {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) {
    emitSSE(controller, { type: "error", step: 0, content: "Run not found" });
    emitSSE(controller, { type: "done", step: 0 });
    controller.close();
    return;
  }

  const [wf] = await db.select().from(workflows).where(eq(workflows.id, run.workflowId!));
  if (!wf) {
    emitSSE(controller, { type: "error", step: 0, content: "Workflow not found" });
    emitSSE(controller, { type: "done", step: 0 });
    controller.close();
    return;
  }

  const allEvents: Array<Record<string, unknown>> = (run.traceEvents as Array<Record<string, unknown>>) || [];

  const logEvent = (event: Record<string, unknown> | SSEEvent) => {
    allEvents.push(event as Record<string, unknown>);
    db.update(runs).set({ traceEvents: allEvents }).where(eq(runs.id, runId)).execute().catch(() => {});
  };

  try {
    await db.update(runs).set({ status: "running" }).where(eq(runs.id, runId));

    const nodes = wf.nodes as WorkflowNodeData[];
    const edges = wf.edges as WorkflowEdgeData[];

    const graph = new StateGraph(WorkflowState) as any;
    buildGraph(graph, nodes, edges, controller, logEvent, runId);

    const compiled = graph.compile({ checkpointer });
    const resumeCmd = new Command({ resume: humanResponse });

    const result = await compiled.invoke(resumeCmd, {
      configurable: { thread_id: runId },
    });

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
  } catch (err: any) {
    if (err?.name === "GraphInterrupt") {
      await db.update(runs).set({
        status: "awaiting_input",
        traceEvents: allEvents,
      }).where(eq(runs.id, runId));
      emitSSE(controller, { type: "done", step: 0 });
    } else {
      const errorMsg = err instanceof Error ? err.message : "Workflow execution failed";
      await db.update(runs).set({
        status: "failed",
        output: errorMsg,
        traceEvents: allEvents,
        completedAt: new Date(),
      }).where(eq(runs.id, runId)).catch(() => {});
      emitSSE(controller, { type: "error", step: 0, content: errorMsg });
      emitSSE(controller, { type: "done", step: 0 });
    }
  } finally {
    try { controller.close(); } catch { /* already closed */ }
  }
}

function buildGraph(
  graph: any,
  nodes: WorkflowNodeData[],
  edges: WorkflowEdgeData[],
  controller: ReadableStreamDefaultController,
  logEvent: (e: Record<string, unknown> | SSEEvent) => void,
  runId?: string,
) {
  if (nodes.length === 0) return;

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
    } else if (node.type === "human_input") {
      graph.addNode(node.id, (state: typeof WorkflowState.State) => {
        const step = state.executionLog.length + 1;
        const prompt = node.content || "Please provide input";
        const inputType = (node.config?.inputType as string) || "text";
        const evt: SSEEvent = {
          type: "human_input_required",
          step,
          agentId: node.id,
          agentName: node.label,
          prompt,
          inputType,
          runId,
        };
        emitSSE(controller, evt);
        logEvent(evt);

        const humanResponse = interrupt({ type: "human_input", nodeId: node.id, prompt, inputType });
        const responseText = typeof humanResponse === "string" ? humanResponse : JSON.stringify(humanResponse);

        const outEvt: SSEEvent = {
          type: "node_output",
          step: step + 1,
          agentId: node.id,
          agentName: node.label,
          content: responseText,
        };
        emitSSE(controller, outEvt);
        logEvent(outEvt);
        return {
          agentOutputs: { [node.id]: responseText },
          executionLog: [{ nodeId: node.id, agentName: node.label, output: responseText }],
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
      // agent node — load dynamically
      const agentId = node.agentId || "";
      graph.addNode(node.id, async (state: typeof WorkflowState.State) => {
        const [agent] = await db.select().from(agents).where(eq(agents.id, agentId));
        if (!agent) throw new Error(`Agent ${agentId} not found`);

        const startEvent: SSEEvent = {
          type: "agent_start",
          step: state.executionLog.length + 1,
          agentId,
          agentName: agent.name,
        };
        emitSSE(controller, startEvent);
        logEvent(startEvent);

        const nodeFn = await createAgentNodeFn(node.id, agentId, agent.name);
        const result = await nodeFn(state);

        const outputEvent: SSEEvent = {
          type: "agent_output",
          step: state.executionLog.length + 1,
          agentId,
          agentName: agent.name,
          content: result.agentOutputs[node.id],
        };
        emitSSE(controller, outputEvent);
        logEvent(outputEvent);

        return result;
      });
    }
  }

  // Add edges — entry/exit detection
  const incomingCount = new Map<string, number>();
  const outgoingEdges = new Map<string, WorkflowEdgeData[]>();

  for (const edge of edges) {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
    const out = outgoingEdges.get(edge.source) || [];
    out.push(edge);
    outgoingEdges.set(edge.source, out);
  }

  const entryNodes = nodes.filter((n) => !incomingCount.has(n.id));
  const hasOutgoing = new Set<string>();
  for (const edge of edges) hasOutgoing.add(edge.source);

  if (entryNodes.length === 1) {
    graph.addEdge(START, entryNodes[0].id);
  } else if (entryNodes.length > 1) {
    for (const n of entryNodes) graph.addEdge(START, n.id);
  }

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
          if (edge.condition && evaluateCondition(nodeOutput, edge.condition)) return edge.target;
        }
        return END as unknown as string;
      }, [...destinations, END as unknown as string]);
    }

    const regularEdges = outEdges.filter((e) => !e.condition || Object.keys(e.condition).length === 0);
    for (const edge of regularEdges) graph.addEdge(edge.source, edge.target);
  }

  for (const node of nodes) {
    if (!hasOutgoing.has(node.id) && !nodeHasConditional.has(node.id)) {
      graph.addEdge(node.id, END);
    }
  }
}

export async function runWorkflow(
  wf: WorkflowRow,
  input: string,
  controller: ReadableStreamDefaultController,
) {
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

    const graph = new StateGraph(WorkflowState) as any;
    buildGraph(graph, nodes, edges, controller, logEvent, runId);

    const compiled = graph.compile({ checkpointer });
    const result = await compiled.invoke(
      { input, agentOutputs: {}, executionLog: [] },
      { configurable: { thread_id: runId } },
    );

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
  } catch (err: any) {
    if (err?.name === "GraphInterrupt") {
      await db.update(runs).set({
        status: "awaiting_input",
        traceEvents: allEvents,
      }).where(eq(runs.id, runId));
      emitSSE(controller, { type: "done", step: 0 });
    } else {
      const errorMsg = err instanceof Error ? err.message : "Workflow execution failed";
      logEvent({ type: "error", content: errorMsg });

      await db.update(runs).set({
        status: "failed",
        output: errorMsg,
        traceEvents: allEvents,
        completedAt: new Date(),
      }).where(eq(runs.id, runId)).catch(() => {});

      emitSSE(controller, { type: "error", step: 0, content: errorMsg });
      emitSSE(controller, { type: "done", step: 0 });
    }
  } finally {
    try { controller.close(); } catch { /* already closed */ }
  }
}
