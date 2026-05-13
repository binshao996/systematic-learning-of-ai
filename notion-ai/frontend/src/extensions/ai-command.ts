import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    aiCommand: {
      insertAIBlock: () => ReturnType;
      insertAIQA: () => ReturnType;
    };
  }
}

export const AICommand = Extension.create({
  name: "aiCommand",

  addCommands() {
    return {
      insertAIBlock:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: "aiBlock",
              attrs: { mode: "write", state: "input", conversation: [] },
            })
            .run(),

      insertAIQA:
        () =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: "aiBlock",
              attrs: { mode: "qa", state: "input", conversation: [] },
            })
            .run(),
    };
  },
});
