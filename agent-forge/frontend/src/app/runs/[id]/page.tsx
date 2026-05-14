"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Brain, Wrench, MessageSquare, CheckCircle, XCircle, Loader2, Clock, Play } from "lucide-react";
import { Run, TraceEvent } from "@/types";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/markdown-content";

const eventIcons: Record<string, React.ReactNode> = {
  agent_start: <Play className="h-4 w-4 text-blue-400" />,
  node_start: <Play className="h-4 w-4 text-green-400" />,
  thinking: <Brain className="h-4 w-4 text-purple-400" />,
  tool_call: <Wrench className="h-4 w-4 text-amber-400" />,
  tool_result: <CheckCircle className="h-4 w-4 text-green-400" />,
  agent_output: <MessageSquare className="h-4 w-4 text-blue-500" />,
  node_output: <MessageSquare className="h-4 w-4 text-emerald-500" />,
  error: <XCircle className="h-4 w-4 text-red-400" />,
};

const statusBadge: Record<string, string> = {
  running: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  pending: "bg-zinc-50 text-zinc-600 border-zinc-200",
};

function TimelineCard({ event, isLast }: { event: TraceEvent; isLast: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className="h-8 w-8 rounded-full border-2 border-zinc-200 bg-white flex items-center justify-center">
          {eventIcons[event.type] || <Clock className="h-4 w-4 text-zinc-300" />}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-zinc-200 mt-1" />}
      </div>
      <div className={cn("pb-5 flex-1 min-w-0")}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-zinc-400 uppercase">{event.type}</span>
          {event.agentName && (
            <span className="text-xs text-zinc-500">· {event.agentName}</span>
          )}
          {event.latencyMs && (
            <span className="text-xs text-zinc-400">{event.latencyMs}ms</span>
          )}
        </div>
        {event.type === "tool_call" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <span className="text-xs font-medium text-amber-700">{event.toolName}</span>
            <pre className="text-xs text-amber-800 mt-1 whitespace-pre-wrap font-mono">
              {typeof event.toolInput === "string" ? event.toolInput : JSON.stringify(event.toolInput, null, 2)}
            </pre>
          </div>
        )}
        {event.type === "tool_result" && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
            <pre className="text-xs text-green-800 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
              {event.toolOutput}
            </pre>
          </div>
        )}
        {(event.type === "agent_output" || event.type === "node_output") && event.content && (
          <MarkdownContent content={event.content} />
        )}
        {event.type === "thinking" && event.content && (
          <div className="text-sm text-zinc-500">
            <MarkdownContent content={event.content} />
          </div>
        )}
        {event.type === "error" && event.content && (
          <div className="text-sm text-red-600 whitespace-pre-wrap">{event.content}</div>
        )}
      </div>
    </div>
  );
}

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Run>(`/api/runs/${id}`)
      .then(setRun)
      .catch(() => router.push("/runs"))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }
  if (!run) return null;

  const events = (run.traceEvents || []) as TraceEvent[];
  const duration = run.completedAt && run.startedAt
    ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
    : null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <button
          onClick={() => router.push("/runs")}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Runs
        </button>

        <div className="bg-white rounded-xl border p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold truncate">Run Detail</h1>
            <span className={cn("text-xs rounded-full px-2.5 py-0.5 border", statusBadge[run.status] || statusBadge.pending)}>
              {run.status}
              {run.status === "running" && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-zinc-400 text-xs">Input</p>
              <p className="font-medium line-clamp-2">{run.input}</p>
            </div>
            <div>
              <p className="text-zinc-400 text-xs">Duration</p>
              <p className="font-medium">{duration ? `${(duration / 1000).toFixed(1)}s` : "—"}</p>
            </div>
            <div>
              <p className="text-zinc-400 text-xs">Events</p>
              <p className="font-medium">{events.length}</p>
            </div>
          </div>
        </div>

        <h2 className="font-semibold mb-4">Execution Timeline</h2>
        {events.length === 0 ? (
          <p className="text-sm text-zinc-400">No trace events recorded.</p>
        ) : (
          <div className="bg-white rounded-xl border p-6">
            {events.map((event, i) => (
              <TimelineCard key={i} event={event} isLast={i === events.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
