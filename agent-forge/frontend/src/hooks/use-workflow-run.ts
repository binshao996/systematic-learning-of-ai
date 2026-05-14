"use client";
import { useState, useRef, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

interface RunEvent {
  type: string;
  step: number;
  content?: string;
  agentId?: string;
  agentName?: string;
}

interface RunState {
  running: boolean;
  events: RunEvent[];
  done: boolean;
  error: string | null;
  currentNodeId: string | null;
}

export function useWorkflowRun() {
  const [state, setState] = useState<RunState>({
    running: false,
    events: [],
    done: false,
    error: null,
    currentNodeId: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (workflowId: string, input: string) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ running: true, events: [], done: false, error: null, currentNodeId: null });

    try {
      const res = await fetch(`${API_URL}/api/workflows/${workflowId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const reader = res.body!.getReader();
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
              if (event.type === "agent_start" || event.type === "node_start") {
                setState((s) => ({ ...s, events: [...s.events, event], currentNodeId: event.agentId }));
              } else if (event.type === "agent_output" || event.type === "node_output") {
                setState((s) => ({ ...s, events: [...s.events, event] }));
              } else if (event.type === "done") {
                setState((s) => ({ ...s, done: true, running: false, currentNodeId: null }));
              } else if (event.type === "error") {
                setState((s) => ({ ...s, error: event.content || "Error", done: true, running: false }));
              } else {
                setState((s) => ({ ...s, events: [...s.events, event] }));
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setState((s) => ({ ...s, error: (err as Error).message, running: false, done: true }));
      }
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, running: false }));
  }, []);

  return { ...state, run, stop };
}
