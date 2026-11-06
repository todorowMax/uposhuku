"use client";

// components/chat/inbox/use-photo-staging.ts
//
// Фото, додані до повідомлення, що ще не надіслано: стиснення, завантаження на сервер, прибирання.

import { useRef, useState } from "react";
import { uploadChatPhoto } from "@/lib/chat/client";
import { CHAT_PHOTOS_MAX } from "@/lib/chat/types";
import { compressForChat } from "@/lib/images/resize";

/** Фото, додане до повідомлення, що ще не надіслано; id зʼявляється, коли воно вже на сервері. */
export interface StagedPhoto {
  tempId: string;
  preview: string;
  id?: string;
}

export const usePhotoStaging = (conversationId: string) => {
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setPhotoError(null);
    const room = CHAT_PHOTOS_MAX - photos.length;
    for (const file of [...files].slice(0, Math.max(0, room))) {
      const tempId = `tmp_${crypto.randomUUID()}`;
      try {
        const blob = await compressForChat(file);
        setPhotos((current) => [...current, { tempId, preview: URL.createObjectURL(blob) }]);
        const uploaded = await uploadChatPhoto(conversationId, blob);
        setPhotos((current) => current.map((photo) => (photo.tempId === tempId ? { ...photo, id: uploaded.id } : photo)));
      } catch (reason) {
        setPhotos((current) => current.filter((photo) => photo.tempId !== tempId));
        setPhotoError(reason instanceof Error && reason.message ? reason.message : "Не вдалося додати фото.");
      }
    }
    if (files.length > room) setPhotoError(`До ${CHAT_PHOTOS_MAX} фото в одному повідомленні.`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removePhoto = (tempId: string) => {
    setPhotos((current) => {
      const gone = current.find((photo) => photo.tempId === tempId);
      if (gone) URL.revokeObjectURL(gone.preview);
      return current.filter((photo) => photo.tempId !== tempId);
    });
  };

  const clearPhotos = () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.preview));
    setPhotos([]);
  };

  const ready = photos.filter((photo) => photo.id);
  return { photos, photoError, fileRef, addFiles, removePhoto, clearPhotos, ready, uploading: photos.some((photo) => !photo.id) };
};
