"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import { EditorToolbar } from "./editor-toolbar";
import { useEffect, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { AIBubbleMenu } from "./ai-bubble-menu";
import { AIBlock } from "@/extensions/ai-block";
import { AICommand } from "@/extensions/ai-command";
import { toast } from "sonner";

interface TipTapEditorProps {
  docId: string;
  initialContent: object;
}

function sanitizeContent(content: object): object {
  if (!content || !("type" in content)) {
    return { type: "doc", content: [] };
  }
  return content;
}

export function TipTapEditor({ docId, initialContent }: TipTapEditorProps) {
  const [aiMenuPos, setAiMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Type / for commands, Space for AI..." }),
      Highlight,
      AIBlock,
      AICommand,
    ],
    content: sanitizeContent(initialContent),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-zinc max-w-none focus:outline-none min-h-[200px] px-8 py-4",
      },
      handleKeyDown: (view, event) => {
        const { $from, empty } = view.state.selection;
        const node = $from.parent;
        const nodeText = node.textContent;

        if (
          (event.key === " " || event.key === "Enter") &&
          empty &&
          node.type.name === "paragraph"
        ) {
          // /ai or /aik command
          if (nodeText === "/ai" || nodeText === "/aik") {
            const mode = nodeText === "/aik" ? "qa" : "write";
            const from = $from.before();
            const to = $from.after();
            const aiNode = view.state.schema.nodes.aiBlock.create(
              { mode, state: "input", conversation: [] },
            );
            view.dispatch(view.state.tr.replaceWith(from, to, aiNode));
            return true;
          }

          // Space in empty paragraph triggers AI
          if (event.key === " " && nodeText.trim() === "" && node.childCount === 0) {
            const from = $from.before();
            const to = $from.after();
            const aiNode = view.state.schema.nodes.aiBlock.create(
              { mode: "write", state: "input", conversation: [] },
            );
            view.dispatch(view.state.tr.replaceWith(from, to, aiNode));
            return true;
          }
        }

        return false;
      },
    },
  });

  const content = editor?.getJSON();
  const debouncedContent = useDebounce(content, 1000);

  useEffect(() => {
    if (debouncedContent && Object.keys(debouncedContent).length > 0) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: debouncedContent }),
      }).catch(() => {
        toast.error("Failed to save. Retrying...");
      });
    }
  }, [debouncedContent, docId]);

  useEffect(() => {
    if (editor && initialContent) {
      editor.commands.setContent(sanitizeContent(initialContent));
    }
  }, [docId]);

  return (
    <div className="flex flex-col h-full">
      <EditorToolbar editor={editor} />
      <div
        className="flex-1 overflow-y-auto"
        onMouseUp={() => {
          const selection = window.getSelection();
          const text = selection?.toString().trim();
          if (text && text.length > 0) {
            const range = selection?.getRangeAt(0);
            const rect = range?.getBoundingClientRect();
            setSelectedText(text);
            setAiMenuPos({ top: (rect?.bottom ?? 0) + 8, left: rect?.left ?? 0 });
          } else {
            setAiMenuPos(null);
          }
        }}
      >
        <EditorContent editor={editor} className="max-w-3xl mx-auto" />
      </div>
      {aiMenuPos && (
        <AIBubbleMenu
          selectedText={selectedText}
          position={aiMenuPos}
          onReplace={(newText) => {
            editor?.chain().focus().insertContent(newText).run();
          }}
          onInsertBelow={(newText) => {
            editor?.chain().focus().insertContent(`\n${newText}`).run();
          }}
          onClose={() => setAiMenuPos(null)}
        />
      )}
    </div>
  );
}
