"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TipTapEditor } from "@/components/editor/tip-tap-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import type { Doc } from "@/types";

export default function DocPage() {
  const params = useParams();
  const docId = params.docId as string;
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/documents/${docId}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      })
      .then(setDoc)
      .catch(() => {
        setError(true);
        toast.error("Failed to load document");
      });
  }, [docId]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-sm text-zinc-600">Failed to load document</p>
          <button
            className="text-sm text-blue-500 mt-2 hover:underline"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-8 py-4 border-b">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex-1 px-8 py-4 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
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
  );
}
