import { defineConfig } from "drizzle-kit";

// Міграції застосовує wrangler (`npm run db:migrate:local`), drizzle-kit лише
// генерує SQL зі схеми: `npm run db:generate`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./db/migrations",
});
