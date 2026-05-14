"use client";
import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface EndNodeData {
  label: string;
}

export const EndNode = memo(function EndNode({ data, selected }: NodeProps<EndNodeData>) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-white shadow-sm min-w-[140px]",
        selected && "border-red-400 ring-2 ring-red-100",
        !selected && "border-red-300",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-red-400" />
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-red-100 flex items-center justify-center">
            <Square className="h-3.5 w-3.5 text-red-600" />
          </div>
          <span className="font-medium text-sm">{data.label}</span>
        </div>
      </div>
    </div>
  );
});
