"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function UploadDialog() {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });
      const { docId } = await res.json() as { docId: string };

      setUploading(false);
      setOpen(false);
      router.push(`/${docId}`);
    } catch (err) {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Upload className="h-4 w-4" />
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-8">
          {uploading ? (
            <div className="flex items-center gap-2 text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Processing document...</span>
            </div>
          ) : (
            <label className="flex flex-col items-center gap-2 cursor-pointer p-8 border-2 border-dashed rounded-lg hover:border-blue-400 transition-colors">
              <Upload className="h-8 w-8 text-zinc-400" />
              <span className="text-sm text-zinc-500">PDF, Word, Markdown, TXT</span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx,.md,.txt"
                onChange={handleUpload}
              />
            </label>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
