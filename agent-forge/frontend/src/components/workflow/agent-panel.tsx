"use client";
import { useState, useEffect } from "react";
import { Bot, Play, Square } from "lucide-react";
import { Agent } from "@/types";
import { apiFetch } from "@/lib/api-client";

export function AgentPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    apiFetch<Agent[]>("/api/agents").then(setAgents).catch(() => setAgents([]));
  }, []);

  const onDragStart = (e: React.DragEvent, agent: Agent) => {
    e.dataTransfer.setData("application/agent", JSON.stringify(agent));
    e.dataTransfer.effectAllowed = "move";
  };

  const onNodeDragStart = (e: React.DragEvent, nodeType: string) => {
    e.dataTransfer.setData("application/nodetype", nodeType);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-56 shrink-0 border-r bg-white p-3 flex flex-col">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Nodes</h3>

      {/* Built-in node types */}
      <div className="space-y-1 mb-4">
        <div
          draggable
          onDragStart={(e) => onNodeDragStart(e, "start")}
          className="flex items-center gap-2 rounded-lg border border-green-200 px-3 py-2 cursor-grab active:cursor-grabbing hover:bg-green-50 text-sm bg-green-50/50"
        >
          <Play className="h-4 w-4 text-green-500 shrink-0" />
          <span className="truncate font-medium text-green-700">Start</span>
        </div>
        <div
          draggable
          onDragStart={(e) => onNodeDragStart(e, "end")}
          className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 cursor-grab active:cursor-grabbing hover:bg-red-50 text-sm bg-red-50/50"
        >
          <Square className="h-3.5 w-3.5 text-red-500 shrink-0" />
          <span className="truncate font-medium text-red-700">End</span>
        </div>
      </div>

      {/* Agent list */}
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Agents</h3>
      <div className="space-y-1 flex-1 overflow-y-auto">
        {agents.map((agent) => (
          <div
            key={agent.id}
            draggable
            onDragStart={(e) => onDragStart(e, agent)}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-grab active:cursor-grabbing hover:bg-zinc-50 text-sm"
          >
            <Bot className="h-4 w-4 text-zinc-400 shrink-0" />
            <span className="truncate">{agent.name}</span>
          </div>
        ))}
        {agents.length === 0 && (
          <p className="text-xs text-zinc-400 p-2">No agents. Create one first.</p>
        )}
      </div>
    </div>
  );
}
