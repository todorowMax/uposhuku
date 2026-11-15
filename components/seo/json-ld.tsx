import { serializeJsonLd, type JsonLd as JsonLdData } from "@/lib/seo/json-ld";

export namespace JsonLdTypes {
  export type Props = { data: JsonLdData };
}

/** Структуровані дані в HTML сторінки; серверний компонент. */
export const JsonLd = ({ data }: JsonLdTypes.Props) => (
  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
);
