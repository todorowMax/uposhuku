"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "@/components/icons";
import { sessionStore } from "@/lib/auth/client";
import { profileEditorStore, profileStore } from "@/lib/profile/client";
import { useStore } from "@/lib/store";

/** Той самий індикатор, що й під час завантаження профілю: без стрибка між двома очікуваннями. */
const EditorLoading = () => (
  <div className="pe-overlay grid place-items-center" role="status" aria-label="Завантажуємо профіль">
    <Loader2 className="size-6 animate-spin text-ink-muted" />
  </div>
);

// Форму (546 рядків, GSAP, завантаження фото) вантажимо, коли її відкрито.
const ProfileEditor = dynamic(() => import("./profile-editor").then((module) => module.ProfileEditor), { ssr: false, loading: EditorLoading });

/** Редактор поверх усього, коли відкритий і людина увійшла. */
export const ProfileEditorHost = () => {
  const open = useStore(profileEditorStore);
  const session = useStore(sessionStore);
  const profileState = useStore(profileStore);
  if (!open || session.status !== "user") return null;
  // Чекаємо, поки профіль завантажиться: інакше форма стартувала б порожньою й затерла б збережене.
  if (profileState.status !== "ready") return <EditorLoading />;
  return <ProfileEditor />;
};
