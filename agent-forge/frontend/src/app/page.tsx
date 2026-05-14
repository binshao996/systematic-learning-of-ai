"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Bot, Workflow, Play, ArrowRight, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Agent, Workflow as WF, Run } from "@/types";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [workflows, setWorkflows] = useState<WF[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Agent[]>("/api/agents").catch(() => []),
      apiFetch<WF[]>("/api/workflows").catch(() => []),
      apiFetch<Run[]>("/api/runs").catch(() => []),
    ]).then(([a, w, r]) => {
      setAgents(a);
      setWorkflows(w);
      setRuns(r);
      setLoaded(true);
    });
  }, []);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  const recentRuns = runs.slice(0, 5);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight mb-2">AgentForge</h1>
          <p className="text-zinc-500">Build, orchestrate, and run AI agent workflows.</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-12">
          <Link
            href="/agents"
            className="rounded-xl border bg-white p-6 hover:shadow-md transition-shadow"
          >
            <Bot className="h-8 w-8 text-zinc-700 mb-3" />
            <p className="text-3xl font-bold">{agents.length}</p>
            <p className="text-sm text-zinc-500">Agents</p>
          </Link>
          <Link
            href="/workflows"
            className="rounded-xl border bg-white p-6 hover:shadow-md transition-shadow"
          >
            <Workflow className="h-8 w-8 text-zinc-700 mb-3" />
            <p className="text-3xl font-bold">{workflows.length}</p>
            <p className="text-sm text-zinc-500">Workflows</p>
          </Link>
          <Link
            href="/runs"
            className="rounded-xl border bg-white p-6 hover:shadow-md transition-shadow"
          >
            <Play className="h-8 w-8 text-zinc-700 mb-3" />
            <p className="text-3xl font-bold">{runs.length}</p>
            <p className="text-sm text-zinc-500">Total Runs</p>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Recent Runs</h2>
              <Link href="/runs" className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {recentRuns.length === 0 ? (
              <p className="text-sm text-zinc-400">No runs yet. Run a workflow to see results.</p>
            ) : (
              <div className="space-y-2">
                {recentRuns.map((run) => (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-zinc-50 text-sm"
                  >
                    {run.status === "completed" ? (
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    ) : run.status === "failed" ? (
                      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                    ) : (
                      <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
                    )}
                    <span className="flex-1 truncate">{run.input.slice(0, 80)}</span>
                    <span className={cn(
                      "text-xs rounded px-1.5 py-0.5 shrink-0",
                      run.status === "completed" && "bg-green-50 text-green-700",
                      run.status === "failed" && "bg-red-50 text-red-700",
                      run.status === "running" && "bg-blue-50 text-blue-700",
                    )}>
                      {run.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-semibold mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <Link
                href="/agents"
                className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-zinc-50"
              >
                <Bot className="h-5 w-5 text-zinc-400" />
                <div>
                  <p className="text-sm font-medium">Create Agent</p>
                  <p className="text-xs text-zinc-400">Define an AI agent with system prompt and tools</p>
                </div>
              </Link>
              <Link
                href="/workflows/new"
                className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-zinc-50"
              >
                <Workflow className="h-5 w-5 text-zinc-400" />
                <div>
                  <p className="text-sm font-medium">Build Workflow</p>
                  <p className="text-xs text-zinc-400">Orchestrate multiple agents in a visual DAG</p>
                </div>
              </Link>
              <Link
                href="/runs"
                className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-zinc-50"
              >
                <Play className="h-5 w-5 text-zinc-400" />
                <div>
                  <p className="text-sm font-medium">View Runs</p>
                  <p className="text-xs text-zinc-400">Inspect execution traces and debug workflows</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
