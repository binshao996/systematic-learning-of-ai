"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import { EditorToolbar } from "./editor-toolbar";
import { useEffect } from "react";
import { useDebounce } from "@/hooks/use-debounce";

interface TipTapEditorProps {
  docId: string;
  initialContent: object;
}

export function TipTapEditor({ docId, initialContent }: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Type / for commands..." }),
      Highlight,
    ],
    content: initialContent,
    editorProps: {
      attributes: { class: "prose prose-zinc max-w-none focus:outline-none min-h-[200px] px-8 py-4" },
    },
  });

  const content = editor?.getJSON();
  const debouncedContent = useDebounce(content, 1000);

  useEffect(() => {
    if (debouncedContent && Object.keys(debouncedContent).length > 0) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: debouncedContent }),
      });
    }
  }, [debouncedContent, docId]);

  useEffect(() => {
    if (editor && initialContent) {
      editor.commands.setContent(initialContent);
    }
  }, [docId]);

  return (
    <div className="flex flex-col h-full">
      <EditorToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="max-w-3xl mx-auto" />
      </div>
    </div>
  );
}
