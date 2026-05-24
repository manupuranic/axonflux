"use client";
import { useEffect, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { listVersions, restoreVersion } from "@/lib/pamphlet/api";
import { VersionInfo } from "@/lib/pamphlet/types";

interface Props {
  pamphletId: string;
  onRestore: () => void;
}

export function HistoryDrawer({ pamphletId, onRestore }: Props) {
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (open) listVersions(pamphletId).then(setVersions).catch(console.error);
  }, [open, pamphletId]);

  async function handleRestore(versionId: string) {
    setRestoring(versionId);
    try {
      await restoreVersion(pamphletId, versionId);
      onRestore();
      setOpen(false);
    } finally {
      setRestoring(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="sm" className="gap-1" />}>
        <History className="w-4 h-4" /> History
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Version History</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 overflow-y-auto max-h-[80vh]">
          {versions.length === 0 && <p className="text-xs text-muted-foreground">No versions yet.</p>}
          {versions.map((v) => (
            <div key={v.id} className="flex items-start justify-between gap-2 p-2 rounded border text-xs">
              <div>
                <p className="font-medium">{v.edit_summary || "Edit"}</p>
                <p className="text-muted-foreground">{new Date(v.created_at).toLocaleString()}</p>
              </div>
              <Button
                variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                onClick={() => handleRestore(v.id)}
                disabled={restoring === v.id}
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
