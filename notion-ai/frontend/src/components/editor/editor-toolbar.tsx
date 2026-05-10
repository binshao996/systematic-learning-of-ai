"use client";
import type { Editor } from "@tiptap/react";
import { Bold, Italic, List, ListOrdered, Heading2, Code, Strikethrough } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        <Button
          key={tool.active}
          variant={editor.isActive(tool.active) ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => tool.action(editor)}
        >
          <tool.icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}
