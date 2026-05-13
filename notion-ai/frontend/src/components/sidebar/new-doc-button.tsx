"use client";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NewDocButton() {
  const router = useRouter();

  const createDoc = async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled" }),
    });
    const doc = await res.json() as { id: string };
    router.push(`/${doc.id}`);
  };

  return (
    <Button variant="ghost" size="icon" onClick={createDoc}>
      <Plus className="h-4 w-4" />
    </Button>
  );
}
