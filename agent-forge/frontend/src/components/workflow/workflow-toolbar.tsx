"use client";
import { Save, Play, Square } from "lucide-react";

interface WorkflowToolbarProps {
  name: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onRun: () => void;
  onStop: () => void;
  running: boolean;
  saving: boolean;
}

export function WorkflowToolbar({ name, onNameChange, onSave, onRun, onStop, running, saving }: WorkflowToolbarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-white">
      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        className="text-sm font-semibold bg-transparent border-none outline-none min-w-[200px]"
        placeholder="Untitled Workflow"
      />
      <div className="flex-1" />
      <button
        onClick={onRun}
        disabled={running}
        className="inline-flex items-center gap-1.5 bg-green-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
      >
        <Play className="h-3.5 w-3.5" /> Run
      </button>
      {running && (
        <button
          onClick={onStop}
          className="inline-flex items-center gap-1.5 bg-red-500 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-red-600"
        >
          <Square className="h-3 w-3" /> Stop
        </button>
      )}
      <button
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-1.5 bg-zinc-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
      >
        <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
