// app/zapyt/[id]/page.tsx
//
// Публічна сторінка запиту: текст без контактів, умови й кнопка «Відгукнутися». Лежить поза групою (map), тож карта й
// MapLibre не вантажаться. Бачить кожен, якщо автор дозволив показ («в канал»); інакше 404, крім самого автора.
// Закритий запит показує «Виконавця знайдено» і не індексується. Відгукнутися веде в `/?open=request:<id>` (components/map/deep-link-sync).

import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RequestView } from "@/components/request-page/request-view";
import { requestDescription, requestTitle } from "@/lib/requests/public";
import { getSessionUser } from "@/lib/server/auth";
import { siteUrl } from "@/lib/server/env";
import { getPublicRequest } from "@/lib/server/request-repo";

type Props = { params: Promise<{ id: string }> };

// Сторінка залежить від того, хто дивиться (автор бачить і закритий запит без дозволу), тож не кешується між людьми.
export const dynamic = "force-dynamic";

// Заголовок і сторінка беруть той самий запит: один похід у базу.
const load = cache(async (id: string) =>
  getPublicRequest(id, (await getSessionUser())?.id ?? null),
);

// Битий відсоток в адресі не має давати 500: такий id просто не знайдеться.
const idOf = async (params: Props["params"]) => {
  const { id } = await params;
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
};

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const id = await idOf(params);
  const request = await load(id);
  if (!request)
    return {
      title: "Запит не знайдено",
      robots: { index: false, follow: false },
    };
  const title = `${requestTitle(request.text)} · Findlyfy`;
  const description = requestDescription(request.text);
  const url = `${siteUrl()}/zapyt/${encodeURIComponent(request.id)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    // Свій openGraph замінює кореневий цілком, тож картинку для превью повторюємо.
    openGraph: {
      title,
      description,
      type: "article",
      locale: "uk_UA",
      siteName: "Findlyfy",
      url,
      images: ["/og.png"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
    // Закритий запит і сторінка лише для автора в індекс не йдуть; решту вирішує загальний перемикач (lib/seo/indexing.ts).
    // Ключа `robots` без значення не лишаємо: `undefined` стер би noindex із кореневого layout.
    ...(request.status === "closed" || !request.shared
      ? { robots: { index: false, follow: false } }
      : {}),
  };
};

const RequestPage = async ({ params }: Props) => {
  const request = await load(await idOf(params));
  if (!request) notFound();
  return <RequestView request={request} />;
};

export default RequestPage;
