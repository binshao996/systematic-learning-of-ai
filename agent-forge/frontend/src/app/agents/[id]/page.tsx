"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AgentForm } from "@/components/agents/agent-form";
import { ToolPicker } from "@/components/agents/tool-picker";
import { TestChat } from "@/components/agents/test-chat";
import { Agent } from "@/types";
import { apiFetch } from "@/lib/api-client";

export default function AgentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Agent>(`/api/agents/${id}`)
      .then(setAgent)
      .catch(() => router.push("/agents"))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <p className="text-zinc-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <button
          onClick={() => router.push("/agents")}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Agents
        </button>

        <h1 className="text-2xl font-bold mb-6">{agent.name}</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border p-6">
              <h2 className="font-semibold mb-4">Configuration</h2>
              <AgentForm agent={agent} />
            </div>
          </div>
          <div>
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-semibold mb-4">Tools</h2>
              <ToolPicker
                selected={agent.toolIds}
                onChange={async (toolIds) => {
                  setAgent({ ...agent, toolIds });
                  await apiFetch(`/api/agents/${agent.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ toolIds }),
                  }).catch(() => {});
                }}
              />
            </div>
          </div>
        </div>

        <div className="max-w-3xl">
          <TestChat agentId={agent.id} />
        </div>
      </div>
    </div>
  );
}
