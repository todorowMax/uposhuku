// components/chat/inbox/parts/photo-viewer.tsx
//
// Фото з чату поверх усього: хрестик, Esc і дотик по фону закривають.

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export const PhotoViewer = ({ url, onClose }: { url: string; onClose: () => void }) => (
  <Dialog open onOpenChange={(next) => !next && onClose()}>
    <DialogContent aria-describedby={undefined} className="photo-viewer">
      <DialogTitle className="sr-only">Фото з чату</DialogTitle>
      <Button variant="bare" className="photo-viewer-close" aria-label="Закрити фото" onClick={onClose}>
        <X className="size-5" strokeWidth={2.2} />
      </Button>
      <img src={url} alt="Фото з чату" />
    </DialogContent>
  </Dialog>
);
