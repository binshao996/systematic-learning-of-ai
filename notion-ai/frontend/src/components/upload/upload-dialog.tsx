"use client";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";

function UploadButton() {
  return (
    <Button variant="outline" size="sm" className="gap-2">
      <Upload className="h-4 w-4" />
      Upload
    </Button>
  );
}

export function UploadDialog() {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    // Upload and redirect — filled in Task 22
    setUploading(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<UploadButton />} />
      <DialogContent>
        <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
        <div className="flex flex-col items-center gap-4 py-8">
          <label className="flex flex-col items-center gap-2 cursor-pointer p-8 border-2 border-dashed rounded-lg hover:border-blue-400 transition-colors">
            <Upload className="h-8 w-8 text-zinc-400" />
            <span className="text-sm text-zinc-500">PDF, Word, Markdown, TXT</span>
            <input type="file" className="hidden" accept=".pdf,.docx,.md,.txt" onChange={handleUpload} />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}
