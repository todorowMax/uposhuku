// app/(site)/poslugy/[tag]/page.tsx
//
// Каталог послуги: «Розробка лендингів». Поза групою (map): без карти й MapLibre. Логіка в components/catalog-page/catalog-route.tsx.

import { CatalogRoute, catalogMetadata, type CatalogRouteTypes } from "@/components/catalog-page/catalog-route";

// Дані беремо з бази під час запиту; адреса сайту відома лише воркеру.
export const dynamic = "force-dynamic";

export const generateMetadata = catalogMetadata;

const CatalogTagPage = ({ params }: CatalogRouteTypes.Props) => <CatalogRoute params={params} />;

export default CatalogTagPage;
