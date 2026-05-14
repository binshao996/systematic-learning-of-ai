"use client";
import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Code2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeNodeData {
  label: string;
  content?: string;
}

export const CodeNode = memo(function CodeNode({ data, selected }: NodeProps<CodeNodeData>) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-white shadow-sm min-w-[160px]",
        selected && "border-purple-400 ring-2 ring-purple-100",
        !selected && "border-purple-200",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-400" />
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-7 w-7 rounded-lg bg-purple-100 flex items-center justify-center">
            <Code2 className="h-4 w-4 text-purple-600" />
          </div>
          <span className="font-medium text-sm truncate">{data.label}</span>
        </div>
        {data.content && (
          <p className="text-xs text-zinc-400 truncate max-w-[140px] font-mono">
            {data.content.slice(0, 40)}{data.content.length > 40 ? "..." : ""}
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400" />
    </div>
  );
});
