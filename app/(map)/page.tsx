import type { Metadata } from "next";

// Канонічна адреса головної (metadataBase з кореневого layout робить її абсолютною).
export const metadata: Metadata = { alternates: { canonical: "/" } };

// Головна: усе малює layout, карта над нею. Видимого заголовка немає, але він потрібен скрінрідеру й пошуку.
const HomePage = () => <h1 className="sr-only">Findlyfy: виконавці й запити на карті України</h1>;

export default HomePage;
