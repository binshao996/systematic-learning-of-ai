"use client";
import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentNodeData {
  label: string;
  agentName: string;
  agentId: string;
  isRunning?: boolean;
  isCompleted?: boolean;
}

export const AgentNode = memo(function AgentNode({ data, selected }: NodeProps<AgentNodeData>) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-white shadow-sm min-w-[180px]",
        selected && "border-blue-400 ring-2 ring-blue-100",
        !selected && "border-zinc-200",
        data.isRunning && "border-amber-400 ring-2 ring-amber-100",
        data.isCompleted && "border-green-400"
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-400" />
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <div className={cn(
            "h-7 w-7 rounded-lg flex items-center justify-center",
            data.isRunning && "bg-amber-100",
            data.isCompleted && "bg-green-100",
            !data.isRunning && !data.isCompleted && "bg-zinc-100"
          )}>
            {data.isRunning ? (
              <Loader2 className="h-4 w-4 text-amber-600 animate-spin" />
            ) : (
              <Bot className="h-4 w-4 text-zinc-500" />
            )}
          </div>
          <span className="font-medium text-sm truncate">{data.label}</span>
        </div>
        <p className="text-xs text-zinc-400 truncate">{data.agentName}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-400" />
    </div>
  );
});
