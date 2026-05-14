"use client";
import { useState, useRef, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

interface RunEvent {
  type: string;
  step: number;
  content?: string;
  agentId?: string;
  agentName?: string;
  runId?: string;
  prompt?: string;
  inputType?: string;
  branchCount?: number;
}

interface HumanInputPrompt {
  nodeId: string;
  prompt: string;
  inputType: string;
  runId: string;
}

interface RunState {
  running: boolean;
  events: RunEvent[];
  done: boolean;
  error: string | null;
  currentNodeId: string | null;
  activeNodeIds: Set<string>;
  isParallel: boolean;
  branchCount: number;
  runId: string | null;
  humanInput: HumanInputPrompt | null;
}

export function useWorkflowRun() {
  const [state, setState] = useState<RunState>({
    running: false,
    events: [],
    done: false,
    error: null,
    currentNodeId: null,
    activeNodeIds: new Set(),
    isParallel: false,
    branchCount: 0,
    runId: null,
    humanInput: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const processStream = useCallback(async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event = JSON.parse(line.slice(6));

            // Capture runId from any event that carries it
            if (event.runId) {
              setState((s) => ({ ...s, runId: event.runId }));
            }

            if (event.type === "parallel_start") {
              setState((s) => ({
                ...s,
                events: [...s.events, event],
                isParallel: true,
                branchCount: event.branchCount || 0,
              }));
            } else if (event.type === "parallel_end") {
              setState((s) => ({
                ...s,
                events: [...s.events, event],
                isParallel: false,
                activeNodeIds: new Set(),
              }));
            } else if (event.type === "human_input_required") {
              setState((s) => ({
                ...s,
                events: [...s.events, event],
                humanInput: {
                  nodeId: event.agentId || "",
                  prompt: event.prompt || "Please provide input",
                  inputType: event.inputType || "text",
                  runId: event.runId || s.runId || "",
                },
              }));
            } else if (event.type === "agent_start" || event.type === "node_start") {
              setState((s) => {
                const newActive = new Set(s.activeNodeIds);
                newActive.add(event.agentId);
                return {
                  ...s,
                  events: [...s.events, event],
                  currentNodeId: event.agentId,
                  activeNodeIds: newActive,
                };
              });
            } else if (event.type === "agent_output" || event.type === "node_output") {
              setState((s) => {
                const newActive = new Set(s.activeNodeIds);
                newActive.delete(event.agentId);
                return { ...s, events: [...s.events, event], activeNodeIds: newActive };
              });
            } else if (event.type === "done") {
              setState((s) => ({
                ...s, done: true, running: false,
                currentNodeId: null, activeNodeIds: new Set(), isParallel: false,
              }));
            } else if (event.type === "error") {
              setState((s) => ({
                ...s, error: event.content || "Error", done: true, running: false,
              }));
            } else {
              setState((s) => ({ ...s, events: [...s.events, event] }));
            }
          } catch { /* skip */ }
        }
      }
    }
  }, []);

  const run = useCallback(async (workflowId: string, input: string) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      running: true, events: [], done: false, error: null,
      currentNodeId: null, activeNodeIds: new Set(), isParallel: false, branchCount: 0,
      runId: null, humanInput: null,
    });

    try {
      const res = await fetch(`${API_URL}/api/workflows/${workflowId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      await processStream(res.body!.getReader());
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setState((s) => ({ ...s, error: (err as Error).message, running: false, done: true }));
      }
    }
  }, [processStream]);

  const submitHumanInput = useCallback(async (response: string) => {
    const currentRunId = state.runId;
    const currentHumanInput = state.humanInput;
    if (!currentRunId || !currentHumanInput) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setState((s) => ({
      ...s,
      running: true,
      done: false,
      error: null,
      humanInput: null,
    }));

    try {
      const res = await fetch(`${API_URL}/api/workflows/runs/${currentRunId}/human-input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: currentHumanInput.nodeId, response }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      await processStream(res.body!.getReader());
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setState((s) => ({ ...s, error: (err as Error).message, running: false, done: true }));
      }
    }
  }, [state.runId, state.humanInput, processStream]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, running: false }));
  }, []);

  return { ...state, run, stop, submitHumanInput };
}
