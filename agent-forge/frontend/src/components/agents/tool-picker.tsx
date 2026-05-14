"use client";
import { useState, useEffect } from "react";
import { Tool } from "@/types";
import { apiFetch } from "@/lib/api-client";
import { Wrench } from "lucide-react";

interface ToolPickerProps {
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function ToolPicker({ selected, onChange }: ToolPickerProps) {
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    apiFetch<Tool[]>("/api/tools").then(setTools).catch(() => setTools([]));
  }, []);

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  if (tools.length === 0) return null;

  return (
    <div>
      <label className="block text-sm font-medium mb-2">Tools</label>
      <div className="space-y-1.5">
        {tools.map((tool) => (
          <label
            key={tool.id}
            className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer hover:bg-zinc-50 has-checked:border-zinc-400 has-checked:bg-zinc-50"
          >
            <input
              type="checkbox"
              checked={selected.includes(tool.id)}
              onChange={() => toggle(tool.id)}
              className="mt-0.5 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-sm font-medium">{tool.displayName}</span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{tool.description}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
