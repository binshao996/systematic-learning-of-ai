"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Play, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { Run } from "@/types";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const statusIcons: Record<string, React.ReactNode> = {
  running: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  pending: <Clock className="h-4 w-4 text-zinc-400" />,
};

const statusColors: Record<string, string> = {
  running: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  pending: "bg-zinc-50 text-zinc-600 border-zinc-200",
};

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      setRuns(await apiFetch<Run[]>("/api/runs"));
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? runs : runs.filter((r) => r.status === filter);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">Runs</h1>
            <p className="text-sm text-zinc-500">Workflow execution history</p>
          </div>
          <div className="flex gap-1.5">
            {["all", "completed", "failed", "running"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "text-xs rounded-lg px-2.5 py-1 capitalize border",
                  filter === f ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-600 hover:bg-zinc-50"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-zinc-400 text-sm">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-400">No runs found</p>
            <Link href="/workflows" className="text-sm text-zinc-600 underline mt-2 inline-block">
              Run a workflow
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="flex items-center gap-4 rounded-xl border bg-white p-4 hover:shadow-sm transition-shadow"
              >
                <div className="shrink-0">{statusIcons[run.status] || statusIcons.pending}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{run.input.slice(0, 100)}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {new Date(run.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className={cn("text-xs rounded-full px-2 py-0.5 border shrink-0", statusColors[run.status] || statusColors.pending)}>
                  {run.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
