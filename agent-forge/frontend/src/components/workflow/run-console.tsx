"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, Play, Square, MessageSquare, User } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";

interface RunEvent {
  type: string;
  step: number;
  content?: string;
  agentId?: string;
  agentName?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  latencyMs?: number;
  prompt?: string;
  inputType?: string;
}

interface HumanInputPrompt {
  nodeId: string;
  prompt: string;
  inputType: string;
  runId: string;
}

interface RunConsoleProps {
  events: RunEvent[];
  running: boolean;
  error: string | null;
  input: string;
  onInputChange: (v: string) => void;
  onRun: () => void;
  onStop: () => void;
  humanInput: HumanInputPrompt | null;
  submitHumanInput: (response: string) => void;
}

function EventCard({ event }: { event: RunEvent }) {
  switch (event.type) {
    case "agent_start":
    case "node_start":
      return (
        <div className="text-xs text-zinc-400 py-0.5">
          {event.type === "agent_start" ? `Agent "${event.agentName}" started` : `${event.agentName} started`}
        </div>
      );
    case "agent_output":
    case "node_output":
      return (
        <div className="py-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-blue-400" />
            <span className="text-xs font-medium text-zinc-500">{event.agentName}</span>
          </div>
          <div className="ml-5">
            <MarkdownContent content={event.content || ""} />
          </div>
        </div>
      );
    case "human_input_required":
      return (
        <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 my-1">
          <div className="flex items-center gap-1.5 mb-1">
            <User className="h-3.5 w-3.5 text-orange-500" />
            <span className="text-xs font-medium text-orange-600">Input Required</span>
          </div>
          <p className="text-sm text-orange-800">{event.prompt}</p>
        </div>
      );
    case "error":
      return (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600 my-1">
          {event.content}
        </div>
      );
    default:
      return null;
  }
}

export function RunConsole({ events, running, error, input, onInputChange, onRun, onStop, humanInput, submitHumanInput }: RunConsoleProps) {
  const [width, setWidth] = useState(384);
  const [humanResponse, setHumanResponse] = useState("");
  const dragging = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setWidth(Math.max(320, Math.min(800, newWidth)));
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div className="shrink-0 border-l bg-white flex flex-col h-full relative" style={{ width }}>
      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-200 z-10 -ml-0.5"
      />

      {/* Header */}
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            Run Console
            {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />}
          </h3>
          <span className="text-xs text-zinc-400">{events.length} events</span>
        </div>
      </div>

      {/* Input area */}
      <div className="px-3 py-3 border-b shrink-0 space-y-2">
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !running) {
              e.preventDefault();
              onRun();
            }
          }}
          placeholder="Workflow input..."
          rows={3}
          className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-200"
          disabled={running}
        />
        <button
          onClick={running ? onStop : onRun}
          className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          style={{ background: running ? "#ef4444" : "#18181b" }}
          disabled={!running && !input.trim()}
        >
          {running ? (
            <>
              <Square className="h-3.5 w-3.5" /> Stop
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" /> Run
            </>
          )}
        </button>
      </div>

      {/* Human Input form */}
      {humanInput && (
        <div className="px-3 py-3 border-b shrink-0 space-y-2 bg-orange-50/50">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-orange-500" />
            <span className="text-xs font-semibold text-orange-600 uppercase tracking-wider">Human Input Required</span>
          </div>
          <p className="text-sm text-orange-800">{humanInput.prompt}</p>
          {humanInput.inputType === "text" ? (
            <textarea
              value={humanResponse}
              onChange={(e) => setHumanResponse(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && humanResponse.trim()) {
                  e.preventDefault();
                  submitHumanInput(humanResponse.trim());
                  setHumanResponse("");
                }
              }}
              placeholder="Your response..."
              rows={3}
              className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => { submitHumanInput("approve"); setHumanResponse(""); }}
                className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600"
              >
                Approve
              </button>
              <button
                onClick={() => { submitHumanInput("reject"); setHumanResponse(""); }}
                className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600"
              >
                Reject
              </button>
            </div>
          )}
          {humanInput.inputType === "text" && (
            <button
              onClick={() => { submitHumanInput(humanResponse.trim()); setHumanResponse(""); }}
              disabled={!humanResponse.trim()}
              className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40"
            >
              Submit
            </button>
          )}
        </div>
      )}

      {/* Events */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {events.length === 0 && !running && !error && !humanInput && (
          <p className="text-sm text-zinc-400 text-center pt-8">
            Enter input and click Run to execute the workflow.
          </p>
        )}
        {events.map((event, i) => (
          <EventCard key={i} event={event} />
        ))}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
