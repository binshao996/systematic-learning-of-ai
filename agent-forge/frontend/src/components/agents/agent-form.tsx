"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { Agent } from "@/types";

interface AgentFormData {
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  toolIds: string[];
}

interface AgentFormProps {
  agent?: Agent;
  onClose?: () => void;
}

export function AgentForm({ agent, onClose }: AgentFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AgentFormData>({
    name: agent?.name || "",
    description: agent?.description || "",
    systemPrompt: agent?.systemPrompt || "",
    model: agent?.model || "deepseek-chat",
    temperature: agent?.temperature ?? 0.3,
    maxTokens: agent?.maxTokens ?? 2048,
    toolIds: agent?.toolIds || [],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (agent?.id) {
        await apiFetch(`/api/agents/${agent.id}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
        toast.success("Agent updated");
      } else {
        const created = await apiFetch<Agent>("/api/agents", {
          method: "POST",
          body: JSON.stringify(form),
        });
        toast.success("Agent created");
        router.push(`/agents/${created.id}`);
      }
      onClose?.();
    } catch {
      toast.error("Failed to save agent");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">System Prompt</label>
        <textarea
          value={form.systemPrompt}
          onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
          className="w-full border rounded-lg px-3 py-2 text-sm min-h-[120px] font-mono"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Model</label>
          <select
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="deepseek-chat">DeepSeek Chat</option>
            <option value="deepseek-v4-flash">DeepSeek V4 Flash</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Temperature: {form.temperature}
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={form.temperature}
            onChange={(e) => setForm({ ...form, temperature: +e.target.value })}
            className="w-full"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Max Tokens: {form.maxTokens}
        </label>
        <input
          type="range"
          min="256"
          max="8192"
          step="256"
          value={form.maxTokens}
          onChange={(e) => setForm({ ...form, maxTokens: +e.target.value })}
          className="w-full"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="w-full bg-zinc-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : agent?.id ? "Update Agent" : "Create Agent"}
      </button>
    </form>
  );
}
