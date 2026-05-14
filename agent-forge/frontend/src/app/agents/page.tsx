"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, X, Copy, Bot, BookOpen } from "lucide-react";
import { AgentCard } from "@/components/agents/agent-card";
import { AgentForm } from "@/components/agents/agent-form";
import { Agent } from "@/types";
import { apiFetch } from "@/lib/api-client";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [templates, setTemplates] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [presetAgent, setPresetAgent] = useState<Partial<Agent> | null>(null);
  const [tab, setTab] = useState<"agents" | "templates">("agents");

  const load = useCallback(async () => {
    try {
      const [agentData, templateData] = await Promise.all([
        apiFetch<Agent[]>("/api/agents"),
        apiFetch<Agent[]>("/api/agents/templates"),
      ]);
      setAgents(agentData);
      setTemplates(templateData);
    } catch {
      setAgents([]);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUseTemplate = (tpl: Agent) => {
    setPresetAgent({
      name: tpl.name,
      description: tpl.description,
      systemPrompt: tpl.systemPrompt,
      model: tpl.model,
      temperature: tpl.temperature,
      maxTokens: tpl.maxTokens,
      toolIds: tpl.toolIds,
    });
    setShowForm(true);
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">Agents</h1>
            <p className="text-sm text-zinc-500">Create and manage AI agents</p>
          </div>
          <button
            onClick={() => { setPresetAgent(null); setShowForm(true); }}
            className="inline-flex items-center gap-1.5 bg-zinc-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" />
            New Agent
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-zinc-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab("agents")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === "agents" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            My Agents ({agents.length})
          </button>
          <button
            onClick={() => setTab("templates")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === "templates" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Templates ({templates.length})
          </button>
        </div>

        {loading ? (
          <p className="text-zinc-400 text-sm">Loading...</p>
        ) : tab === "agents" ? (
          agents.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-zinc-400 mb-2">No agents yet</p>
              <button
                onClick={() => { setPresetAgent(null); setShowForm(true); }}
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
          )
        ) : (
          templates.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-zinc-400">No templates available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="rounded-xl border bg-white p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <BookOpen className="h-6 w-6 text-purple-500" />
                    {tpl.category && (
                      <span className="text-xs text-purple-600 bg-purple-50 rounded-full px-2 py-0.5 font-medium">
                        {tpl.category}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold mb-1">{tpl.name}</h3>
                  <p className="text-sm text-zinc-500 line-clamp-3 mb-4">
                    {tpl.description || "No description"}
                  </p>
                  <button
                    onClick={() => handleUseTemplate(tpl)}
                    className="inline-flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 font-medium"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Use Template
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="font-semibold">
                  {presetAgent ? `Create from: ${presetAgent.name}` : "Create Agent"}
                </h2>
                <button onClick={() => setShowForm(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 py-4">
                <AgentForm
                  agent={presetAgent as Agent | undefined}
                  onClose={() => { setShowForm(false); setPresetAgent(null); load(); }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
