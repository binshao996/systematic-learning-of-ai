"use client";
import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface StartNodeData {
  label: string;
}

export const StartNode = memo(function StartNode({ data, selected }: NodeProps<StartNodeData>) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-white shadow-sm min-w-[140px]",
        selected && "border-green-500 ring-2 ring-green-100",
        !selected && "border-green-300",
      )}
    >
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-green-100 flex items-center justify-center">
            <Play className="h-4 w-4 text-green-600" />
          </div>
          <span className="font-medium text-sm">{data.label}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-green-400" />
    </div>
  );
});
