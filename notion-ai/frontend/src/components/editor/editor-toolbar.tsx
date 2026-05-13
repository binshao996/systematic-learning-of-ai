"use client";
import type { Editor } from "@tiptap/react";
import { Bold, Italic, List, ListOrdered, Heading2, Code, Strikethrough, Sparkles, Search } from "lucide-react";

const tools = [
  { icon: Bold, action: (e: Editor) => e.chain().focus().toggleBold().run(), active: "bold" },
  { icon: Italic, action: (e: Editor) => e.chain().focus().toggleItalic().run(), active: "italic" },
  { icon: Strikethrough, action: (e: Editor) => e.chain().focus().toggleStrike().run(), active: "strike" },
  { icon: Heading2, action: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run(), active: "heading" },
  { icon: List, action: (e: Editor) => e.chain().focus().toggleBulletList().run(), active: "bulletList" },
  { icon: ListOrdered, action: (e: Editor) => e.chain().focus().toggleOrderedList().run(), active: "orderedList" },
  { icon: Code, action: (e: Editor) => e.chain().focus().toggleCodeBlock().run(), active: "codeBlock" },
];

export function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b bg-white sticky top-0 z-10">
      {tools.map((tool) => (
        <button
          key={tool.active}
          type="button"
          className={`inline-flex shrink-0 items-center justify-center size-8 rounded-lg text-sm font-medium transition-all select-none
            ${editor.isActive(tool.active)
              ? "bg-secondary text-secondary-foreground"
              : "hover:bg-muted hover:text-foreground"}`}
          onMouseDown={(e) => {
            e.preventDefault();
            tool.action(editor);
          }}
        >
          <tool.icon className="size-4" />
        </button>
      ))}
      <div className="w-px h-5 bg-zinc-200 mx-1" />
      <button
        type="button"
        className="inline-flex shrink-0 items-center justify-center h-8 gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-all select-none text-blue-500 hover:text-blue-600 hover:bg-blue-50"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().insertAIBlock().run();
        }}
      >
        <Sparkles className="size-4" />
        <span className="text-xs">Ask AI</span>
      </button>
      <button
        type="button"
        className="inline-flex shrink-0 items-center justify-center h-8 gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-all select-none text-purple-500 hover:text-purple-600 hover:bg-purple-50"
        onMouseDown={(e) => {
          e.preventDefault();
          editor.chain().focus().insertAIQA().run();
        }}
      >
        <Search className="size-4" />
        <span className="text-xs">Ask Knowledge Base</span>
      </button>
    </div>
  );
}
