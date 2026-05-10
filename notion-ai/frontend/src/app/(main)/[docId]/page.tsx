"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TipTapEditor } from "@/components/editor/tip-tap-editor";
import type { Doc } from "@/types";

export default function DocPage() {
  const params = useParams();
  const docId = params.docId as string;
  const [doc, setDoc] = useState<Doc | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/documents/${docId}`)
      .then((r) => r.json())
      .then(setDoc);
  }, [docId]);

  if (!doc) return <div className="p-8 text-zinc-400">Loading...</div>;

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-8 py-4 border-b">
          <input
            type="text"
            value={doc.title}
            onChange={(e) => {
              setDoc({ ...doc, title: e.target.value });
              fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/documents/${docId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: e.target.value }),
              });
            }}
            className="text-2xl font-bold bg-transparent border-none outline-none w-full"
            placeholder="Untitled"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          <TipTapEditor docId={docId} initialContent={doc.content} />
        </div>
      </div>
    </div>
  );
}
