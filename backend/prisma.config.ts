import { defineConfig } from "prisma/config";

// Las migraciones usan la conexión directa (sin pooler) de Neon.
// `prisma generate` no necesita conexión, por eso el valor puede faltar.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DIRECT_DATABASE_URL ?? "" },
});
