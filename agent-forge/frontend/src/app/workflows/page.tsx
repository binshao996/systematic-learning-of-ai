"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Workflow } from "lucide-react";
import { Workflow as WF } from "@/types";
import { apiFetch } from "@/lib/api-client";

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WF[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setWorkflows(await apiFetch<WF[]>("/api/workflows"));
    } catch {
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">Workflows</h1>
            <p className="text-sm text-zinc-500">Orchestrate multi-agent pipelines</p>
          </div>
          <Link
            href="/workflows/new"
            className="inline-flex items-center gap-1.5 bg-zinc-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" />
            New Workflow
          </Link>
        </div>

        {loading ? (
          <p className="text-zinc-400 text-sm">Loading...</p>
        ) : workflows.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-400 mb-2">No workflows yet</p>
            <Link href="/workflows/new" className="text-sm text-zinc-600 underline">
              Create your first workflow
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((wf) => (
              <Link
                key={wf.id}
                href={`/workflows/${wf.id}`}
                className="rounded-xl border bg-white p-6 hover:shadow-md transition-shadow"
              >
                <Workflow className="h-6 w-6 text-zinc-500 mb-3" />
                <h3 className="font-semibold mb-1">{wf.name}</h3>
                <p className="text-sm text-zinc-500 line-clamp-2 mb-2">
                  {wf.description || "No description"}
                </p>
                <p className="text-xs text-zinc-400">
                  {Array.isArray(wf.nodes) ? wf.nodes.length : 0} agents
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
