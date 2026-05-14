"use client";
import { useState, useRef, useCallback } from "react";
import { TraceEvent } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

interface RunState {
  running: boolean;
  events: TraceEvent[];
  done: boolean;
  error: string | null;
}

export function useAgentRun() {
  const [state, setState] = useState<RunState>({
    running: false,
    events: [],
    done: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (agentId: string, message: string) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ running: true, events: [], done: false, error: null });

    try {
      const res = await fetch(`${API_URL}/api/agents/${agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
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
            const data = line.slice(6);
            try {
              const event = JSON.parse(data) as TraceEvent & { type: string };
              if (event.type === "done") {
                setState((s) => ({ ...s, done: true, running: false }));
              } else if (event.type === "error") {
                setState((s) => ({
                  ...s,
                  error: event.content || "Unknown error",
                  done: true,
                  running: false,
                }));
              } else {
                setState((s) => ({
                  ...s,
                  events: [...s.events, event as TraceEvent],
                }));
              }
            } catch {
              // skip parse errors
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setState((s) => ({
          ...s,
          error: (err as Error).message,
          running: false,
          done: true,
        }));
      }
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, running: false }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ running: false, events: [], done: false, error: null });
  }, []);

  return { ...state, run, stop, reset };
}
