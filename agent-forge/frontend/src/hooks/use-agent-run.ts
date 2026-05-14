"use client";
import { useState, useRef, useCallback } from "react";
import { TraceEvent } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

export interface Conversation {
  id: string;
  agentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadConversations = useCallback(async (agentId: string): Promise<Conversation[]> => {
    try {
      const res = await fetch(`${API_URL}/api/agents/${agentId}/conversations`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }, []);

  const loadHistory = useCallback(async (agentId: string, convId: string): Promise<TraceEvent[]> => {
    try {
      const res = await fetch(`${API_URL}/api/agents/${agentId}/conversations/${convId}/messages`);
      if (!res.ok) return [];
      const msgs = await res.json() as Array<{
        role: string;
        content: string | null;
        toolCalls: unknown;
        toolCallId: string | null;
        createdAt: string;
      }>;
      // Convert stored messages to TraceEvent-like format for display
      const events: TraceEvent[] = [];
      for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        if (msg.role === "user") {
          events.push({
            step: i,
            type: "user_message" as never,
            content: msg.content || "",
          });
        } else if (msg.role === "assistant") {
          events.push({
            step: i,
            type: "agent_output",
            content: msg.content || "",
          });
        } else if (msg.role === "tool") {
          events.push({
            step: i,
            type: "tool_result",
            toolOutput: msg.content || "",
            toolName: "",
          });
        }
      }
      return events;
    } catch {
      return [];
    }
  }, []);

  const loadHistoryIntoState = useCallback((historyEvents: TraceEvent[], convId: string) => {
    setConversationId(convId);
    setState({ running: false, events: historyEvents, done: true, error: null });
  }, []);

  const run = useCallback(async (agentId: string, message: string, convId?: string) => {
    const controller = new AbortController();
    abortRef.current = controller;

    const userEvent: TraceEvent = { step: 0, type: "user_message" as TraceEvent["type"], content: message };

    if (convId) {
      setState((s) => ({ ...s, running: true, done: false, error: null, events: [...s.events, userEvent] }));
    } else {
      setState({ running: true, events: [userEvent], done: false, error: null });
    }

    try {
      const res = await fetch(`${API_URL}/api/agents/${agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId: convId }),
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
    setConversationId(null);
  }, []);

  return { ...state, conversationId, setConversationId, run, stop, reset, loadConversations, loadHistory, loadHistoryIntoState };
}
