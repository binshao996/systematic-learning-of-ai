"use client";
import { memo, useState, useCallback } from "react";
import { Handle, Position, useReactFlow } from "reactflow";
import { User, Pencil } from "lucide-react";

interface HumanInputNodeProps {
  id: string;
  data: {
    label: string;
    isRunning?: boolean;
    isCompleted?: boolean;
    content?: string;
    config?: Record<string, unknown>;
  };
  selected: boolean;
}

function HumanInputNodeComponent({ id, data, selected }: HumanInputNodeProps) {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.content || "");

  const inputType = (data.config?.inputType as string) || "text";
  const prompt = data.content || "Please provide input";

  const startEdit = useCallback(() => {
    setDraft(data.content || "");
    setEditing(true);
  }, [data.content]);

  const saveEdit = useCallback(() => {
    setEditing(false);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, content: draft } }
          : n
      )
    );
  }, [id, draft, setNodes]);

  const toggleInputType = useCallback(() => {
    const nextType = inputType === "text" ? "approve-reject" : "text";
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, config: { ...n.data.config, inputType: nextType } } }
          : n
      )
    );
  }, [id, inputType, setNodes]);

  return (
    <div
      className={`rounded-xl border-2 bg-white shadow-sm min-w-[200px] ${
        selected ? "border-orange-400" : "border-orange-200"
      } ${data.isRunning ? "ring-2 ring-amber-400" : ""} ${
        data.isCompleted ? "border-green-400" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-orange-400" />

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-lg bg-orange-100 flex items-center justify-center">
            <User className="h-3.5 w-3.5 text-orange-600" />
          </div>
          <span className="text-sm font-medium text-zinc-700 truncate">{data.label}</span>
        </div>

        {editing ? (
          <div className="space-y-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                }
                if (e.key === "Escape") {
                  setEditing(false);
                }
              }}
              placeholder="What should the human review or provide?"
              rows={3}
              className="w-full border border-orange-300 rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-orange-400"
              autoFocus
            />
            <p className="text-xs text-zinc-400">Enter to save, Esc to cancel</p>
          </div>
        ) : (
          <div
            className="group cursor-pointer relative"
            onDoubleClick={startEdit}
            title="Double-click to edit prompt"
          >
            <p className="text-xs text-orange-700 leading-relaxed pr-5">{prompt}</p>
            <button
              onClick={startEdit}
              className="absolute top-0 right-0 p-0.5 rounded text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-orange-500"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}

        <button
          onClick={toggleInputType}
          className="mt-2 text-xs px-2 py-0.5 rounded-full border"
          style={{
            borderColor: inputType === "text" ? "#fdba74" : "#c084fc",
            color: inputType === "text" ? "#c2410c" : "#7c3aed",
            backgroundColor: inputType === "text" ? "#fff7ed" : "#faf5ff",
          }}
        >
          {inputType === "text" ? "Text input" : "Approve / Reject"}
        </button>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-orange-400" />
    </div>
  );
}

export const HumanInputNode = memo(HumanInputNodeComponent);
