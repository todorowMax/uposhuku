// app/(site)/poslugy/[tag]/[city]/page.tsx
//
// Каталог послуги в місті: «Розробка лендингів у Львові». Логіка в components/catalog-page/catalog-route.tsx.

import { CatalogRoute, catalogMetadata, type CatalogRouteTypes } from "@/components/catalog-page/catalog-route";

export const dynamic = "force-dynamic";

export const generateMetadata = catalogMetadata;

const CatalogCityPage = ({ params }: CatalogRouteTypes.Props) => <CatalogRoute params={params} />;

export default CatalogCityPage;
