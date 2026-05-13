import { redirect } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default async function HomePage() {
  let docs: { id: string }[] = [];
  try {
    const res = await fetch(`${API_URL}/api/documents`, { cache: "no-store" });
    docs = await res.json();
  } catch {}

  if (Array.isArray(docs) && docs.length > 0) {
    redirect(`/${docs[0].id}`);
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-4">
      <div className="text-zinc-400">
        <p className="text-lg font-medium">No documents yet</p>
        <p className="text-sm mt-1">
          Create your first document or upload a file to get started
        </p>
      </div>
    </div>
  );
}
