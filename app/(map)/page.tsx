import type { Metadata } from "next";

// Канонічна адреса головної (metadataBase з кореневого layout робить її абсолютною).
export const metadata: Metadata = { alternates: { canonical: "/" } };

// Головна: усе малює layout, карта над нею.
const HomePage = () => null;

export default HomePage;
