"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { AgentCard } from "@/components/agents/agent-card";
import { AgentForm } from "@/components/agents/agent-form";
import { Agent } from "@/types";
import { apiFetch } from "@/lib/api-client";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Agent[]>("/api/agents");
      setAgents(data);
    } catch {
      setAgents([]);
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
            <h1 className="text-2xl font-bold mb-1">Agents</h1>
            <p className="text-sm text-zinc-500">Create and manage AI agents</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 bg-zinc-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" />
            New Agent
          </button>
        </div>

        {loading ? (
          <p className="text-zinc-400 text-sm">Loading...</p>
        ) : agents.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-400 mb-2">No agents yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-sm text-zinc-600 underline"
            >
              Create your first agent
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="font-semibold">Create Agent</h2>
                <button onClick={() => setShowForm(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 py-4">
                <AgentForm onClose={() => { setShowForm(false); load(); }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
