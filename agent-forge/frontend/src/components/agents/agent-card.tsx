"use client";
import Link from "next/link";
import { Agent } from "@/types";
import { Bot } from "lucide-react";

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="rounded-xl border bg-white p-6 hover:shadow-md transition-shadow block"
    >
      <Bot className="h-6 w-6 text-zinc-500 mb-3" />
      <h3 className="font-semibold mb-1 truncate">{agent.name}</h3>
      <p className="text-sm text-zinc-500 line-clamp-2 mb-3">
        {agent.description || "No description"}
      </p>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-zinc-400 bg-zinc-100 rounded px-1.5 py-0.5">
          {agent.model}
        </span>
        {agent.toolIds.length > 0 && (
          <span className="text-xs text-zinc-400 bg-zinc-100 rounded px-1.5 py-0.5">
            {agent.toolIds.length} tools
          </span>
        )}
      </div>
    </Link>
  );
}
