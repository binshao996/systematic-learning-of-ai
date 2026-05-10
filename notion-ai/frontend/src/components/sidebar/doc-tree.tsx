"use client";
import { useEffect, useState } from "react";
import { DocTreeItem } from "./doc-tree-item";
import type { Doc } from "@/types";

export function DocTree() {
  const [docs, setDocs] = useState<Doc[]>([]);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/documents`)
      .then((r) => r.json())
      .then(setDocs);
  }, []);

  const refresh = () =>
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/documents`)
      .then((r) => r.json())
      .then(setDocs);

  return (
    <div className="space-y-0.5">
      {docs.map((doc) => (
        <DocTreeItem key={doc.id} doc={doc} level={0} onUpdate={refresh} />
      ))}
    </div>
  );
}
