// app/(map)/@modal/(.)p/[id]/page.tsx
//
// Перехоплений маршрут: коли людина відкриває профіль з карти (router.push з lib/profile/navigation.ts), Next показує його
// тут, у слоті layout групи (map), поверх карти і без її перезавантаження. Прямий захід, оновлення й пошук потрапляють на
// серверну сторінку без карти: app/(site)/p/[id]/page.tsx. Закриття вікна повертає назад по історії.

import { notFound } from "next/navigation";
import { ProfileView } from "@/components/profile/profile-view";
import { getPublicPerformer } from "@/lib/performers/server";
import { tagLabel } from "@/lib/tags/engine";

type Props = { params: Promise<{ id: string }> };

const ProfileModal = async ({ params }: Props) => {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const performer = await getPublicPerformer(id);
  if (!performer) notFound();
  const labels = Object.fromEntries(performer.tags.map((tag) => [tag, tagLabel(tag)]));
  return <ProfileView id={id} initial={performer} initialLabels={labels} />;
};

export default ProfileModal;
