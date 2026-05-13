import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { AIBlockView } from "@/components/editor/ai-block-view";

export interface AIConversationEntry {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{
    chunkId: string;
    docId: string;
    docTitle: string;
    text: string;
  }>;
}

export interface AIBlockAttrs {
  mode: "write" | "qa";
  state: "input" | "loading" | "done" | "error";
  conversation: AIConversationEntry[];
}

export const AIBlock = Node.create({
  name: "aiBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      mode: { default: "write" },
      state: { default: "input" },
      conversation: {
        default: [],
        parseHTML: () => [],
        renderHTML: () => "",
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-ai-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-ai-block": "", ...HTMLAttributes }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AIBlockView);
  },
});
