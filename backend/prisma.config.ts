import { defineConfig } from "prisma/config";

// En local carga backend/.env (o el archivo indicado en ENV_FILE, p. ej. .env.production
// para migrar producción a mano). En Vercel no existe y las variables vienen del entorno.
try {
  process.loadEnvFile(process.env.ENV_FILE ?? ".env");
} catch {
  // sin .env: se usan las variables del entorno
}

// Las migraciones usan la conexión directa (sin pooler) de Neon.
// `prisma generate` no necesita conexión, por eso el valor puede faltar.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
});
